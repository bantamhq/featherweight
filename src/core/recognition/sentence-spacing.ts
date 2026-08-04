import type { PhysicalTextLine } from "../physical-lines.js";

export type SentenceSpacingConvention = 1 | 2 | null;

const intraLineSentenceSpacing =
  /[.!?…]["'’”)\]]?( +)(?=["'“‘(\[]?[\p{Lu}\p{N}])/gu;
const terminalSentenceBoundary = /[.!?…]["'’”)\]]?$/u;
const sentenceBeginning = /^["'“‘(\[]?[\p{Lu}\p{N}]/u;

export function inferSentenceSpacingConvention(
  lines: readonly PhysicalTextLine[],
): SentenceSpacingConvention {
  let oneSpaceBoundaries = 0;
  let twoSpaceBoundaries = 0;

  for (const line of lines) {
    for (const match of line.text.matchAll(intraLineSentenceSpacing)) {
      const spacing = match[1]!;

      if (spacing.length === 1) {
        oneSpaceBoundaries += 1;
      } else {
        twoSpaceBoundaries += 1;
      }
    }
  }

  if (oneSpaceBoundaries === twoSpaceBoundaries) {
    return null;
  }

  return oneSpaceBoundaries > twoSpaceBoundaries ? 1 : 2;
}

export function isSentenceBoundary(
  previousText: string,
  nextText: string,
): boolean {
  return (
    terminalSentenceBoundary.test(previousText.trimEnd()) &&
    sentenceBeginning.test(nextText.trimStart())
  );
}
