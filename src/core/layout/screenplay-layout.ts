export type LayoutRole =
  | "action"
  | "character-cue"
  | "dialogue"
  | "parenthetical"
  | "transition"
  | "dual-dialogue";

export type HorizontalAlignment = "left" | "right";

export interface LayoutAnchor {
  readonly alignment: HorizontalAlignment;
  readonly x: number;
}

export interface DualDialogueLayout {
  readonly left: {
    readonly characterCue: LayoutAnchor;
    readonly dialogue: LayoutAnchor;
  };
  readonly right: {
    readonly characterCue: LayoutAnchor;
    readonly dialogue: LayoutAnchor;
  };
}

export type LayoutDiagnosticCode =
  | "INSUFFICIENT_LAYOUT_EVIDENCE"
  | "CONFLICTING_LAYOUT_EVIDENCE";

export interface LayoutDiagnostic {
  readonly code: LayoutDiagnosticCode;
  readonly role: LayoutRole;
}

export interface ScreenplayLayout {
  readonly action: LayoutAnchor | null;
  readonly characterCue: LayoutAnchor | null;
  readonly dialogue: LayoutAnchor | null;
  readonly parenthetical: LayoutAnchor | null;
  readonly transition: LayoutAnchor | null;
  readonly dualDialogue: DualDialogueLayout | null;
  readonly diagnostics: readonly LayoutDiagnostic[];
}
