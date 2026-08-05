import type {
  StyledText,
  TextRun,
  TextStyle,
} from "../screenplay-document.js";
import type {
  PhysicalTextLine,
  PhysicalTextSpan,
} from "../physical-lines.js";
import {
  isSentenceBoundary,
  type SentenceSpacingConvention,
} from "./sentence-spacing.js";

const styleOrder: readonly TextStyle[] = [
  "bold",
  "italic",
  "underline",
  "strikeout",
];

export type LineJoin = "wrap" | "newline";

export function createStyledText(
  lines: readonly PhysicalTextLine[],
  lineJoins: LineJoin | readonly LineJoin[] = "wrap",
  sentenceSpacingConvention: SentenceSpacingConvention = null,
): StyledText {
  const runs: TextRun[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    if (lineIndex > 0) {
      const previousLine = lines[lineIndex - 1]!;
      const lineJoin =
        typeof lineJoins === "string"
          ? lineJoins
          : (lineJoins[lineIndex - 1] ?? "wrap");
      const separator = createLineSeparator(
        previousLine,
        line,
        lineJoin,
        sentenceSpacingConvention,
      );

      if (separator !== "") {
        appendRun(runs, separator, separatorStyles(previousLine, line));
      }
    }

    let previousSpanEnd = 0;

    for (const [spanIndex, span] of line.spans.entries()) {
      if (span.start > previousSpanEnd) {
        appendRun(
          runs,
          line.text.slice(previousSpanEnd, span.start),
          separatorStylesForSpans(line.spans[spanIndex - 1], span),
        );
      }

      appendRun(
        runs,
        line.text.slice(span.start, span.end),
        stylesForSpan(span),
      );
      previousSpanEnd = span.end;
    }
  }

  return { runs };
}

function separatorStylesForSpans(
  previousSpan: PhysicalTextSpan | undefined,
  nextSpan: PhysicalTextSpan,
): readonly TextStyle[] {
  const previousStyles = stylesForSpan(previousSpan);
  const nextStyles = stylesForSpan(nextSpan);

  return haveSameStyles(previousStyles, nextStyles) ? previousStyles : [];
}

export function styledTextValue(text: StyledText): string {
  return text.runs.map((run) => run.text).join("");
}

export function sliceStyledText(text: StyledText, end: number): StyledText {
  const runs: TextRun[] = [];
  let remaining = end;

  for (const run of text.runs) {
    if (remaining <= 0) {
      break;
    }

    const runText = run.text.slice(0, remaining);
    appendRun(runs, runText, run.styles);
    remaining -= run.text.length;
  }

  return { runs };
}

function createLineSeparator(
  previousLine: PhysicalTextLine,
  line: PhysicalTextLine,
  lineJoin: LineJoin,
  sentenceSpacingConvention: SentenceSpacingConvention,
): string {
  if (lineJoin === "newline") {
    return "\n";
  }

  const trailingWhitespace = /\s+$/u.exec(previousLine.text)?.[0] ?? "";
  const leadingWhitespace = /^\s+/u.exec(line.text)?.[0] ?? "";

  if (
    sentenceSpacingConvention !== null &&
    isSentenceBoundary(previousLine.text, line.text) &&
    trailingWhitespace.length + leadingWhitespace.length > 0
  ) {
    const retainedSpacing =
      trailingWhitespace.length + leadingWhitespace.length;

    return " ".repeat(
      Math.max(0, sentenceSpacingConvention - retainedSpacing),
    );
  }

  if (trailingWhitespace !== "" || leadingWhitespace !== "") {
    return "";
  }

  if (/^[,.;:!?…)]/u.test(line.text) || previousLine.text.endsWith("-")) {
    return "";
  }

  return " ";
}

function separatorStyles(
  previousLine: PhysicalTextLine,
  line: PhysicalTextLine,
): readonly TextStyle[] {
  const previousStyles = stylesForSpan(previousLine.spans.at(-1));
  const nextStyles = stylesForSpan(line.spans[0]);

  return haveSameStyles(previousStyles, nextStyles) ? previousStyles : [];
}

function stylesForSpan(
  span: PhysicalTextSpan | undefined,
): readonly TextStyle[] {
  if (span === undefined) {
    return [];
  }

  return styleOrder.filter((style) => span.style[style]);
}

function appendRun(
  runs: TextRun[],
  text: string,
  styles: readonly TextStyle[],
): void {
  if (text === "") {
    return;
  }

  const previousRun = runs.at(-1);

  if (previousRun !== undefined && haveSameStyles(previousRun.styles, styles)) {
    runs[runs.length - 1] = {
      text: previousRun.text + text,
      styles: previousRun.styles,
    };
    return;
  }

  runs.push({ text, styles });
}

function haveSameStyles(
  left: readonly TextStyle[],
  right: readonly TextStyle[],
): boolean {
  return (
    left.length === right.length &&
    left.every((style, index) => style === right[index])
  );
}
