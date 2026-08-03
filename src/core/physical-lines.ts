import type {
  PositionedText,
  PositionedTextBounds,
  PositionedTextFont,
  PositionedTextItem,
  PositionedTextStyle,
} from "./positioned-text.js";

export interface PhysicalText {
  readonly lines: readonly PhysicalTextLine[];
}

export interface PhysicalTextLine {
  readonly pageIndex: number;
  readonly text: string;
  readonly bounds: PositionedTextBounds;
  readonly spans: readonly PhysicalTextSpan[];
}

export interface PhysicalTextSpan {
  readonly start: number;
  readonly end: number;
  readonly sourceIndex: number;
  readonly sourceMethod: "embedded-text";
  readonly bounds: PositionedTextBounds;
  readonly font: PositionedTextFont;
  readonly style: PositionedTextStyle;
}

interface BaselineGroup {
  readonly items: PositionedTextItem[];
}

interface ConnectedLineItems {
  readonly items: readonly PositionedTextItem[];
  readonly firstSourceIndex: number;
}

export function groupPositionedTextIntoPhysicalLines(
  positionedText: PositionedText,
): PhysicalText {
  const connectedLines = groupItemsByBaseline(positionedText.items)
    .flatMap((baseline) => splitBaselineByHorizontalConnectivity(baseline.items))
    .sort((left, right) => left.firstSourceIndex - right.firstSourceIndex);

  return {
    lines: connectedLines.map((line) => createPhysicalTextLine(line.items)),
  };
}

function groupItemsByBaseline(
  items: readonly PositionedTextItem[],
): readonly BaselineGroup[] {
  const baselines: BaselineGroup[] = [];

  for (const item of items) {
    const compatibleBaseline = baselines.find((baseline) =>
      baseline.items.some((existingItem) =>
        haveCompatibleBaselines(existingItem, item),
      ),
    );

    if (compatibleBaseline) {
      compatibleBaseline.items.push(item);
      continue;
    }

    baselines.push({ items: [item] });
  }

  return baselines;
}

function haveCompatibleBaselines(
  left: PositionedTextItem,
  right: PositionedTextItem,
): boolean {
  if (left.pageIndex !== right.pageIndex) {
    return false;
  }

  const localVerticalScale = Math.min(
    left.bounds.height,
    right.bounds.height,
    left.font.size,
    right.font.size,
  );
  const baselineTolerance = localVerticalScale / 4;

  return Math.abs(left.bounds.y - right.bounds.y) <= baselineTolerance;
}

function splitBaselineByHorizontalConnectivity(
  items: readonly PositionedTextItem[],
): readonly ConnectedLineItems[] {
  const sortedItems = [...items].sort(
    (left, right) =>
      left.bounds.x - right.bounds.x || left.sourceIndex - right.sourceIndex,
  );
  const connectedLines: PositionedTextItem[][] = [];

  for (const item of sortedItems) {
    const currentLine = connectedLines.at(-1);

    if (!currentLine) {
      connectedLines.push([item]);
      continue;
    }

    const previousItem = currentLine.at(-1)!;

    if (areHorizontallyConnected(previousItem, item)) {
      currentLine.push(item);
      continue;
    }

    connectedLines.push([item]);
  }

  return connectedLines.map((lineItems) => ({
    items: lineItems,
    firstSourceIndex: Math.min(
      ...lineItems.map((item) => item.sourceIndex),
    ),
  }));
}

function areHorizontallyConnected(
  left: PositionedTextItem,
  right: PositionedTextItem,
): boolean {
  const horizontalGap = right.bounds.x - (left.bounds.x + left.bounds.width);
  const localRunScale = Math.max(
    left.bounds.height,
    right.bounds.height,
    left.font.size,
    right.font.size,
  );

  return horizontalGap <= localRunScale;
}

function createPhysicalTextLine(
  items: readonly PositionedTextItem[],
): PhysicalTextLine {
  const text = items.map((item) => item.text).join("");
  const spans: PhysicalTextSpan[] = [];
  let start = 0;

  for (const item of items) {
    const end = start + item.text.length;

    spans.push({
      start,
      end,
      sourceIndex: item.sourceIndex,
      sourceMethod: item.sourceMethod,
      bounds: item.bounds,
      font: item.font,
      style: item.style,
    });
    start = end;
  }

  return {
    pageIndex: items[0]!.pageIndex,
    text,
    bounds: createAggregateBounds(items),
    spans,
  };
}

function createAggregateBounds(
  items: readonly PositionedTextItem[],
): PositionedTextBounds {
  const firstBounds = items[0]!.bounds;
  let minimumX = firstBounds.x;
  let minimumY = firstBounds.y;
  let maximumX = firstBounds.x + firstBounds.width;
  let maximumY = firstBounds.y + firstBounds.height;

  for (const item of items.slice(1)) {
    minimumX = Math.min(minimumX, item.bounds.x);
    minimumY = Math.min(minimumY, item.bounds.y);
    maximumX = Math.max(maximumX, item.bounds.x + item.bounds.width);
    maximumY = Math.max(maximumY, item.bounds.y + item.bounds.height);
  }

  return {
    x: minimumX,
    y: minimumY,
    width: maximumX - minimumX,
    height: maximumY - minimumY,
  };
}
