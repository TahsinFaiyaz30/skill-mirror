export type PromptValues = Record<
  string,
  string | number | boolean | null | undefined
>;
const untrusted = new Set([
  "parsedCvJsonWithoutRemovedSkillsOrEmptyProfile",
  "jobDescription",
  "githubSummaries",
  "cvSnippetForCompetency",
  "transcriptLast6000Chars",
  "partialTranscript",
  "turnsJson",
  "candidatesJson",
  "documentTextOrSeeAttachment",
  "questionText",
]);
export const sanitizeUntrusted = (text: string) =>
  text.replace(/<<<(?:BEGIN|END)/gi, "");
export function render(template: string, values: PromptValues) {
  const prepared = template.replace(
    /{{#if\s+(!?)([\w]+)}}([\s\S]*?){{\/if}}\n?/g,
    (match, invert: string, key: string, content: string) =>
      Boolean(values[key]) !== Boolean(invert)
        ? content + (match.endsWith("\n") ? "\n" : "")
        : "",
  );
  return prepared
    .replace(/{{([\w]+)}}/g, (_, key: string) => {
      const value = String(values[key] ?? "");
      return untrusted.has(key) ? sanitizeUntrusted(value) : value;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
