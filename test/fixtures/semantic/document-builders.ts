import type {
  Action,
  Character,
  Dialogue,
  DialogueSequence,
  DualDialogue,
  Parenthetical,
  SceneHeading,
  StyledText,
  TextRun,
  TextStyle,
  TitlePageField,
  Transition,
} from "../../../src/core/screenplay-document.js";

export function run(
  text: string,
  styles: readonly TextStyle[] = [],
): TextRun {
  return { text, styles };
}

export function styled(...runs: readonly TextRun[]): StyledText {
  return { runs };
}

export function plain(text: string): StyledText {
  return styled(run(text));
}

export function titleField(
  key: string,
  ...values: readonly string[]
): TitlePageField {
  return { key, values: values.map(plain) };
}

export function scene(
  text: string,
  sceneNumber: string | null = null,
): SceneHeading {
  return { type: "scene-heading", text: styled(run(text, ["bold"])), sceneNumber };
}

export function action(
  text: string | StyledText,
  alignment: Action["alignment"] = "standard",
): Action {
  return {
    type: "action",
    text: typeof text === "string" ? plain(text) : text,
    alignment,
  };
}

export function character(text: string): Character {
  return { type: "character", text: plain(text) };
}

export function parenthetical(text: string): Parenthetical {
  return { type: "parenthetical", text: plain(text) };
}

export function dialogue(text: string | StyledText): Dialogue {
  return {
    type: "dialogue",
    text: typeof text === "string" ? plain(text) : text,
  };
}

export function transition(text: string): Transition {
  return { type: "transition", text: plain(text) };
}

export function sequence(
  characterText: string,
  ...content: readonly (Parenthetical | Dialogue)[]
): DialogueSequence {
  return { character: character(characterText), content };
}

export function dual(
  left: DialogueSequence,
  right: DialogueSequence,
): DualDialogue {
  return { type: "dual-dialogue", left, right };
}
