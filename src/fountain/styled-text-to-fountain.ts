import type {
  StyledText,
  TextStyle,
} from "../core/screenplay-document.js";

const supportedStyles = ["underline", "bold", "italic"] as const;

type SupportedStyle = (typeof supportedStyles)[number];

interface StyledCharacter {
  readonly character: string;
  readonly styles: readonly SupportedStyle[];
}

const styleMarkers: Readonly<Record<SupportedStyle, string>> = {
  underline: "_",
  bold: "**",
  italic: "*",
};

export function styledTextToFountain(text: StyledText): string {
  const characters = styledCharacters(text);
  const output: string[] = [];
  let activeStyles: readonly SupportedStyle[] = [];

  for (const [characterIndex, styledCharacter] of characters.entries()) {
    if (styledCharacter.character === "\n") {
      closeStyles(output, activeStyles);
      activeStyles = [];
      output.push("\n");
      continue;
    }

    const nextStyles = /^\s$/u.test(styledCharacter.character)
      ? whitespaceStyles(characters, characterIndex)
      : styledCharacter.styles;

    transitionStyles(output, activeStyles, nextStyles);
    activeStyles = nextStyles;
    output.push(escapeFountainText(styledCharacter.character));
  }

  closeStyles(output, activeStyles);
  return output.join("");
}

export function unstyledTextToFountain(text: StyledText): string {
  return escapeFountainText(renderedText(text));
}

export function renderedText(text: StyledText): string {
  return text.runs
    .map((run) => run.text)
    .join("")
    .replace(/\r\n|\r/g, "\n");
}

function styledCharacters(text: StyledText): readonly StyledCharacter[] {
  return text.runs.flatMap((run) => {
    const styles = normalizeStyles(run.styles);
    const normalizedText = run.text.replace(/\r\n|\r/g, "\n");

    return Array.from(normalizedText, (character) => ({ character, styles }));
  });
}

function whitespaceStyles(
  characters: readonly StyledCharacter[],
  characterIndex: number,
): readonly SupportedStyle[] {
  const leftStyles = neighboringContentStyles(characters, characterIndex, -1);
  const rightStyles = neighboringContentStyles(characters, characterIndex, 1);

  return leftStyles.slice(0, commonPrefixLength(leftStyles, rightStyles));
}

function neighboringContentStyles(
  characters: readonly StyledCharacter[],
  characterIndex: number,
  direction: -1 | 1,
): readonly SupportedStyle[] {
  for (
    let neighborIndex = characterIndex + direction;
    neighborIndex >= 0 && neighborIndex < characters.length;
    neighborIndex += direction
  ) {
    const neighbor = characters[neighborIndex];

    if (neighbor.character === "\n") {
      return [];
    }

    if (!/^\s$/u.test(neighbor.character)) {
      return neighbor.styles;
    }
  }

  return [];
}

function normalizeStyles(
  styles: readonly TextStyle[],
): readonly SupportedStyle[] {
  return supportedStyles.filter((style) => styles.includes(style));
}

function transitionStyles(
  output: string[],
  activeStyles: readonly SupportedStyle[],
  nextStyles: readonly SupportedStyle[],
): void {
  const sharedStyleCount = commonPrefixLength(activeStyles, nextStyles);

  closeStyles(output, activeStyles.slice(sharedStyleCount));

  for (const style of nextStyles.slice(sharedStyleCount)) {
    output.push(styleMarkers[style]);
  }
}

function closeStyles(
  output: string[],
  styles: readonly SupportedStyle[],
): void {
  for (let styleIndex = styles.length - 1; styleIndex >= 0; styleIndex -= 1) {
    output.push(styleMarkers[styles[styleIndex]]);
  }
}

function commonPrefixLength(
  left: readonly SupportedStyle[],
  right: readonly SupportedStyle[],
): number {
  const comparableLength = Math.min(left.length, right.length);

  for (let styleIndex = 0; styleIndex < comparableLength; styleIndex += 1) {
    if (left[styleIndex] !== right[styleIndex]) {
      return styleIndex;
    }
  }

  return comparableLength;
}

function escapeFountainText(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_");
}
