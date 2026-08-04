import type { NormalizedText } from "../normalized-text.js";
import { inferLayoutEvidence } from "./layout-evidence.js";
import type {
  DualDialogueLayout,
  LayoutAnchor,
  LayoutDiagnostic,
  LayoutRole,
  ScreenplayLayout,
} from "./screenplay-layout.js";

export function inferScreenplayLayout(
  normalizedText: NormalizedText,
): ScreenplayLayout {
  const evidence = inferLayoutEvidence(normalizedText);
  const dualDialogue = createDualDialogueLayout(evidence.dualDialogue);
  const diagnostics: LayoutDiagnostic[] = [];

  addCoordinateDiagnostic(diagnostics, "action", evidence.action);
  addCoordinateDiagnostic(
    diagnostics,
    "character-cue",
    evidence.characterCue,
  );
  addCoordinateDiagnostic(diagnostics, "dialogue", evidence.dialogue);
  addCoordinateDiagnostic(
    diagnostics,
    "parenthetical",
    evidence.parenthetical,
  );
  addCoordinateDiagnostic(diagnostics, "transition", evidence.transition);

  if (evidence.dualDialogue === null) {
    diagnostics.push({
      code: "INSUFFICIENT_LAYOUT_EVIDENCE",
      role: "dual-dialogue",
    });
  } else if (
    evidence.dualDialogue.leftCharacterCue.conflicting ||
    evidence.dualDialogue.leftDialogue.conflicting ||
    evidence.dualDialogue.rightCharacterCue.conflicting ||
    evidence.dualDialogue.rightDialogue.conflicting
  ) {
    diagnostics.push({
      code: "CONFLICTING_LAYOUT_EVIDENCE",
      role: "dual-dialogue",
    });
  }

  return {
    action: createLeftAnchor(evidence.action.x),
    characterCue: createLeftAnchor(evidence.characterCue.x),
    dialogue: createLeftAnchor(evidence.dialogue.x),
    parenthetical: createLeftAnchor(evidence.parenthetical.x),
    transition: createRightAnchor(evidence.transition.x),
    dualDialogue,
    diagnostics,
  };
}

function createDualDialogueLayout(
  evidence: ReturnType<typeof inferLayoutEvidence>["dualDialogue"],
): DualDialogueLayout | null {
  if (
    evidence === null ||
    evidence.leftCharacterCue.x === null ||
    evidence.leftDialogue.x === null ||
    evidence.rightCharacterCue.x === null ||
    evidence.rightDialogue.x === null
  ) {
    return null;
  }

  return {
    left: {
      characterCue: { alignment: "left", x: evidence.leftCharacterCue.x },
      dialogue: { alignment: "left", x: evidence.leftDialogue.x },
    },
    right: {
      characterCue: { alignment: "left", x: evidence.rightCharacterCue.x },
      dialogue: { alignment: "left", x: evidence.rightDialogue.x },
    },
  };
}

function addCoordinateDiagnostic(
  diagnostics: LayoutDiagnostic[],
  role: LayoutRole,
  evidence: { readonly x: number | null; readonly conflicting: boolean },
): void {
  if (evidence.conflicting) {
    diagnostics.push({ code: "CONFLICTING_LAYOUT_EVIDENCE", role });
    return;
  }

  if (evidence.x === null) {
    diagnostics.push({ code: "INSUFFICIENT_LAYOUT_EVIDENCE", role });
  }
}

function createLeftAnchor(x: number | null): LayoutAnchor | null {
  return x === null ? null : { alignment: "left", x };
}

function createRightAnchor(x: number | null): LayoutAnchor | null {
  return x === null ? null : { alignment: "right", x };
}
