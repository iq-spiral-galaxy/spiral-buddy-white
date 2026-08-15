import type { Hono, Context } from "hono";

import type { Config } from "./config.js";
import {
  CONCEPT_LIMITS,
  ConceptStoreError,
  deleteConcept,
  getConcept,
  listConcepts,
  searchConcepts,
  upsertConcept,
  updateConcept,
  type ConceptCreateInput,
  type ConceptEntry,
  type ConceptUpdateInput,
} from "./concept-store.js";
const DEFAULT_SEARCH_LIMIT = 20;
type ConceptSearchMode = "local";

type CompactConcept = Omit<ConceptEntry, "content" | "userQuestion">;

type ConceptResponse = {
  concepts: CompactConcept[];
  total: number;
  mode: ConceptSearchMode;
};

type SearchBody = {
  query?: unknown;
  limit?: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function configuredVault(
  c: Context,
  config: Config,
): string | Response {
  return config.vaultPath ?? c.json({ error: "No vault configured" }, 400);
}

function validConceptId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function parseLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_SEARCH_LIMIT;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > CONCEPT_LIMITS.searchResults
  ) {
    throw new ConceptStoreError(
      "invalid_input",
      `limit must be an integer between 1 and ${CONCEPT_LIMITS.searchResults}`,
    );
  }
  return value;
}

function parseQuery(value: unknown): string {
  if (typeof value !== "string") {
    throw new ConceptStoreError("invalid_input", "query must be a string");
  }
  const query = value.trim();
  if (!query) {
    throw new ConceptStoreError("invalid_input", "query is required");
  }
  if (Array.from(query).length > CONCEPT_LIMITS.searchQueryLength) {
    throw new ConceptStoreError(
      "limit_exceeded",
      `query exceeds ${CONCEPT_LIMITS.searchQueryLength} characters`,
    );
  }
  return query;
}

function createInput(value: unknown): ConceptCreateInput {
  const body = jsonObject(value);
  if (!body) {
    throw new ConceptStoreError("invalid_input", "concept body is required");
  }
  return {
    term: body.term as string,
    aliases: body.aliases as readonly string[] | undefined,
    summary: body.summary as string | undefined,
    content: body.content as string,
    userQuestion: body.userQuestion as string | undefined,
    depth: body.depth as number | undefined,
    roadmapId: body.roadmapId as string | undefined,
    chapterId: body.chapterId as string | undefined,
    chapterTitle: body.chapterTitle as string | undefined,
  };
}

const UPDATE_KEYS = new Set([
  "term",
  "aliases",
  "summary",
  "content",
  "userQuestion",
  "depth",
  "roadmapId",
  "chapterId",
  "chapterTitle",
]);

function updateInput(value: unknown): ConceptUpdateInput {
  const body = jsonObject(value);
  if (!body) {
    throw new ConceptStoreError("invalid_input", "concept patch is required");
  }
  const keys = Object.keys(body).filter((key) => UPDATE_KEYS.has(key));
  if (keys.length === 0) {
    throw new ConceptStoreError("invalid_input", "concept patch is empty");
  }
  const patch: Record<string, unknown> = {};
  for (const key of keys) patch[key] = body[key];
  return patch as ConceptUpdateInput;
}

function storeErrorResponse(c: Context, error: unknown): Response {
  if (error instanceof ConceptStoreError) {
    const status =
      error.code === "duplicate_term"
        ? 409
        : error.code === "limit_exceeded"
          ? 413
          : error.code === "corrupt_store"
            ? 500
            : 400;
    return c.json({ error: error.message, code: error.code }, status);
  }
  console.error("[concepts] unexpected error", error);
  return c.json({ error: "Concept operation failed" }, 500);
}

function conceptResponse(
  concepts: ConceptEntry[],
  total: number,
  mode: ConceptSearchMode,
): ConceptResponse {
  return { concepts: concepts.map(compactConcept), total, mode };
}

function compactConcept(concept: ConceptEntry): CompactConcept {
  const { content: _content, userQuestion: _userQuestion, ...compact } = concept;
  return compact;
}

/** Concept library HTTP surface shared by all five Buddy themes. */
export function registerConceptRoutes(
  app: Hono,
  config: Config,
): void {
  app.get("/concepts", async (c) => {
    const vault = configuredVault(c, config);
    if (vault instanceof Response) return vault;
    try {
      const concepts = await listConcepts(vault);
      return c.json(conceptResponse(concepts, concepts.length, "local"));
    } catch (error) {
      return storeErrorResponse(c, error);
    }
  });

  app.get("/concepts/count", async (c) => {
    const vault = configuredVault(c, config);
    if (vault instanceof Response) return vault;
    try {
      return c.json({ total: (await listConcepts(vault)).length });
    } catch (error) {
      return storeErrorResponse(c, error);
    }
  });

  app.get("/concepts/:id", async (c) => {
    const vault = configuredVault(c, config);
    if (vault instanceof Response) return vault;
    const id = c.req.param("id");
    if (!validConceptId(id)) {
      return c.json({ error: "Invalid concept id", code: "invalid_input" }, 400);
    }
    try {
      const concept = await getConcept(vault, id);
      if (!concept) return c.json({ error: "Concept not found" }, 404);
      return c.json({ concept });
    } catch (error) {
      return storeErrorResponse(c, error);
    }
  });

  app.post("/concepts", async (c) => {
    const vault = configuredVault(c, config);
    if (vault instanceof Response) return vault;
    const raw = await c.req.json<unknown>().catch(() => null);
    try {
      const { concept, created } = await upsertConcept(vault, createInput(raw));
      return c.json({ concept, created }, created ? 201 : 200);
    } catch (error) {
      return storeErrorResponse(c, error);
    }
  });

  app.post("/concepts/search", async (c) => {
    const vault = configuredVault(c, config);
    if (vault instanceof Response) return vault;
    const raw = await c.req.json<unknown>().catch(() => null);
    try {
      const body = jsonObject(raw);
      if (!body) {
        throw new ConceptStoreError("invalid_input", "search body is required");
      }
      const query = parseQuery((body as SearchBody).query);
      const limit = parseLimit((body as SearchBody).limit);
      const local = await searchConcepts(vault, query, {
        limit: CONCEPT_LIMITS.searchResults,
      });
      const concepts = local.slice(0, limit).map((item) => item.concept);
      return c.json(conceptResponse(concepts, local.length, "local"));
    } catch (error) {
      return storeErrorResponse(c, error);
    }
  });

  app.patch("/concepts/:id", async (c) => {
    const vault = configuredVault(c, config);
    if (vault instanceof Response) return vault;
    const id = c.req.param("id");
    if (!validConceptId(id)) {
      return c.json({ error: "Invalid concept id", code: "invalid_input" }, 400);
    }
    const raw = await c.req.json<unknown>().catch(() => null);
    try {
      const concept = await updateConcept(vault, id, updateInput(raw));
      if (!concept) return c.json({ error: "Concept not found" }, 404);
      return c.json({ concept });
    } catch (error) {
      return storeErrorResponse(c, error);
    }
  });

  app.delete("/concepts/:id", async (c) => {
    const vault = configuredVault(c, config);
    if (vault instanceof Response) return vault;
    const id = c.req.param("id");
    if (!validConceptId(id)) {
      return c.json({ error: "Invalid concept id", code: "invalid_input" }, 400);
    }
    try {
      if (!(await deleteConcept(vault, id))) {
        return c.json({ error: "Concept not found" }, 404);
      }
      return c.json({ deleted: true });
    } catch (error) {
      return storeErrorResponse(c, error);
    }
  });
}
