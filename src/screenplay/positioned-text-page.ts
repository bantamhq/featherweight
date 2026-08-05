export interface PositionedTextPage {
  readonly pageIndex: number;
  readonly items: readonly PositionedTextPageItem[];
}

export interface PositionedTextPageItem {
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
