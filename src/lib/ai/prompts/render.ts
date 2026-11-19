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
  "toneInstructions",
  "aiInstructionsOrNone",
  "aiInstructions",
  "topic",
  "existingQuestionTextsOrNone",
]);
export function sanitizeUntrusted(text: string) {
  let previous: string;
  do {
    previous = text;
    text = previous.replace(/<<<(?:BEGIN|END)/gi, "");
  } while (text !== previous);
  return text;
}
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
