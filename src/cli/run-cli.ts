import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { extractPositionedPdfText } from "../pdf/extraction/pdf-inspector.js";
import { positionedTextToPages } from "../screenplay/positioned-text-pages.js";
import {
  screenplayToFDX,
  screenplayToFountain,
  screenplayToJSON,
} from "../screenplay/screenplay-conversion.js";
import { parseArguments, usageErrorMessage } from "./arguments.js";

interface CliRuntime {
  readonly cwd: string;
  readonly version: string;
  readonly writeStdout: (value: string) => Promise<void>;
  readonly writeStderr: (value: string) => Promise<void>;
}

const readErrorMessage = "featherweight: Unable to read input PDF.\n";
const extractionErrorMessage =
  "featherweight: Unable to extract native PDF text.\n";
const conversionErrorMessage =
  "featherweight: Unable to convert screenplay.\n";
const samePathErrorMessage =
  "featherweight: Input and output paths must be different.\n";
const writeErrorMessage = "featherweight: Unable to write output.\n";

export async function runCli(
  arguments_: readonly string[],
  runtime: CliRuntime,
): Promise<number> {
  const command = parseArguments(arguments_, runtime.version);

  if (command.kind === "usage-error") {
    return reportError(runtime, usageErrorMessage, 2);
  }

  if (command.kind === "help" || command.kind === "version") {
    try {
      await runtime.writeStdout(command.output);
      return 0;
    } catch {
      return reportError(runtime, writeErrorMessage, 1);
    }
  }

  const inputPath = resolve(runtime.cwd, command.inputPath);
  const outputPath = command.outputPath === null
    ? null
    : resolve(runtime.cwd, command.outputPath);

  if (outputPath === inputPath) {
    return reportError(runtime, samePathErrorMessage, 1);
  }

  let pdfBytes: Uint8Array;

  try {
    pdfBytes = await readFile(inputPath);
  } catch {
    return reportError(runtime, readErrorMessage, 1);
  }

  let positionedText;

  try {
    positionedText = extractPositionedPdfText(pdfBytes);
  } catch {
    return reportError(runtime, extractionErrorMessage, 1);
  }

  let artifact: string;

  try {
    const nativePages = positionedTextToPages(positionedText);

    if (command.format === "json") {
      artifact = screenplayToJSON(nativePages, []);
    } else if (command.format === "fdx") {
      artifact = screenplayToFDX(nativePages, []);
    } else {
      artifact = screenplayToFountain(nativePages, []);
    }
  } catch {
    return reportError(runtime, conversionErrorMessage, 1);
  }

  try {
    if (outputPath === null) {
      await runtime.writeStdout(artifact);
    } else {
      await writeFile(outputPath, artifact, "utf8");
    }

    return 0;
  } catch {
    return reportError(runtime, writeErrorMessage, 1);
  }
}

async function reportError(
  runtime: CliRuntime,
  message: string,
  exitCode: number,
): Promise<number> {
  try {
    await runtime.writeStderr(message);
  } catch {
    return exitCode;
  }

  return exitCode;
}
