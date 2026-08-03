export interface PositionedPdfText {
  readonly items: readonly PositionedPdfTextItem[];
}

export interface PositionedPdfTextItem {
  readonly sourceIndex: number;
  readonly sourceMethod: "embedded-text";
  readonly pageIndex: number;
  readonly text: string;
  readonly bounds: PositionedPdfTextBounds;
  readonly font: PositionedPdfTextFont;
  readonly style: PositionedPdfTextStyle;
}

export interface PositionedPdfTextBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PositionedPdfTextFont {
  readonly name: string;
  readonly size: number;
}

export interface PositionedPdfTextStyle {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strikeout: boolean;
}
