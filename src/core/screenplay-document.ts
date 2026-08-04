export interface ScreenplayDocument {
  readonly titlePage: readonly TitlePageField[];
  readonly elements: readonly ScreenplayElement[];
}

export interface TitlePageField {
  readonly key: string;
  readonly values: readonly StyledText[];
}

export interface StyledText {
  readonly runs: readonly TextRun[];
}

export interface TextRun {
  readonly text: string;
  readonly styles: readonly TextStyle[];
}

export type TextStyle = "bold" | "italic" | "underline" | "strikeout";

export type ScreenplayElement =
  | SceneHeading
  | Action
  | Character
  | Parenthetical
  | Dialogue
  | DualDialogue
  | Lyric
  | Transition
  | PageBreak;

export interface SceneHeading {
  readonly type: "scene-heading";
  readonly text: StyledText;
  readonly sceneNumber: string | null;
}

export interface Action {
  readonly type: "action";
  readonly text: StyledText;
  readonly alignment: "standard" | "center";
}

export interface Character {
  readonly type: "character";
  readonly text: StyledText;
}

export interface Parenthetical {
  readonly type: "parenthetical";
  readonly text: StyledText;
}

export interface Dialogue {
  readonly type: "dialogue";
  readonly text: StyledText;
}

export interface DualDialogue {
  readonly type: "dual-dialogue";
  readonly left: DialogueSequence;
  readonly right: DialogueSequence;
}

export interface DialogueSequence {
  readonly character: Character;
  readonly content: readonly (Parenthetical | Dialogue)[];
}

export interface Lyric {
  readonly type: "lyric";
  readonly text: StyledText;
}

export interface Transition {
  readonly type: "transition";
  readonly text: StyledText;
}

export interface PageBreak {
  readonly type: "page-break";
}
