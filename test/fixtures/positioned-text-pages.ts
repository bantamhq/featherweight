import type { PositionedText } from "../../src/core/positioned-text.js";
import type {
  PositionedTextPage,
  PositionedTextPageItem,
} from "../../src/screenplay/positioned-text-page.js";

export function positionedTextToPages(
  positionedText: PositionedText,
): readonly PositionedTextPage[] {
  const itemsByPage = Map.groupBy(
    positionedText.items,
    (item) => item.pageIndex,
  );

  return [...itemsByPage]
    .sort(
      ([leftPageIndex], [rightPageIndex]) =>
        leftPageIndex - rightPageIndex,
    )
    .map(([pageIndex, items]) => ({
      pageIndex,
      items: items.map(stripProvenance),
    }));
}

function stripProvenance(
  item: PositionedText["items"][number],
): PositionedTextPageItem {
  return {
    text: item.text,
    bounds: { ...item.bounds },
    font: { ...item.font },
    style: { ...item.style },
  };
}
