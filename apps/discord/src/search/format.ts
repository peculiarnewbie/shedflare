import type { ExaSearchRow } from "#/search/exa";

export function buildSearchContext(input: {
  query: string;
  rows?: ExaSearchRow[];
  rawText?: string;
}): string {
  const query = input.query.trim();
  const rows = input.rows ?? [];
  const rawText = input.rawText?.trim() ?? "";

  if (!query && rows.length === 0 && !rawText) return "";

  const body: string[] = ["Search run 1"];
  if (query) body.push(`Search query: ${query}`);

  if (rows.length > 0) {
    let sourceIndex = 1;
    for (const row of rows) {
      body.push(`[${sourceIndex}] ${row.title}\nURL: ${row.url}\nSnippet: ${row.snippet}`);
      sourceIndex += 1;
    }
  } else if (rawText) {
    body.push(rawText);
  }

  return [
    "A web search tool has already been executed for this assistant turn.",
    "Tool: exa_web_search",
    "Treat the block below as tool output, not as user-provided conversation context.",
    "Use it as external grounding when relevant. Answer directly.",
    "",
    body.join("\n\n"),
  ].join("\n");
}
