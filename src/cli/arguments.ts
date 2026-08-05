export type OutputFormat = "fountain" | "json" | "fdx";

export type CliCommand =
  | { readonly kind: "help"; readonly output: string }
  | { readonly kind: "version"; readonly output: string }
  | { readonly kind: "usage-error" }
  | {
      readonly kind: "convert";
      readonly inputPath: string;
      readonly format: OutputFormat;
      readonly outputPath: string | null;
    };

export const usageErrorMessage =
  "featherweight: Invalid arguments. Run 'featherweight --help' for usage.\n";

const helpText =
  "Usage: featherweight <input.pdf> [--format fountain|json|fdx] [--output <path>]\n" +
  "\n" +
  "Convert a PDF screenplay using native embedded text.\n" +
  "\n" +
  "Options:\n" +
  "  --format <fountain|json|fdx>  Output format; Fountain is the default.\n" +
  "  --output <path>          Write output to a file instead of stdout.\n" +
  "  --help                   Show help.\n" +
  "  --version                Show version.\n";

export function parseArguments(
  arguments_: readonly string[],
  version: string,
): CliCommand {
  if (arguments_.length === 1 && arguments_[0] === "--help") {
    return { kind: "help", output: helpText };
  }

  if (arguments_.length === 1 && arguments_[0] === "--version") {
    return { kind: "version", output: `${version}\n` };
  }

  let format: OutputFormat = "fountain";
  let outputPath: string | null = null;
  let hasFormat = false;
  let hasOutput = false;
  const inputPaths: string[] = [];

  for (
    let argumentIndex = 0;
    argumentIndex < arguments_.length;
    argumentIndex += 1
  ) {
    const argument = arguments_[argumentIndex]!;

    if (argument === "--format") {
      if (hasFormat) {
        return { kind: "usage-error" };
      }

      const value = arguments_[argumentIndex + 1];

      if (value !== "fountain" && value !== "json" && value !== "fdx") {
        return { kind: "usage-error" };
      }

      format = value;
      hasFormat = true;
      argumentIndex += 1;
      continue;
    }

    if (argument === "--output") {
      if (hasOutput) {
        return { kind: "usage-error" };
      }

      const value = arguments_[argumentIndex + 1];

      if (value === undefined || value.startsWith("-")) {
        return { kind: "usage-error" };
      }

      outputPath = value;
      hasOutput = true;
      argumentIndex += 1;
      continue;
    }

    if (argument.startsWith("-")) {
      return { kind: "usage-error" };
    }

    inputPaths.push(argument);
  }

  if (inputPaths.length !== 1) {
    return { kind: "usage-error" };
  }

  return {
    kind: "convert",
    inputPath: inputPaths[0]!,
    format,
    outputPath,
  };
}
