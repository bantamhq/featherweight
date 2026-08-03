export type SourceMethod = "embedded-text" | "ocr";

export interface PositionedText {
  readonly items: readonly PositionedTextItem[];
}

export interface PositionedTextItem {
  readonly sourceIndex: number;
  readonly sourceMethod: SourceMethod;
  readonly pageIndex: number;
  readonly text: string;
  readonly bounds: PositionedTextBounds;
  readonly font: PositionedTextFont;
  readonly style: PositionedTextStyle;
}

export interface PositionedTextBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PositionedTextFont {
  readonly name: string;
  readonly size: number;
}

export interface PositionedTextStyle {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strikeout: boolean;
}
