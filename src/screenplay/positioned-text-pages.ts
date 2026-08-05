import type { PositionedText } from "../core/positioned-text.js";
import type { PositionedTextPage } from "./positioned-text-page.js";

export function positionedTextToPages(
  positionedText: PositionedText,
): readonly PositionedTextPage[] {
  const itemsByPage = new Map<
    number,
    PositionedText["items"][number][]
  >();

  for (const item of positionedText.items) {
    const pageItems = itemsByPage.get(item.pageIndex);

    if (pageItems === undefined) {
      itemsByPage.set(item.pageIndex, [item]);
      continue;
    }

    pageItems.push(item);
  }

  return [...itemsByPage].map(([pageIndex, items]) => ({
    pageIndex,
    items,
  }));
}
