import { describe, expect, it } from "vitest";

import type {
  Action,
  Character,
  Dialogue,
  Parenthetical,
  SceneHeading,
  ScreenplayDocument,
  StyledText,
  TextRun,
  TextStyle,
  Transition,
} from "../../../src/core/screenplay-document.js";
import { screenplayToFountain } from "../../../src/fountain/screenplay-to-fountain.js";

describe("screenplayToFountain", () => {
  it("serializes every model-only variant and shape-driven title layout", () => {
    const document: ScreenplayDocument = {
      titlePage: [
        { key: "Open key", values: [plain("One line")] },
        {
          key: "Gallery",
          values: [styled(run("first", ["underline"])), plain("second\nline")],
        },
        { key: "Empty", values: [] },
      ],
      elements: [
        {
          type: "scene-heading",
          text: plain("INT. LAB - NIGHT"),
          sceneNumber: "A1.2-B",
        },
        {
          type: "scene-heading",
          text: plain("MEMORY"),
          sceneNumber: null,
        },
        { type: "action", text: plain("The machine wakes."), alignment: "standard" },
        {
          type: "action",
          text: styled(
            run("CENTER "),
            run("ONE\nCENTER", ["bold"]),
            run(" TWO", ["underline"]),
          ),
          alignment: "center",
        },
        {
          type: "lyric",
          text: styled(
            run("Sing "),
            run("one\nSing", ["italic"]),
            run(" two", ["underline"]),
          ),
        },
        { type: "transition", text: plain("DISSOLVE THROUGH TIME") },
        { type: "page-break" },
      ],
    };

    expect(screenplayToFountain(document)).toBe(
      "Open key: One line\n" +
        "Gallery:\n" +
        "    _first_\n" +
        "    second\n" +
        "    line\n" +
        "Empty:\n\n" +
        "INT. LAB - NIGHT #A1.2-B#\n\n" +
        ".MEMORY\n\n" +
        "The machine wakes.\n\n" +
        ">CENTER **ONE**<\n" +
        ">**CENTER** _TWO_<\n\n" +
        "~Sing *one*\n" +
        "~*Sing* _two_\n\n" +
        ">DISSOLVE THROUGH TIME\n\n" +
        "===\n",
    );
  });

  it("uses automatic recognition minimally while omitting styled structural-role emphasis", () => {
    const document: ScreenplayDocument = {
      titlePage: [],
      elements: [
        scene(styled(run("EXT. ROAD - DAY", ["bold", "underline"]))),
        scene(styled(run("int. cellar - night", ["italic"]))),
        scene(styled(run("FLASHBACK", ["bold"]))),
        character(styled(run("GUIDE", ["bold"]))),
        dialogue("Automatic cue."),
        character(styled(run("Guide Two", ["underline"]))),
        dialogue("Forced cue."),
        transition(styled(run("CUT TO:", ["italic"]))),
        transition(styled(run("MATCH DISSOLVE", ["bold"]))),
        action("A safe action line."),
        action("THE END"),
        action("...where"),
        action("    INT. ROOM"),
        action("Lead.\n\nINT. ROOM"),
        action("- VOICE\nDialogue"),
        action("int. false\ncontinuation"),
        action("INT. FALSE HEADING - DAY"),
        action("FALSE CUE\nDialogue-looking continuation."),
        action("SMASH TO:"),
        action(">Centered impostor<"),
        action("~Lyric impostor"),
        action("# Section impostor"),
        action("= Synopsis impostor"),
        action("==="),
      ],
    };

    expect(screenplayToFountain(document)).toBe(
      "EXT. ROAD - DAY\n\n" +
        "int. cellar - night\n\n" +
        ".FLASHBACK\n\n" +
        "GUIDE\n" +
        "Automatic cue.\n\n" +
        "@Guide Two\n" +
        "Forced cue.\n\n" +
        "CUT TO:\n\n" +
        ">MATCH DISSOLVE\n\n" +
        "A safe action line.\n\n" +
        "THE END\n\n" +
        "...where\n\n" +
        "!    INT. ROOM\n\n" +
        "Lead.\n\n" +
        "!INT. ROOM\n\n" +
        "!- VOICE\n" +
        "Dialogue\n\n" +
        "int. false\n" +
        "continuation\n\n" +
        "!INT. FALSE HEADING - DAY\n\n" +
        "!FALSE CUE\n" +
        "Dialogue-looking continuation.\n\n" +
        "!SMASH TO:\n\n" +
        "!>Centered impostor<\n\n" +
        "!~Lyric impostor\n\n" +
        "!# Section impostor\n\n" +
        "!= Synopsis impostor\n\n" +
        "!===\n",
    );
  });

  it("preserves ordinary and dual dialogue ownership including empty interior lines", () => {
    const document: ScreenplayDocument = {
      titlePage: [],
      elements: [
        character(plain("CAPTAIN")),
        parenthetical(
          styled(run("("), run("quietly", ["italic"]), run(")")),
        ),
        dialogue("first line\n\nsecond line"),
        character(plain("Crew mate")),
        dialogue("Still here."),
        {
          type: "dual-dialogue",
          left: {
            character: character(plain("LEFT VOICE")),
            content: [parenthetical("(reading)"), dialogue("Left one\nLeft two")],
          },
          right: {
            character: character(plain("Right voice")),
            content: [dialogue("Right one"), parenthetical("(then)"), dialogue("Right two")],
          },
        },
      ],
    };

    expect(screenplayToFountain(document)).toBe(
      "CAPTAIN\n" +
        "(*quietly*)\n" +
        "first line\n" +
        "  \n" +
        "second line\n\n" +
        "@Crew mate\n" +
        "Still here.\n\n" +
        "LEFT VOICE\n" +
        "(reading)\n" +
        "Left one\n" +
        "Left two\n\n" +
        "@Right voice ^\n" +
        "Right one\n" +
        "(then)\n" +
        "Right two\n",
    );
  });

  it("serializes supported styling, escaping, newline boundaries, and representable boneyards", () => {
    const document: ScreenplayDocument = {
      titlePage: [],
      elements: [
        action(
          styled(
            run("Literal \\ * _ markers. "),
            run("italic", ["italic"]),
            run(", "),
            run("bold", ["bold"]),
            run(", "),
            run("underline", ["underline"]),
            run(", "),
            run("bold italic", ["italic", "bold"]),
            run(", "),
            run("bold underline", ["bold", "underline"]),
            run(", "),
            run("italic underline", ["underline", "italic"]),
            run(", and "),
            run("all", ["italic", "underline", "bold"]),
            run("."),
          ),
        ),
        action(
          styled(
            run("under", ["underline"]),
            run("bold", ["underline", "bold"]),
            run("italic", ["underline", "bold", "italic"]),
            run("bold again", ["underline", "bold"]),
            run("under again", ["underline"]),
          ),
        ),
        action(styled(run("before\nafter", ["italic"]))),
        action(
          styled(
            run("Strike text", ["strikeout"]),
            run(" and "),
            run("supported bold", ["strikeout", "bold"]),
          ),
        ),
        action("Visible /* example */ text."),
      ],
    };

    expect(screenplayToFountain(document)).toBe(
      "Literal \\\\ \\* \\_ markers. *italic*, **bold**, _underline_, ***bold italic***, _**bold underline**_, _*italic underline*_, and _***all***_.\n\n" +
        "_under**bold*italic*bold again**under again_\n\n" +
        "*before*\n" +
        "*after*\n\n" +
        "Strike text and **supported bold**\n\n" +
        "Visible /\\* example \\*/ text.\n",
    );
  });

  it("is deterministic without mutating a deeply frozen document", () => {
    const document = deepFreeze<ScreenplayDocument>({
      titlePage: [
        {
          key: "Styled",
          values: [styled(run("stable", ["italic", "underline", "bold"]))],
        },
      ],
      elements: [action(styled(run("repeatable", ["bold", "italic"])))],
    });
    const expected = "Styled: _***stable***_\n\n***repeatable***\n";

    expect([screenplayToFountain(document), screenplayToFountain(document)]).toEqual([
      expected,
      expected,
    ]);
  });

  it("returns the exact empty string for an empty document", () => {
    expect(screenplayToFountain({ titlePage: [], elements: [] })).toBe("");
  });
});

function run(text: string, styles: readonly TextStyle[] = []): TextRun {
  return { text, styles };
}

function styled(...runs: readonly TextRun[]): StyledText {
  return { runs };
}

function plain(text: string): StyledText {
  return styled(run(text));
}

function scene(text: StyledText): SceneHeading {
  return { type: "scene-heading", text, sceneNumber: null };
}

function action(
  text: string | StyledText,
): Action {
  return {
    type: "action",
    text: typeof text === "string" ? plain(text) : text,
    alignment: "standard",
  };
}

function character(text: StyledText): Character {
  return { type: "character", text };
}

function parenthetical(text: string | StyledText): Parenthetical {
  return {
    type: "parenthetical",
    text: typeof text === "string" ? plain(text) : text,
  };
}

function dialogue(text: string): Dialogue {
  return { type: "dialogue", text: plain(text) };
}

function transition(text: StyledText): Transition {
  return { type: "transition", text };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}
