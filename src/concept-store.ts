import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const STORE_VERSION = 1 as const;
const STORE_FILENAME = ".concepts.json";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CONCEPT_LIMITS = Object.freeze({
  entries: 1_000,
  termLength: 160,
  aliases: 24,
  aliasLength: 160,
  summaryLength: 1_200,
  autoSummaryLength: 360,
  contentLength: 100_000,
  userQuestionLength: 4_000,
  metadataLength: 600,
  depth: 99,
  searchQueryLength: 600,
  searchResults: 200,
});

export interface ConceptEntry {
  id: string;
  term: string;
  aliases: string[];
  summary: string;
  content: string;
  userQuestion?: string;
  depth?: number;
  roadmapId?: string;
  chapterId?: string;
  chapterTitle?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConceptCreateInput {
  term: string;
  aliases?: readonly string[];
  summary?: string;
  content: string;
  userQuestion?: string;
  depth?: number;
  roadmapId?: string;
  chapterId?: string;
  chapterTitle?: string;
}

export interface ConceptUpdateInput {
  term?: string;
  aliases?: readonly string[] | null;
  summary?: string | null;
  content?: string;
  userQuestion?: string | null;
  depth?: number | null;
  roadmapId?: string | null;
  chapterId?: string | null;
  chapterTitle?: string | null;
}

export type ConceptMatchedField =
  | "term"
  | "aliases"
  | "summary"
  | "content"
  | "userQuestion"
  | "chapterTitle";

export interface ConceptSearchResult {
  concept: ConceptEntry;
  score: number;
  matchedFields: ConceptMatchedField[];
}

export interface ConceptWriteResult {
  concept: ConceptEntry;
  /** false면 정규화된 같은 term을 찾아 기존 항목을 갱신한 것이다. */
  created: boolean;
}

export interface ConceptSearchOptions {
  /** 반환할 최대 결과 수. 1..CONCEPT_LIMITS.searchResults */
  limit?: number;
}

interface ConceptStoreFile {
  version: typeof STORE_VERSION;
  entries: ConceptEntry[];
}

export type ConceptStoreErrorCode =
  | "invalid_input"
  | "limit_exceeded"
  | "duplicate_term"
  | "corrupt_store";

export class ConceptStoreError extends Error {
  constructor(
    readonly code: ConceptStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ConceptStoreError";
  }
}

function invalid(message: string): never {
  throw new ConceptStoreError("invalid_input", message);
}

function overLimit(message: string): never {
  throw new ConceptStoreError("limit_exceeded", message);
}

function charLength(value: string): number {
  return Array.from(value).length;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string") invalid(`${field} must be a string`);
  return value;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function boundedText(
  value: unknown,
  field: string,
  maxLength: number,
  { required = false, markdown = false } = {},
): string | undefined {
  if (value == null) {
    if (required) invalid(`${field} is required`);
    return undefined;
  }
  const source = normalizeLineEndings(assertString(value, field));
  if (charLength(source) > maxLength) {
    overLimit(`${field} exceeds ${maxLength} characters`);
  }
  const normalized = markdown
    ? source.trim()
    : source.replace(/\s+/g, " ").trim();
  if (!normalized) {
    if (required) invalid(`${field} is required`);
    return undefined;
  }
  return normalized;
}

function boundedDepth(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > CONCEPT_LIMITS.depth
  ) {
    invalid(`depth must be an integer between 0 and ${CONCEPT_LIMITS.depth}`);
  }
  return value;
}

/**
 * 검색/중복 판정용 정규형. 저장할 표기는 유지하고 비교할 때만 NFKC, 소문자,
 * 공백·dash 정규화를 적용한다.
 */
export function normalizeConceptTerm(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("und");
}

function lettersAndDigits(value: string): string {
  return value.normalize("NFKC").replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function initials(value: string): string {
  return value
    .normalize("NFKC")
    .split(/[^\p{Letter}\p{Number}]+/gu)
    .filter(Boolean)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toLocaleLowerCase("und");
}

function isShortAlias(value: string): boolean {
  const compact = lettersAndDigits(value);
  if (compact.length < 2 || compact.length > 12) return false;
  const uppercase = Array.from(compact).filter((char) => /\p{Lu}/u.test(char));
  const hasDigit = /\p{Number}/u.test(compact);
  // `CoW`, `TCP`, `K8s` 같은 약어만. `Big O`처럼 띄어 쓴 일반 문구는 제외한다.
  return !/\s/u.test(value) && (uppercase.length >= 2 || (uppercase.length >= 1 && hasDigit));
}

function scriptsDiffer(left: string, right: string): boolean {
  const leftHangul = /\p{Script=Hangul}/u.test(left);
  const rightHangul = /\p{Script=Hangul}/u.test(right);
  const leftLatin = /\p{Script=Latin}/u.test(left);
  const rightLatin = /\p{Script=Latin}/u.test(right);
  return (leftHangul && rightLatin) || (leftLatin && rightHangul);
}

function looksLikeAliasPair(term: string, alias: string): boolean {
  const shortTerm = isShortAlias(term);
  const shortAlias = isShortAlias(alias);
  const termCompact = lettersAndDigits(term).toLocaleLowerCase("und");
  const aliasCompact = lettersAndDigits(alias).toLocaleLowerCase("und");
  if (shortAlias && initials(term) === aliasCompact) return true;
  if (shortTerm && initials(alias) === termCompact) return true;
  // 약어의 확장형은 HyperText처럼 한 단어 안에서 두 글자를 취하거나 `+`를
  // 단어로 풀기도 해 단순 첫 글자 비교가 항상 맞지 않는다. 짧은 명시적 약어
  // 뒤에 둘 이상의 단어가 붙은 경우는 보수적인 trailing alias 문법으로 본다.
  if (
    shortTerm &&
    alias.split(/[^\p{Letter}\p{Number}]+/gu).filter(Boolean).length >= 2
  ) {
    return true;
  }
  return scriptsDiffer(term, alias);
}

/**
 * `TCP (Transmission Control Protocol)`처럼 **끝에 별도로 붙인** 괄호만 alias로
 * 분리한다. 함수/시스템콜/복잡도 표기인 `read(2)`, `Promise.all()`, `O(n)`,
 * `Big O (n log n)`은 개념명 자체이므로 보수적으로 원문을 유지한다.
 */
export function extractTermAliases(value: string): {
  term: string;
  aliases: string[];
} {
  const raw = boundedText(
    value,
    "term",
    CONCEPT_LIMITS.termLength,
    { required: true },
  )!;
  const normalized = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  // 단일 trailing 괄호만 후보로 보되, 괄호 앞 공백이 없는 표기는 서로 다른
  // 문자권의 번역 alias(옵티마이저(Optimizer))일 때만 분리한다. 따라서
  // `read(2)`/`O(n)`/`Promise.all()`은 개념명 자체로 보존된다.
  const trailing = normalized.match(/^(.+?)(\s*)\(([^()]*)\)$/u);
  const base = trailing?.[1]?.trim() ?? normalized;
  const gap = trailing?.[2] ?? "";
  const candidates = (trailing?.[3] ?? "")
    .split(/[,;|]/u)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const canExtract =
    candidates.length > 0 &&
    candidates.some((alias) => looksLikeAliasPair(base, alias)) &&
    (gap.length > 0 || candidates.some((alias) => scriptsDiffer(base, alias)));
  const term = canExtract ? base : normalized;
  const aliases = canExtract ? candidates : [];
  if (charLength(term) > CONCEPT_LIMITS.termLength) {
    overLimit(`term exceeds ${CONCEPT_LIMITS.termLength} characters`);
  }
  return { term, aliases: uniqueAliases(aliases, term) };
}

function uniqueAliases(values: readonly unknown[], term: string): string[] {
  if (values.length > CONCEPT_LIMITS.aliases) {
    overLimit(`aliases exceeds ${CONCEPT_LIMITS.aliases} items`);
  }
  const seen = new Set([normalizeConceptTerm(term)]);
  const aliases: string[] = [];
  for (const value of values) {
    const alias = boundedText(
      value,
      "alias",
      CONCEPT_LIMITS.aliasLength,
    );
    if (!alias) continue;
    const key = normalizeConceptTerm(alias);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }
  if (aliases.length > CONCEPT_LIMITS.aliases) {
    overLimit(`aliases exceeds ${CONCEPT_LIMITS.aliases} items`);
  }
  return aliases;
}

function mergeAliases(term: string, ...groups: readonly string[][]): string[] {
  const combined = groups.flat();
  // Each individual request is bounded before merge. The merged stored value is
  // independently bounded as well so repeated duplicate creates cannot grow forever.
  if (combined.length > CONCEPT_LIMITS.aliases * Math.max(1, groups.length)) {
    overLimit(`aliases exceeds ${CONCEPT_LIMITS.aliases} items`);
  }
  const seen = new Set([normalizeConceptTerm(term)]);
  const result: string[] = [];
  for (const raw of combined) {
    const alias = boundedText(raw, "alias", CONCEPT_LIMITS.aliasLength);
    if (!alias) continue;
    const key = normalizeConceptTerm(alias);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(alias);
    if (result.length > CONCEPT_LIMITS.aliases) {
      overLimit(`aliases exceeds ${CONCEPT_LIMITS.aliases} items`);
    }
  }
  return result;
}

/** Markdown을 검색/카드에 적합한 한 줄 plain-text 요약으로 바꾼다. */
export function stripMarkdownSummary(
  markdown: string,
  maxLength: number = CONCEPT_LIMITS.autoSummaryLength,
): string {
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    invalid("summary maxLength must be a positive integer");
  }
  const source = String(markdown ?? "").replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, "");
  const plain = source
    .replace(/```[^\n]*\n([\s\S]*?)```/g, " $1 ")
    .replace(/~~~[^\n]*\n([\s\S]*?)~~~/g, " $1 ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__|~~)(.*?)\1/g, "$2")
    .replace(/(^|[\s(])([*_])([^*_]+)\2(?=$|[\s).,!?:;])/g, "$1$3")
    .replace(/\s+/g, " ")
    .trim();
  if (charLength(plain) <= maxLength) return plain;
  const chars = Array.from(plain);
  return `${chars.slice(0, Math.max(1, maxLength - 1)).join("").trimEnd()}…`;
}

function vaultRoot(vaultPath: string): string {
  const raw = boundedText(vaultPath, "vaultPath", 4_096, { required: true })!;
  return path.resolve(raw);
}

function spiralSubdir(): string {
  const configured = process.env.SPIRAL_VAULT_SUBDIR?.trim() || "spiral-buddy";
  if (path.isAbsolute(configured)) invalid("SPIRAL_VAULT_SUBDIR must be relative");
  const parts = configured.split(/[\\/]+/);
  if (parts.some((part) => part === "..")) {
    invalid("SPIRAL_VAULT_SUBDIR cannot leave the vault");
  }
  return configured;
}

/** 실제 workspace별 concept JSON 경로. */
export function conceptStorePath(vaultPath: string): string {
  const root = vaultRoot(vaultPath);
  const target = path.resolve(root, spiralSubdir(), STORE_FILENAME);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    invalid("concept store must stay inside the vault");
  }
  return target;
}

/**
 * Lexical `..` 방어만으로는 vault 내부 symlink가 외부 디렉터리를 가리키는
 * 경우를 막지 못한다. 사용자가 지정한 vault root 자체는 신뢰하되, 그 아래
 * concept 저장 경로의 기존 구성요소가 symlink이면 읽기/쓰기를 거부한다.
 */
async function checkedConceptStorePath(vaultPath: string): Promise<string> {
  const root = vaultRoot(vaultPath);
  const target = conceptStorePath(vaultPath);
  const parentRelative = path.relative(root, path.dirname(target));
  let cursor = root;
  for (const part of parentRelative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) invalid("concept store path cannot contain symlinks");
      if (!stat.isDirectory()) invalid("concept store parent must be a directory");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  try {
    const targetStat = await fs.lstat(target);
    if (targetStat.isSymbolicLink()) invalid("concept store file cannot be a symlink");
    if (!targetStat.isFile()) invalid("concept store must be a regular file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return target;
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function isStoredText(
  value: unknown,
  maxLength: number,
  required = false,
): value is string {
  return (
    typeof value === "string" &&
    charLength(value) <= maxLength &&
    (!required || value.trim().length > 0)
  );
}

function isConceptEntry(value: unknown): value is ConceptEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ConceptEntry>;
  return (
    typeof entry.id === "string" &&
    UUID_PATTERN.test(entry.id) &&
    isStoredText(entry.term, CONCEPT_LIMITS.termLength, true) &&
    Array.isArray(entry.aliases) &&
    entry.aliases.length <= CONCEPT_LIMITS.aliases &&
    entry.aliases.every((alias) =>
      isStoredText(alias, CONCEPT_LIMITS.aliasLength, true),
    ) &&
    isStoredText(entry.summary, CONCEPT_LIMITS.summaryLength, true) &&
    isStoredText(entry.content, CONCEPT_LIMITS.contentLength, true) &&
    (entry.userQuestion == null ||
      isStoredText(entry.userQuestion, CONCEPT_LIMITS.userQuestionLength, true)) &&
    (entry.depth == null ||
      (Number.isInteger(entry.depth) && entry.depth >= 0 && entry.depth <= CONCEPT_LIMITS.depth)) &&
    (entry.roadmapId == null ||
      isStoredText(entry.roadmapId, CONCEPT_LIMITS.metadataLength, true)) &&
    (entry.chapterId == null ||
      isStoredText(entry.chapterId, CONCEPT_LIMITS.metadataLength, true)) &&
    (entry.chapterTitle == null ||
      isStoredText(entry.chapterTitle, CONCEPT_LIMITS.metadataLength, true)) &&
    isIsoDate(entry.createdAt) &&
    isIsoDate(entry.updatedAt)
  );
}

function emptyStore(): ConceptStoreFile {
  return { version: STORE_VERSION, entries: [] };
}

async function readStore(vaultPath: string): Promise<ConceptStoreFile> {
  const file = await checkedConceptStorePath(vaultPath);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ConceptStoreFile>;
    const ids = new Set<string>();
    const terms = new Set<string>();
    if (
      parsed.version !== STORE_VERSION ||
      !Array.isArray(parsed.entries) ||
      parsed.entries.length > CONCEPT_LIMITS.entries ||
      !parsed.entries.every((entry) => {
        if (!isConceptEntry(entry)) return false;
        const term = normalizeConceptTerm(entry.term);
        if (!term || ids.has(entry.id) || terms.has(term)) return false;
        ids.add(entry.id);
        terms.add(term);
        return true;
      })
    ) {
      throw new Error("invalid schema");
    }
    return { version: STORE_VERSION, entries: parsed.entries };
  } catch (error) {
    if (error instanceof ConceptStoreError) throw error;
    throw new ConceptStoreError(
      "corrupt_store",
      `invalid concept store: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function writeStore(vaultPath: string, store: ConceptStoreFile): Promise<void> {
  const target = await checkedConceptStorePath(vaultPath);
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });
  // mkdir 전후에 경로를 확인해 기존 symlink뿐 아니라 생성 중 바뀐 경로도
  // 가능한 범위에서 차단한다(Node의 openat/O_NOFOLLOW 미지원 범위는 제외).
  await checkedConceptStorePath(vaultPath);
  const tmp = path.join(dir, `${STORE_FILENAME}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, {
      encoding: "utf-8",
      flag: "wx",
    });
    await fs.rename(tmp, target);
  } catch (error) {
    await fs.unlink(tmp).catch(() => {});
    throw error;
  }
}

const storeLocks = new Map<string, Promise<void>>();

async function withStoreLock<T>(vaultPath: string, task: () => Promise<T>): Promise<T> {
  const key = conceptStorePath(vaultPath);
  const prior = storeLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chain = prior.then(() => current);
  storeLocks.set(key, chain);
  await prior;
  try {
    return await task();
  } finally {
    release();
    if (storeLocks.get(key) === chain) storeLocks.delete(key);
  }
}

function cloneConcept(entry: ConceptEntry): ConceptEntry {
  return { ...entry, aliases: [...entry.aliases] };
}

function nextTimestamp(previous?: string): string {
  const now = Date.now();
  const prior = previous ? Date.parse(previous) : Number.NaN;
  return new Date(Number.isFinite(prior) && now <= prior ? prior + 1 : now).toISOString();
}

function createFields(input: ConceptCreateInput): Omit<ConceptEntry, "id" | "createdAt" | "updatedAt"> {
  if (!input || typeof input !== "object") invalid("concept input is required");
  const extracted = extractTermAliases(input.term);
  const explicitAliases = input.aliases ?? [];
  if (!Array.isArray(explicitAliases)) invalid("aliases must be an array");
  const aliases = mergeAliases(
    extracted.term,
    extracted.aliases,
    uniqueAliases(explicitAliases, extracted.term),
  );
  const content = boundedText(
    input.content,
    "content",
    CONCEPT_LIMITS.contentLength,
    { required: true, markdown: true },
  )!;
  const rawSummary = input.summary;
  if (rawSummary != null && charLength(assertString(rawSummary, "summary")) > CONCEPT_LIMITS.summaryLength) {
    overLimit(`summary exceeds ${CONCEPT_LIMITS.summaryLength} characters`);
  }
  const summary = rawSummary
    ? stripMarkdownSummary(rawSummary, CONCEPT_LIMITS.summaryLength)
    : stripMarkdownSummary(content, CONCEPT_LIMITS.autoSummaryLength);
  if (!summary) invalid("summary could not be derived from content");
  return {
    term: extracted.term,
    aliases,
    summary,
    content,
    userQuestion: boundedText(
      input.userQuestion,
      "userQuestion",
      CONCEPT_LIMITS.userQuestionLength,
    ),
    depth: boundedDepth(input.depth),
    roadmapId: boundedText(input.roadmapId, "roadmapId", CONCEPT_LIMITS.metadataLength),
    chapterId: boundedText(input.chapterId, "chapterId", CONCEPT_LIMITS.metadataLength),
    chapterTitle: boundedText(
      input.chapterTitle,
      "chapterTitle",
      CONCEPT_LIMITS.metadataLength,
    ),
  };
}

export async function listConcepts(vaultPath: string): Promise<ConceptEntry[]> {
  const store = await readStore(vaultPath);
  return store.entries
    .map(cloneConcept)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.term.localeCompare(b.term));
}

export async function getConcept(
  vaultPath: string,
  id: string,
): Promise<ConceptEntry | null> {
  const safeId = boundedText(id, "id", 200, { required: true })!;
  const entry = (await readStore(vaultPath)).entries.find((item) => item.id === safeId);
  return entry ? cloneConcept(entry) : null;
}

/**
 * 새 concept를 만들되 정규화된 term이 이미 있으면 같은 id/createdAt을 유지하며
 * 내용을 갱신한다. 기존 aliases와 새 aliases는 합쳐 학습 맥락을 잃지 않는다.
 */
export async function upsertConcept(
  vaultPath: string,
  input: ConceptCreateInput,
): Promise<ConceptWriteResult> {
  const fields = createFields(input);
  return withStoreLock(vaultPath, async () => {
    const store = await readStore(vaultPath);
    const termKey = normalizeConceptTerm(fields.term);
    const index = store.entries.findIndex(
      (entry) => normalizeConceptTerm(entry.term) === termKey,
    );
    let entry: ConceptEntry;
    const created = index < 0;
    if (!created) {
      const current = store.entries[index]!;
      entry = {
        ...current,
        ...fields,
        aliases: mergeAliases(fields.term, current.aliases, fields.aliases),
        userQuestion: fields.userQuestion ?? current.userQuestion,
        depth: fields.depth ?? current.depth,
        roadmapId: fields.roadmapId ?? current.roadmapId,
        chapterId: fields.chapterId ?? current.chapterId,
        chapterTitle: fields.chapterTitle ?? current.chapterTitle,
        updatedAt: nextTimestamp(current.updatedAt),
      };
      store.entries[index] = entry;
    } else {
      if (store.entries.length >= CONCEPT_LIMITS.entries) {
        overLimit(`concept store exceeds ${CONCEPT_LIMITS.entries} entries`);
      }
      const now = nextTimestamp();
      entry = {
        id: randomUUID(),
        ...fields,
        createdAt: now,
        updatedAt: now,
      };
      store.entries.push(entry);
    }
    await writeStore(vaultPath, store);
    return { concept: cloneConcept(entry), created };
  });
}

/** 단순 CRUD 호출자를 위한 호환 API. 신규 여부가 필요하면 upsertConcept을 쓴다. */
export async function createConcept(
  vaultPath: string,
  input: ConceptCreateInput,
): Promise<ConceptEntry> {
  return (await upsertConcept(vaultPath, input)).concept;
}

export async function updateConcept(
  vaultPath: string,
  id: string,
  patch: ConceptUpdateInput,
): Promise<ConceptEntry | null> {
  const safeId = boundedText(id, "id", 200, { required: true })!;
  if (!patch || typeof patch !== "object") invalid("concept patch is required");
  return withStoreLock(vaultPath, async () => {
    const store = await readStore(vaultPath);
    const index = store.entries.findIndex((entry) => entry.id === safeId);
    if (index < 0) return null;
    const current = store.entries[index]!;
    const extracted = patch.term == null
      ? { term: current.term, aliases: [] as string[] }
      : extractTermAliases(patch.term);
    const duplicate = store.entries.find(
      (entry) =>
        entry.id !== safeId &&
        normalizeConceptTerm(entry.term) === normalizeConceptTerm(extracted.term),
    );
    if (duplicate) {
      throw new ConceptStoreError(
        "duplicate_term",
        `concept term already exists: ${duplicate.term}`,
      );
    }
    let aliases = current.aliases;
    if (patch.aliases !== undefined || patch.term !== undefined) {
      if (patch.aliases != null && !Array.isArray(patch.aliases)) {
        invalid("aliases must be an array or null");
      }
      const explicit = patch.aliases == null
        ? patch.aliases === null
          ? []
          : current.aliases
        : uniqueAliases(patch.aliases, extracted.term);
      aliases = mergeAliases(extracted.term, explicit, extracted.aliases);
    }
    const content = patch.content === undefined
      ? current.content
      : boundedText(
          patch.content,
          "content",
          CONCEPT_LIMITS.contentLength,
          { required: true, markdown: true },
        )!;
    if (
      typeof patch.summary === "string" &&
      charLength(patch.summary) > CONCEPT_LIMITS.summaryLength
    ) {
      overLimit(`summary exceeds ${CONCEPT_LIMITS.summaryLength} characters`);
    }
    const summary = patch.summary === undefined
      ? current.summary
      : patch.summary === null
        ? stripMarkdownSummary(content, CONCEPT_LIMITS.autoSummaryLength)
        : stripMarkdownSummary(patch.summary, CONCEPT_LIMITS.summaryLength);
    if (!summary) invalid("summary could not be derived from content");
    const entry: ConceptEntry = {
      ...current,
      term: extracted.term,
      aliases,
      summary,
      content,
      userQuestion: patch.userQuestion === undefined
        ? current.userQuestion
        : boundedText(
            patch.userQuestion,
            "userQuestion",
            CONCEPT_LIMITS.userQuestionLength,
          ),
      depth: patch.depth === undefined ? current.depth : boundedDepth(patch.depth),
      roadmapId: patch.roadmapId === undefined
        ? current.roadmapId
        : boundedText(patch.roadmapId, "roadmapId", CONCEPT_LIMITS.metadataLength),
      chapterId: patch.chapterId === undefined
        ? current.chapterId
        : boundedText(patch.chapterId, "chapterId", CONCEPT_LIMITS.metadataLength),
      chapterTitle: patch.chapterTitle === undefined
        ? current.chapterTitle
        : boundedText(
            patch.chapterTitle,
            "chapterTitle",
            CONCEPT_LIMITS.metadataLength,
          ),
      updatedAt: nextTimestamp(current.updatedAt),
    };
    store.entries[index] = entry;
    await writeStore(vaultPath, store);
    return cloneConcept(entry);
  });
}

export async function deleteConcept(vaultPath: string, id: string): Promise<boolean> {
  const safeId = boundedText(id, "id", 200, { required: true })!;
  return withStoreLock(vaultPath, async () => {
    const store = await readStore(vaultPath);
    const next = store.entries.filter((entry) => entry.id !== safeId);
    if (next.length === store.entries.length) return false;
    await writeStore(vaultPath, { version: STORE_VERSION, entries: next });
    return true;
  });
}

function searchText(value: string): string {
  return normalizeConceptTerm(value)
    .replace(/[^\p{Script=Hangul}\p{Script=Latin}\p{Number}+#._-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return searchText(value).match(/[a-z0-9+#._-]+|[가-힣]+/gu) ?? [];
}

function compactSearchText(value: string): string {
  return searchText(value).replace(/[^\p{Script=Hangul}\p{Script=Latin}\p{Number}]+/gu, "");
}

function ngrams(value: string): Set<string> {
  const chars = Array.from(compactSearchText(value));
  const grams = new Set<string>();
  if (chars.length < 2) {
    if (chars[0]) grams.add(chars[0]);
    return grams;
  }
  for (const width of [2, 3]) {
    if (chars.length < width) continue;
    for (let index = 0; index <= chars.length - width; index += 1) {
      grams.add(chars.slice(index, index + width).join(""));
    }
  }
  return grams;
}

function diceSimilarity(left: string, right: string): number {
  const a = ngrams(left);
  const b = ngrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const gram of a) if (b.has(gram)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

function tokenOverlap(queryTokens: readonly string[], value: string): number {
  if (queryTokens.length === 0) return 0;
  const valueTokens = new Set(tokenize(value));
  let hits = 0;
  for (const token of new Set(queryTokens)) {
    if (valueTokens.has(token)) hits += 1;
  }
  return hits / new Set(queryTokens).size;
}

interface FieldWeights {
  exact: number;
  prefix: number;
  phrase: number;
  token: number;
  ngram: number;
}

function fieldScore(
  query: string,
  queryTokens: readonly string[],
  value: string | undefined,
  weights: FieldWeights,
): number {
  if (!value) return 0;
  const q = searchText(query);
  const candidate = searchText(value);
  if (!q || !candidate) return 0;
  let score = 0;
  if (candidate === q) score += weights.exact;
  else if (candidate.startsWith(q)) score += weights.prefix;
  else if (q.startsWith(candidate) || q.includes(candidate) || candidate.includes(q)) {
    score += weights.phrase;
  }
  const overlap = tokenOverlap(queryTokens, value);
  score += overlap * weights.token;
  const similarity = diceSimilarity(q, candidate);
  if (similarity >= 0.16) score += similarity * weights.ngram;
  return score;
}

const FIELD_WEIGHTS: Record<Exclude<ConceptMatchedField, "aliases">, FieldWeights> = {
  term: { exact: 140, prefix: 105, phrase: 88, token: 50, ngram: 36 },
  summary: { exact: 45, prefix: 34, phrase: 30, token: 28, ngram: 16 },
  content: { exact: 30, prefix: 24, phrase: 22, token: 18, ngram: 10 },
  userQuestion: { exact: 34, prefix: 26, phrase: 24, token: 20, ngram: 12 },
  chapterTitle: { exact: 32, prefix: 24, phrase: 20, token: 18, ngram: 12 },
};

const ALIAS_WEIGHTS: FieldWeights = {
  exact: 125,
  prefix: 94,
  phrase: 78,
  token: 44,
  ngram: 32,
};

// 로컬 live 검색은 입력마다 전체 보관함을 다시 점수화한다. 저장 본문은 항목당
// 100k까지 허용되므로 그대로 n-gram을 만들면 1,000개 보관함에서 한 번의
// 키 입력이 수천만~수억 문자를 반복 순회한다. 긴 필드는 시작·중간·끝을 같은
// 비율로 샘플링해 검색성을 유지하면서 항목당 연산량을 고정한다.
const SEARCH_FIELD_CHAR_BUDGET = Object.freeze({
  term: CONCEPT_LIMITS.termLength,
  summary: CONCEPT_LIMITS.summaryLength,
  content: 6_000,
  userQuestion: 2_000,
  chapterTitle: CONCEPT_LIMITS.metadataLength,
});

function boundedSearchField(value: string | undefined, budget: number): string | undefined {
  if (!value || value.length <= budget) return value;
  const windowSize = Math.max(1, Math.floor(budget / 3));
  const middleStart = Math.max(0, Math.floor((value.length - windowSize) / 2));
  return [
    value.slice(0, windowSize),
    value.slice(middleStart, middleStart + windowSize),
    value.slice(-windowSize),
  ].join(" ");
}

function rankConcept(entry: ConceptEntry, query: string): ConceptSearchResult {
  const queryTokens = tokenize(query);
  const matchedFields: ConceptMatchedField[] = [];
  let score = 0;
  for (const field of [
    "term",
    "summary",
    "content",
    "userQuestion",
    "chapterTitle",
  ] as const) {
    const fieldValue = boundedSearchField(
      entry[field],
      SEARCH_FIELD_CHAR_BUDGET[field],
    );
    const contribution = fieldScore(query, queryTokens, fieldValue, FIELD_WEIGHTS[field]);
    if (contribution > 0) {
      score += contribution;
      matchedFields.push(field);
    }
  }
  let aliasScore = 0;
  for (const alias of entry.aliases) {
    aliasScore = Math.max(
      aliasScore,
      fieldScore(query, queryTokens, alias, ALIAS_WEIGHTS),
    );
  }
  if (aliasScore > 0) {
    score += aliasScore;
    matchedFields.push("aliases");
  }
  return {
    concept: cloneConcept(entry),
    score: Math.round(score * 1_000) / 1_000,
    matchedFields,
  };
}

function normalizedSearchLimit(limit: number | undefined): number {
  if (limit === undefined) return 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > CONCEPT_LIMITS.searchResults) {
    invalid(`search limit must be between 1 and ${CONCEPT_LIMITS.searchResults}`);
  }
  return limit;
}

/** 메모리의 entry 목록을 lexical hybrid score로 정렬하는 순수 함수. */
export function rankConcepts(
  entries: readonly ConceptEntry[],
  query: string,
  options: ConceptSearchOptions = {},
): ConceptSearchResult[] {
  const source = assertString(query, "query");
  if (charLength(source) > CONCEPT_LIMITS.searchQueryLength) {
    overLimit(`query exceeds ${CONCEPT_LIMITS.searchQueryLength} characters`);
  }
  const limit = normalizedSearchLimit(options.limit);
  return entries
    .map((entry) => rankConcept(entry, source))
    .filter((result) => result.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.concept.updatedAt.localeCompare(a.concept.updatedAt) ||
        a.concept.term.localeCompare(b.concept.term),
    )
    .slice(0, limit);
}

export async function searchConcepts(
  vaultPath: string,
  query: string,
  options: ConceptSearchOptions = {},
): Promise<ConceptSearchResult[]> {
  return rankConcepts(await listConcepts(vaultPath), query, options);
}
