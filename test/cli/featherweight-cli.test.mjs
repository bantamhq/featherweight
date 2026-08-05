import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { spawnSync } from "node:child_process";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const inputPdf = join(repositoryRoot, "test", "brick-and-steel.pdf");
const scannedInputPdf = join(
  repositoryRoot,
  "test",
  "brick-and-steel-scanned.pdf",
);
const fountainFixture = join(
  repositoryRoot,
  "test",
  "fixtures",
  "fountain",
  "brick-and-steel.expected.fountain",
);
const jsonFixture = join(
  repositoryRoot,
  "test",
  "fixtures",
  "cli",
  "brick-and-steel.expected.json",
);
const usageError =
  "featherweight: Invalid arguments. Run 'featherweight --help' for usage.\n";
const readError = "featherweight: Unable to read input PDF.\n";
const extractionError =
  "featherweight: Unable to extract native PDF text.\n";
const samePathError =
  "featherweight: Input and output paths must be different.\n";
const writeError = "featherweight: Unable to write output.\n";
const expectedEmptyJson =
  "{\n" +
  '  "titlePage": [],\n' +
  '  "elements": []\n' +
  "}\n";

let packageRoot;
let caseRoot;
let executablePath;
let expectedFountain;
let expectedJson;
let packageVersion;

before(() => {
  packageRoot = mkdtempSync(join(tmpdir(), "featherweight-cli-package-"));
  caseRoot = mkdtempSync(join(tmpdir(), "featherweight-cli-cases-"));

  const temporaryPackageJson = join(packageRoot, "package.json");
  copyFileSync(join(repositoryRoot, "package.json"), temporaryPackageJson);
  const packageManifest = JSON.parse(
    readFileSync(temporaryPackageJson, "utf8"),
  );
  const declaredBinTarget = packageManifest.bin?.featherweight;
  assert.equal(typeof declaredBinTarget, "string");
  assert.equal(declaredBinTarget.length > 0, true);
  packageVersion = "987.654.321-cli-contract";
  packageManifest.version = packageVersion;
  writeFileSync(
    temporaryPackageJson,
    JSON.stringify(packageManifest, null, 2) + "\n",
  );
  symlinkSync(
    join(repositoryRoot, "node_modules"),
    join(packageRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );

  const require = createRequire(import.meta.url);
  const typescriptPackageJson = require.resolve("typescript/package.json");
  const typescriptManifest = JSON.parse(
    readFileSync(typescriptPackageJson, "utf8"),
  );
  const typescriptCompiler = join(
    dirname(typescriptPackageJson),
    typescriptManifest.bin.tsc,
  );
  const compilation = spawnSync(
    process.execPath,
    [
      typescriptCompiler,
      "--project",
      join(repositoryRoot, "tsconfig.build.json"),
      "--outDir",
      join(packageRoot, "dist"),
      "--pretty",
      "false",
    ],
    { cwd: repositoryRoot, encoding: "utf8", shell: false },
  );

  assert.equal(compilation.error, undefined);
  assert.equal(compilation.status, 0, compilation.stderr);
  assert.equal(existsSync(join(packageRoot, "dist", "index.js")), true);
  assert.equal(
    createRequire(temporaryPackageJson).resolve("@firecrawl/pdf-inspector")
      .length > 0,
    true,
  );

  executablePath = resolve(packageRoot, declaredBinTarget);
  assert.equal(
    existsSync(executablePath),
    true,
    "Fresh build did not emit the declared featherweight bin target",
  );
  const shebang = readFileSync(executablePath, "utf8").split(/\r?\n/u, 1)[0];
  assert.match(
    shebang,
    /^#!\s*(?:\S*\/node(?:\s+.*)?|\S*\/env(?:\s+-S)?\s+node(?:\s+.*)?)$/u,
  );

  expectedFountain = readFileSync(fountainFixture, "utf8");
  expectedJson =
    JSON.stringify(JSON.parse(readFileSync(jsonFixture, "utf8")), null, 2) +
    "\n";
});

after(() => {
  removeOwnedTemporaryRoot(packageRoot, "featherweight-cli-package-");
  removeOwnedTemporaryRoot(caseRoot, "featherweight-cli-cases-");
});

test("emits exact Fountain to stdout by default and when explicitly selected", () => {
  const inputHash = hashFile(inputPdf);

  for (const arguments_ of [
    [inputPdf],
    ["--format", "fountain", inputPdf],
  ]) {
    assertExecution(runCli(arguments_), {
      status: 0,
      stdout: expectedFountain,
      stderr: "",
    });
  }

  assert.equal(hashFile(inputPdf), inputHash);
});

test("emits exact reviewed JSON and exact native-empty artifacts to stdout", () => {
  assertExecution(runCli([inputPdf, "--format", "json"]), {
    status: 0,
    stdout: expectedJson,
    stderr: "",
  });
  assertExecution(runCli([scannedInputPdf]), {
    status: 0,
    stdout: "",
    stderr: "",
  });
  assertExecution(runCli([scannedInputPdf, "--format", "json"]), {
    status: 0,
    stdout: expectedEmptyJson,
    stderr: "",
  });
});

test("overwrites Fountain and JSON output files without altering the input", () => {
  const relativeWorkspace = "output files with spaces";
  const workspace = join(caseRoot, relativeWorkspace);
  const copiedInput = join(workspace, "brick and steel.pdf");
  const fountainOutput = join(workspace, "screenplay.fountain");
  const jsonOutput = join(workspace, "screenplay.json");
  const relativeInput = join(relativeWorkspace, "brick and steel.pdf");
  const relativeFountainOutput = join(
    relativeWorkspace,
    "screenplay.fountain",
  );
  mkdirSync(workspace);
  copyFileSync(inputPdf, copiedInput);
  writeFileSync(fountainOutput, "old Fountain content");
  writeFileSync(jsonOutput, "old JSON content");
  const inputHash = hashFile(copiedInput);

  assertExecution(runCli([relativeInput, "--output", relativeFountainOutput]), {
    status: 0,
    stdout: "",
    stderr: "",
  });
  assertExecution(
    runCli(["--format", "json", "--output", jsonOutput, copiedInput]),
    { status: 0, stdout: "", stderr: "" },
  );

  assert.equal(readFileSync(fountainOutput, "utf8"), expectedFountain);
  assert.equal(readFileSync(jsonOutput, "utf8"), expectedJson);
  assert.equal(hashFile(copiedInput), inputHash);
});

test("communicates help and returns exact version and usage process contracts", () => {
  const help = runCli(["--help"]);
  assert.deepEqual(
    { status: help.status, stderr: help.stderr },
    { status: 0, stderr: "" },
  );
  assert.equal(help.stdout.includes("featherweight <input.pdf>"), true);

  for (const expectedHelpTerm of [
    "--format",
    "--output",
    "--help",
    "--version",
    "json",
  ]) {
    assert.equal(help.stdout.toLowerCase().includes(expectedHelpTerm), true);
  }
  assert.match(
    help.stdout,
    /(?:fountain[^\r\n]{0,80}default|default[^\r\n]{0,80}fountain)/iu,
  );

  assertExecution(runCli(["--version"]), {
    status: 0,
    stdout: `${packageVersion}\n`,
    stderr: "",
  });

  const invalidArguments = [
    ["--unknown", inputPdf],
    ["-h", inputPdf],
    ["-v", inputPdf],
    ["-f", "json", inputPdf],
    ["-o", "result.fountain", inputPdf],
    ["-"],
    [inputPdf, "--format", "JSON"],
    [inputPdf, "--format", "fdx"],
    [inputPdf, "--format"],
    [inputPdf, "--output"],
    [inputPdf, "--format", "json", "--format", "fountain"],
    [inputPdf, "--output", "one", "--output", "two"],
    [],
    [inputPdf, "extra.pdf"],
    ["--help", "--version"],
    ["--help", inputPdf],
    [inputPdf, "--version"],
    ["--help", "--format", "json"],
    ["--format", "fountain", "--version"],
    ["--help", "--output", "result.fountain"],
    ["--output", "result.fountain", "--version"],
  ];

  for (const arguments_ of invalidArguments) {
    assertExecution(runCli(arguments_), {
      status: 2,
      stdout: "",
      stderr: usageError,
    });
  }
});

test("sanitizes operational failures and protects the input", () => {
  const nonexistentInput = join(caseRoot, "missing.pdf");
  assertExecution(runCli([nonexistentInput]), {
    status: 1,
    stdout: "",
    stderr: readError,
  });

  const malformedInput = join(caseRoot, "malformed.pdf");
  writeFileSync(malformedInput, "not-pdf");
  assertExecution(runCli([malformedInput]), {
    status: 1,
    stdout: "",
    stderr: extractionError,
  });

  const protectedDirectory = join(caseRoot, "same-path");
  const protectedInput = join(protectedDirectory, "protected.pdf");
  const lexicalInput =
    `${protectedDirectory}${sep}missing-segment${sep}..${sep}protected.pdf`;
  const lexicalOutput = `${protectedDirectory}${sep}.${sep}protected.pdf`;
  mkdirSync(protectedDirectory);
  copyFileSync(inputPdf, protectedInput);
  const protectedHash = hashFile(protectedInput);
  assert.notEqual(lexicalInput, lexicalOutput);
  assert.equal(resolve(lexicalInput), resolve(lexicalOutput));
  assertExecution(runCli([lexicalInput, "--output", lexicalOutput]), {
    status: 1,
    stdout: "",
    stderr: samePathError,
  });
  assert.equal(hashFile(protectedInput), protectedHash);

  const missingParent = join(caseRoot, "missing-parent");
  assertExecution(
    runCli([
      inputPdf,
      "--output",
      join(missingParent, "result.fountain"),
    ]),
    { status: 1, stdout: "", stderr: writeError },
  );
  assert.equal(existsSync(missingParent), false);

  const directoryOutput = join(caseRoot, "directory-output");
  mkdirSync(directoryOutput);
  assertExecution(runCli([inputPdf, "--output", directoryOutput]), {
    status: 1,
    stdout: "",
    stderr: writeError,
  });
});

function runCli(arguments_) {
  return spawnSync(process.execPath, [executablePath, ...arguments_], {
    cwd: caseRoot,
    encoding: "utf8",
    shell: false,
  });
}

function assertExecution(actual, expected) {
  assert.deepEqual(
    { status: actual.status, stdout: actual.stdout, stderr: actual.stderr },
    expected,
  );
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function removeOwnedTemporaryRoot(path, prefix) {
  if (path === undefined) {
    return;
  }

  assert.equal(dirname(path), tmpdir());
  assert.equal(basename(path).startsWith(prefix), true);
  rmSync(path, { recursive: true, force: true });
}
