import type { Chapter, Roadmap } from "./roadmap.js";
import type { SpiralNote } from "./vault.js";
import { noteBelongsToRoadmap, noteMatchesChapter } from "./vault.js";
import { completeOnce, type ClaudeClient } from "./claude.js";
import { extractSectionBody } from "./note-writer.js";
import { safeJsonParse } from "./text-utils.js";

/** note-writer가 노트에 태그로 부여하는 6개 cross-cutting 원리. */
const PRINCIPLE_SET = new Set([
  "representation",
  "prediction",
  "binding",
  "self-reference",
  "embodiment",
  "emergence",
]);

export interface SpiralSuggestion {
  recommendedChapterId: string | null;
  rationale: string;
  related: SpiralNote[];
  mode: "first-time" | "deeper-layer" | "next-chapter" | "cross-link";
}

const SUGGEST_SYSTEM = `You analyze a learner's roadmap (study of mind/brain/consciousness) and their past spiral-buddy notes, then suggest what to study next.

You output STRICT JSON only, no prose, no markdown fences, matching this shape:
{
  "recommendedChapterId": string | null,
  "mode": "first-time" | "deeper-layer" | "next-chapter" | "cross-link",
  "rationale": string,
  "relatedChapterIds": string[]
}

This domain spirals through: 메커니즘(3인칭) → 설명적 간극 → 1인칭 경험. Each note is tagged "gap-marked" (the explanatory gap was honestly confronted) or "gap-open" (mechanism noted but the gap not yet faced), and may carry cross-cutting principles (표상/예측/통합/자기참조/체화/창발).

Principles for choosing:
- No prior notes → mode "first-time", earliest chapter (메커니즘 바닥부터).
- A topic studied only at depth 1, OR whose prior note is "gap-open" → mode "deeper-layer", recommend the SAME chapter again so the explanatory gap actually gets confronted.
- Mechanism + gap solidly handled ("gap-marked") on earlier chapters → mode "next-chapter", advance.
- A recurring principle links a distant chapter to recent learning → mode "cross-link" (레이어 횡단 회수).
- Choose recommendedChapterId from the provided list. Return null only if nothing fits.
- "relatedChapterIds" must reference items from the provided notes.
- Keep rationale under 280 chars, in the notes' language (Korean if Korean). Frame it in the 메커니즘→간극→경험 spirit — e.g., "X의 메커니즘은 잡았는데 간극은 아직 안 짚었어. 한 층 더 들어가 '그 느낌'이 어디서 빠지는지 보자."`;

export async function suggestNext(
  client: ClaudeClient,
  roadmap: Roadmap,
  chapters: Chapter[],
  allNotes: SpiralNote[],
): Promise<SpiralSuggestion> {
  // 이 로드맵에 속하는 노트만 추리기
  const notes = allNotes.filter((n) =>
    noteBelongsToRoadmap(n, { roadmapId: roadmap.id, roadmapName: roadmap.name }),
  );

  if (chapters.length === 0) {
    return {
      recommendedChapterId: null,
      rationale: "No chapters found in roadmap.",
      related: [],
      mode: "first-time",
    };
  }

  if (notes.length === 0) {
    const first = chapters[0]!;
    return {
      recommendedChapterId: first.id,
      rationale: `${roadmap.name} 로드맵의 이전 학습 기록이 없어. 첫 챕터부터 시작하자.`,
      related: [],
      mode: "first-time",
    };
  }

  const chapterIndex = chapters
    .map((c) => `- id: "${c.id}" · title: "${c.title}"`)
    .join("\n");

  const noteIndex = notes
    .slice(0, 30)
    .map((n) => {
      const gapMarked = extractSectionBody(n.body, "설명적 간극")
        ? "gap-marked"
        : "gap-open";
      const principles = (n.tags ?? []).filter((t) => PRINCIPLE_SET.has(t));
      const princStr = principles.length
        ? ` · principles: ${principles.join(",")}`
        : "";
      return `- chapter_id: "${n.chapterId ?? "?"}" · topic: "${n.topic}" · depth: ${n.depth} · ${gapMarked}${princStr} · date: ${n.date} · summary: ${n.summary || "(none)"}`;
    })
    .join("\n");

  const userMsg = `# Roadmap: ${roadmap.name}
Chapters:
${chapterIndex}

# Past spiral-buddy notes for this roadmap (newest first)
${noteIndex}

Suggest what the learner should study next. Return JSON only.`;

  const { text } = await completeOnce(client, {
    system: SUGGEST_SYSTEM,
    messages: [{ role: "user", content: userMsg }],
    maxTokens: 4096,
  });

  const parsed = safeJsonParse(text);
  const recommendedId =
    typeof parsed?.recommendedChapterId === "string"
      ? parsed.recommendedChapterId
      : null;
  const mode = isMode(parsed?.mode) ? parsed.mode : "next-chapter";
  const rationale =
    typeof parsed?.rationale === "string" ? parsed.rationale : "(no rationale)";
  const relatedIds: string[] = Array.isArray(parsed?.relatedChapterIds)
    ? (parsed.relatedChapterIds as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];

  // 관련 노트: relatedChapterIds에 포함된 것 + 추천된 챕터의 노트
  const chaptersById = new Map(chapters.map((c) => [c.id, c]));
  const related = notes.filter((n) => {
    if (
      recommendedId &&
      noteMatchesChapter(n, {
        roadmapId: roadmap.id,
        roadmapName: roadmap.name,
        chapterId: recommendedId,
        chapterTitle: chaptersById.get(recommendedId)?.title,
      })
    ) {
      return true;
    }
    return relatedIds.some((cid) =>
      noteMatchesChapter(n, {
        roadmapId: roadmap.id,
        roadmapName: roadmap.name,
        chapterId: cid,
        chapterTitle: chaptersById.get(cid)?.title,
      }),
    );
  });

  return { recommendedChapterId: recommendedId, rationale, related, mode };
}

function isMode(v: unknown): v is SpiralSuggestion["mode"] {
  return (
    v === "first-time" ||
    v === "deeper-layer" ||
    v === "next-chapter" ||
    v === "cross-link"
  );
}
