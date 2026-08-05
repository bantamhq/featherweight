import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}

export type XmlNode = XmlElement | string;

export interface FdxDocumentProjection {
  readonly root: string;
  readonly documentType: string | undefined;
  readonly template: string | undefined;
  readonly version: string | undefined;
  readonly content: readonly FdxParagraphProjection[];
  readonly title: readonly FdxParagraphProjection[] | null;
}

export interface FdxParagraphProjection {
  readonly type: string | undefined;
  readonly alignment: string | undefined;
  readonly number: string | undefined;
  readonly startsNewPage: string | undefined;
  readonly text: readonly {
    readonly value: string;
    readonly style: string | undefined;
  }[];
  readonly dualDialogue: readonly FdxParagraphProjection[] | null;
}

const parser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  preserveOrder: true,
  processEntities: true,
  trimValues: false,
});

export function parseFdxDocument(xml: string): XmlElement {
  const validation = XMLValidator.validate(xml);

  if (validation !== true) {
    throw new Error(
      `Invalid XML at line ${validation.err.line}, column ${validation.err.col}: ${validation.err.msg}`,
    );
  }

  const parsed = parser.parse(xml) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("XML parser did not return a document node list.");
  }

  const roots = parsed.flatMap(toDocumentElement);

  if (roots.length !== 1) {
    throw new Error(`Expected one XML document element, received ${roots.length}.`);
  }

  return roots[0]!;
}

export function elementChildren(
  element: XmlElement,
  name?: string,
): readonly XmlElement[] {
  return element.children.filter(
    (child): child is XmlElement =>
      typeof child !== "string" && (name === undefined || child.name === name),
  );
}

export function firstElement(element: XmlElement, name: string): XmlElement {
  const matches = elementChildren(element, name);

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one <${name}> child of <${element.name}>, received ${matches.length}.`,
    );
  }

  return matches[0]!;
}

export function elementText(element: XmlElement): string {
  return element.children.map((child) =>
    typeof child === "string" ? child : elementText(child)
  ).join("");
}

export function projectFdxDocument(root: XmlElement): FdxDocumentProjection {
  const titlePages = elementChildren(root, "TitlePage");

  return {
    root: root.name,
    documentType: root.attributes.DocumentType,
    template: root.attributes.Template,
    version: root.attributes.Version,
    content: elementChildren(
      firstElement(root, "Content"),
      "Paragraph",
    ).map(projectParagraph),
    title: titlePages.length === 0
      ? null
      : elementChildren(
        firstElement(titlePages[0]!, "Content"),
        "Paragraph",
      ).map(projectParagraph),
  };
}

function projectParagraph(paragraph: XmlElement): FdxParagraphProjection {
  const dualDialogue = elementChildren(paragraph, "DualDialogue");

  return {
    type: paragraph.attributes.Type,
    alignment: paragraph.attributes.Alignment,
    number: paragraph.attributes.Number,
    startsNewPage: paragraph.attributes.StartsNewPage,
    text: elementChildren(paragraph, "Text").map((text) => ({
      value: elementText(text),
      style: text.attributes.Style,
    })),
    dualDialogue: dualDialogue.length === 0
      ? null
      : elementChildren(dualDialogue[0]!, "Paragraph").map(projectParagraph),
  };
}

function toDocumentElement(value: unknown): readonly XmlElement[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.keys(value)
    .filter((key) => key !== ":@" && key !== "#text" && key !== "?xml")
    .map((name) => toElement(name, value[name], value[":@"]))
    .filter((element): element is XmlElement => element !== null);
}

function toElement(
  name: string,
  rawChildren: unknown,
  rawAttributes: unknown,
): XmlElement | null {
  if (!Array.isArray(rawChildren)) {
    return null;
  }

  const children: XmlNode[] = [];

  for (const rawChild of rawChildren) {
    if (!isRecord(rawChild)) {
      continue;
    }

    if (typeof rawChild["#text"] === "string") {
      children.push(rawChild["#text"]);
    }

    children.push(...toDocumentElement(rawChild));
  }

  return {
    name,
    attributes: toAttributes(rawAttributes),
    children,
  };
}

function toAttributes(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
