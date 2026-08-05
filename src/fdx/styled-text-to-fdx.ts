import type {
  StyledText,
  TextRun,
  TextStyle,
} from "../core/screenplay-document.js";
import { ScreenplayConversionError } from "../screenplay/screenplay-conversion-error.js";

const xmlTextPattern =
  /^[\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]*$/u;
const styleOrder = ["bold", "italic", "underline", "strikeout"] as const;

const fdxStyleNames: Readonly<Record<TextStyle, string>> = {
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strikeout: "Strikeout",
};

export function assertValidFdxText(value: string): void {
  if (!xmlTextPattern.test(value)) {
    throw new ScreenplayConversionError("INVALID_FDX_TEXT");
  }
}

export function assertValidStyledText(text: StyledText): void {
  for (const run of text.runs) {
    assertValidFdxText(run.text);
  }
}

export function styledTextToFDX(
  text: StyledText,
  addedStyles: readonly TextStyle[] = [],
): string {
  return text.runs.map((run) => serializeRun(run, addedStyles)).join("");
}

export function splitStyledTextLines(
  text: StyledText,
): readonly StyledText[] {
  const lines: TextRun[][] = [[]];

  for (const run of text.runs) {
    const parts = normalizeLineEndings(run.text).split("\n");

    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const part = parts[partIndex]!;

      if (part.length > 0) {
        lines[lines.length - 1]!.push({ text: part, styles: run.styles });
      }

      if (partIndex < parts.length - 1) {
        lines.push([]);
      }
    }
  }

  return lines.map((runs) => ({ runs }));
}

export function plainStyledText(value: string): StyledText {
  return { runs: [{ text: value, styles: [] }] };
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function escapeXmlAttribute(value: string): string {
  return escapeXml(value)
    .replaceAll("\t", "&#x9;")
    .replaceAll("\n", "&#xA;")
    .replaceAll("\r", "&#xD;");
}

function serializeRun(
  run: TextRun,
  addedStyles: readonly TextStyle[],
): string {
  const styles = styleOrder.filter((style) =>
    run.styles.includes(style) || addedStyles.includes(style)
  );
  const styleAttribute = styles.length === 0
    ? ""
    : ` Style="${styles.map((style) => fdxStyleNames[style]).join("+")}"`;
  const text = escapeXml(normalizeLineEndings(run.text));

  return `<Text${styleAttribute}>${text}</Text>`;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n|\r/g, "\n");
}
