import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT_DIR = process.cwd();

const GENERATED_DIR = path.join(ROOT_DIR, ".generated");
const PROJECT_DIR = path.join(GENERATED_DIR, "rust-project");
const SRC_DIR = path.join(PROJECT_DIR, "src");
const BINDGEN_DIR = path.join(GENERATED_DIR, "bindgen");
const LOOSE_DIR = path.join(GENERATED_DIR, "loose-artifacts");
const ZIP_WORK_DIR = path.join(GENERATED_DIR, "zip-work");
const DIST_DIR = path.join(GENERATED_DIR, "dist");

function safeString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeLineBreaks(text) {
  return safeString(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function trimOrEmpty(text) {
  return normalizeLineBreaks(text).trim();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, normalizeLineBreaks(content), "utf8");
}

function writeBinary(filePath, buffer) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buffer);
}

function copyFile(source, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(source, dest);
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readBinary(filePath) {
  return fs.readFileSync(filePath);
}

function cleanWorkspace() {
  fs.rmSync(GENERATED_DIR, { recursive: true, force: true });

  ensureDir(PROJECT_DIR);
  ensureDir(SRC_DIR);
  ensureDir(BINDGEN_DIR);
  ensureDir(LOOSE_DIR);
  ensureDir(ZIP_WORK_DIR);
  ensureDir(DIST_DIR);
}

function readJsonFromEnv() {
  const raw = process.env.BUILD_REQUEST_JSON;

  if (!raw || !raw.trim()) {
    throw new Error(
      "BUILD_REQUEST_JSON が未設定です。GitHub Actions の buildRequestJson 入力欄に JSON を入れてください。"
    );
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      "BUILD_REQUEST_JSON の JSON 解析に失敗しました。\n" +
        safeString(error && error.message ? error.message : error)
    );
  }
}

function unwrapRequest(rawRequest) {
  if (!rawRequest || typeof rawRequest !== "object") {
    throw new Error("buildRequestJson は JSON オブジェクトである必要があります。");
  }

  if (rawRequest.build && typeof rawRequest.build === "object") {
    return rawRequest.build;
  }

  return rawRequest;
}

function normalizeProjectName(name) {
  const value = trimOrEmpty(name || "sample-rust-project") || "sample-rust-project";

  const normalized = value
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "sample-rust-project";
}

function rustCrateOutputName(projectName) {
  return normalizeProjectName(projectName).replace(/-/g, "_");
}

function normalizeVersion(version) {
  const value = trimOrEmpty(version || "0.1.0");
  return value || "0.1.0";
}

function normalizeEdition(edition) {
  const value = trimOrEmpty(edition || "2021");
  if (["2015", "2018", "2021", "2024"].includes(value)) return value;
  return "2021";
}

function normalizeBuildMode(mode) {
  const value = trimOrEmpty(mode || "release").toLowerCase();
  if (value === "debug") return "debug";
  return "release";
}

function normalizeOutputMode(mode) {
  const value = trimOrEmpty(mode || "wasm-js").toLowerCase();
  if (["wasm-js", "wasm-only", "js-only"].includes(value)) return value;
  return "wasm-js";
}

function normalizeEntryPoint(entryPoint) {
  const value = trimOrEmpty(entryPoint || "src/lib.rs") || "src/lib.rs";

  if (value === "lib.rs") return "src/lib.rs";
  if (value === "main.rs") return "src/main.rs";
  if (value.startsWith("/")) return value.slice(1);
  if (value.startsWith("src/")) return value;

  return "src/" + value;
}

function inferEntryTarget(entryPoint) {
  const value = normalizeEntryPoint(entryPoint).toLowerCase();
  if (value.endsWith("main.rs")) return "main";
  return "lib";
}

function normalizeCrateType(crateType, entryTarget) {
  if (entryTarget === "main") return "bin";

  const value = trimOrEmpty(crateType || "cdylib").toLowerCase();

  if (["cdylib", "rlib", "staticlib", "dylib"].includes(value)) {
    return value;
  }

  return "cdylib";
}

function normalizeSubFiles(subFiles) {
  if (!subFiles) return [];

  if (Array.isArray(subFiles)) {
    return subFiles
      .filter((file) => file && typeof file === "object")
      .map((file, index) => ({
        name: trimOrEmpty(file.name || file.path || `sub-${index}.rs`),
        content: normalizeLineBreaks(file.content || "")
      }))
      .filter((file) => file.name);
  }

  if (typeof subFiles === "object") {
    return Object.entries(subFiles)
      .map(([name, content]) => ({
        name: trimOrEmpty(name),
        content: normalizeLineBreaks(content || "")
      }))
      .filter((file) => file.name);
  }

  return [];
}

function collectConfig(rawRequest) {
  const request = unwrapRequest(rawRequest);

  const entryPoint = normalizeEntryPoint(request.entryPoint || "src/lib.rs");
  const entryTarget = inferEntryTarget(entryPoint);
  const projectName = normalizeProjectName(request.projectName || "sample-rust-project");

  return {
    buildId: trimOrEmpty(request.buildId || `rust-build-${Date.now()}`),
    projectName,
    crateOutputName: rustCrateOutputName(projectName),
    version: normalizeVersion(request.version),
    edition: normalizeEdition(request.edition),
    entryPoint,
    entryTarget,
    crateType: normalizeCrateType(request.crateType, entryTarget),
    buildMode: normalizeBuildMode(request.buildMode),
    outputMode: normalizeOutputMode(request.outputMode),
    dependenciesText: normalizeLineBreaks(request.dependenciesText || ""),
    featuresText: normalizeLineBreaks(request.featuresText || ""),
    mainRustCode: normalizeLineBreaks(request.mainRustCode || ""),
    subFiles: normalizeSubFiles(request.subFiles),
    rawRequest
  };
}

function validateConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config.projectName) {
    errors.push("projectName が空です。");
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(config.projectName)) {
    errors.push("projectName は英小文字・数字・ハイフンのみで指定してください。");
  }

  if (!/^\d+\.\d+\.\d+$/.test(config.version)) {
    errors.push("version は 0.1.0 の形式にしてください。");
  }

  if (!config.entryPoint.endsWith(".rs")) {
    errors.push("entryPoint は .rs ファイルを指定してください。");
  }

  if (!trimOrEmpty(config.mainRustCode)) {
    errors.push("mainRustCode が空です。");
  }

  if (config.entryTarget === "main") {
    warnings.push("main.rs は bin 扱いです。wasm ライブラリ用途なら lib.rs 推奨です。");
  }

  if (config.outputMode === "js-only") {
    warnings.push("js-only 指定ですが、完成フロー維持のため .wasm / loader.js / embedded-loader.js も生成します。");
  }

  if (config.outputMode === "wasm-only") {
    warnings.push("wasm-only 指定ですが、完成フロー維持のため loader.js / embedded-loader.js も生成します。");
  }

  return { errors, warnings };
}

function buildCargoToml(config) {
  const lines = [];

  lines.push("[package]");
  lines.push(`name = "${config.projectName}"`);
  lines.push(`version = "${config.version}"`);
  lines.push(`edition = "${config.edition}"`);
  lines.push("");

  if (config.entryTarget === "lib") {
    lines.push("[lib]");
    lines.push(`crate-type = ["${config.crateType}"]`);
    lines.push("");
  }

  if (config.entryTarget === "main") {
    lines.push("[[bin]]");
    lines.push(`name = "${config.projectName}"`);
    lines.push(`path = "${config.entryPoint}"`);
    lines.push("");
  }

  lines.push("[dependencies]");
  if (trimOrEmpty(config.dependenciesText)) {
    lines.push(trimOrEmpty(config.dependenciesText));
  }
  lines.push("");

  if (trimOrEmpty(config.featuresText)) {
    lines.push("[features]");
    lines.push(trimOrEmpty(config.featuresText));
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

function normalizeProjectFilePath(fileName) {
  const clean = trimOrEmpty(fileName).replace(/\\/g, "/").replace(/^\/+/, "");

  if (!clean) {
    throw new Error("空のファイル名は使えません。");
  }

  if (clean.includes("..")) {
    throw new Error("危険なファイルパスが含まれています: " + fileName);
  }

  if (clean.startsWith("src/")) {
    return clean;
  }

  return "src/" + clean;
}

function createRustProject(config) {
  writeText(path.join(PROJECT_DIR, "Cargo.toml"), buildCargoToml(config));
  writeText(path.join(PROJECT_DIR, config.entryPoint), config.mainRustCode);

  for (const file of config.subFiles) {
    const relativePath = normalizeProjectFilePath(file.name);

    if (relativePath === config.entryPoint) {
      continue;
    }

    writeText(path.join(PROJECT_DIR, relativePath), file.content);
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT_DIR,
    env: {
      ...process.env,
      ...(options.env || {})
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return {
    command,
    args,
    cwd: options.cwd || ROOT_DIR,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    ok: result.status === 0
  };
}

function runRequired(command, args, options = {}) {
  const result = runCommand(command, args, options);

  if (!result.ok) {
    const message = [
      `コマンドに失敗しました: ${command} ${args.join(" ")}`,
      `cwd: ${result.cwd}`,
      `status: ${result.status}`,
      "",
      "----- stdout -----",
      result.stdout || "(なし)",
      "",
      "----- stderr -----",
      result.stderr || "(なし)"
    ].join("\n");

    throw new Error(message);
  }

  return result;
}

function runCargoBuild(config) {
  const args = ["build", "--target", "wasm32-unknown-unknown"];

  if (config.buildMode === "release") {
    args.push("--release");
  }

  return runRequired("cargo", args, { cwd: PROJECT_DIR });
}

function findCargoWasm(config) {
  const modeDir = config.buildMode === "release" ? "release" : "debug";

  const expectedPath = path.join(
    PROJECT_DIR,
    "target",
    "wasm32-unknown-unknown",
    modeDir,
    `${config.crateOutputName}.wasm`
  );

  if (fileExists(expectedPath)) {
    return expectedPath;
  }

  const searchDir = path.join(PROJECT_DIR, "target", "wasm32-unknown-unknown", modeDir);

  if (!fileExists(searchDir)) {
    return null;
  }

  const candidates = fs
    .readdirSync(searchDir)
    .filter((name) => name.endsWith(".wasm"))
    .map((name) => path.join(searchDir, name));

  return candidates[0] || null;
}

function runWasmBindgen(config, cargoWasmPath) {
  fs.rmSync(BINDGEN_DIR, { recursive: true, force: true });
  ensureDir(BINDGEN_DIR);

  return runRequired(
    "wasm-bindgen",
    [
      cargoWasmPath,
      "--target",
      "web",
      "--out-dir",
      BINDGEN_DIR,
      "--out-name",
      config.projectName
    ],
    { cwd: PROJECT_DIR }
  );
}

function findBindgenWasm(config) {
  const direct = path.join(BINDGEN_DIR, `${config.projectName}_bg.wasm`);

  if (fileExists(direct)) {
    return direct;
  }

  const candidates = fs
    .readdirSync(BINDGEN_DIR)
    .filter((name) => name.endsWith(".wasm"))
    .map((name) => path.join(BINDGEN_DIR, name));

  return candidates[0] || null;
}

function findBindgenJs(config) {
  const direct = path.join(BINDGEN_DIR, `${config.projectName}.js`);

  if (fileExists(direct)) {
    return direct;
  }

  const candidates = fs
    .readdirSync(BINDGEN_DIR)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(BINDGEN_DIR, name));

  return candidates[0] || null;
}

function makeLoaderFunctionName(config) {
  return (
    "load" +
    config.projectName
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")
  );
}

function findDefaultExportFunctionName(jsText) {
  const match = jsText.match(/export\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;/);
  return match ? match[1] : "__wbg_init";
}

function patchBindgenWasmUrl(bindgenJsContent, wasmFileName) {
  return bindgenJsContent.replace(
    /new URL\((['"`])[^'"`]*\.wasm\1,\s*import\.meta\.url\)/g,
    `new URL("./${wasmFileName}", import.meta.url)`
  );
}

function patchBindgenDefaultInputToEmbeddedBytes(bindgenJsContent) {
  return bindgenJsContent.replace(
    /input\s*=\s*new URL\((['"`])[^'"`]*\.wasm\1,\s*import\.meta\.url\)\s*;/g,
    "input = __embeddedWasmBytes();"
  );
}

function makeLoaderJs(config, bindgenJsContent, wasmFileName) {
  const functionName = makeLoaderFunctionName(config);
  const initFunctionName = findDefaultExportFunctionName(bindgenJsContent);
  const patchedBindgenJs = patchBindgenWasmUrl(bindgenJsContent, wasmFileName);

  return [
    "// Rust Wasm loader",
    `// build id: ${config.buildId}`,
    `// project: ${config.projectName}`,
    "// This file is generated from wasm-bindgen output.",
    "",
    patchedBindgenJs,
    "",
    `export async function ${functionName}(input) {`,
    `  await ${initFunctionName}(input);`,
    "  return wasm;",
    "}",
    "",
    `export { ${functionName} as loadWasm };`,
    ""
  ].join("\n");
}

function makeEmbeddedLoaderJs(config, bindgenJsContent, wasmBase64) {
  const functionName = makeLoaderFunctionName(config);
  const initFunctionName = findDefaultExportFunctionName(bindgenJsContent);
  const patchedBindgenJs = patchBindgenDefaultInputToEmbeddedBytes(bindgenJsContent);

  return [
    "// Rust Wasm embedded loader",
    `// build id: ${config.buildId}`,
    `// project: ${config.projectName}`,
    "// This file includes the wasm binary as base64.",
    "",
    `const __embeddedWasmBase64 = ${JSON.stringify(wasmBase64)};`,
    "",
    "function __embeddedWasmBytes() {",
    "  const binary = atob(__embeddedWasmBase64);",
    "  const bytes = new Uint8Array(binary.length);",
    "  for (let i = 0; i < binary.length; i += 1) {",
    "    bytes[i] = binary.charCodeAt(i);",
    "  }",
    "  return bytes;",
    "}",
    "",
    patchedBindgenJs,
    "",
    `export async function ${functionName}() {`,
    `  await ${initFunctionName}();`,
    "  return wasm;",
    "}",
    "",
    `export { ${functionName} as loadWasm };`,
    ""
  ].join("\n");
}

function makeOutputSummary(config, artifacts) {
  const lines = [];

  lines.push("=== Rust Wasm Output Summary ===");
  lines.push("status: success");
  lines.push("buildId: " + config.buildId);
  lines.push("projectName: " + config.projectName);
  lines.push("buildMode: " + config.buildMode);
  lines.push("outputMode: " + config.outputMode);
  lines.push("");
  lines.push("page display:");
  lines.push("- build-log.txt");
  lines.push("- output-summary.txt");
  lines.push("- " + artifacts.names.embeddedLoaderName);
  lines.push("- " + artifacts.names.zipName);
  lines.push("");
  lines.push("zip contents:");
  for (const artifact of artifacts.zipContents) {
    lines.push("- " + artifact);
  }

  return lines.join("\n");
}

function makeBuildLog(config, cargoResult, bindgenResult, artifacts) {
  const lines = [];

  lines.push("=== Rust Wasm Build ===");
  lines.push("status: success");
  lines.push("buildId: " + config.buildId);
  lines.push("projectName: " + config.projectName);
  lines.push("version: " + config.version);
  lines.push("edition: " + config.edition);
  lines.push("entryPoint: " + config.entryPoint);
  lines.push("entryTarget: " + config.entryTarget);
  lines.push("crateType: " + config.crateType);
  lines.push("buildMode: " + config.buildMode);
  lines.push("outputMode: " + config.outputMode);
  lines.push("");
  lines.push("generated loose artifacts:");
  for (const artifact of artifacts.loose) {
    lines.push("- " + artifact);
  }
  lines.push("");
  lines.push("page artifacts:");
  for (const artifact of artifacts.page) {
    lines.push("- " + artifact);
  }
  lines.push("");
  lines.push("zip contents:");
  for (const artifact of artifacts.zipContents) {
    lines.push("- " + artifact);
  }
  lines.push("");
  lines.push("----- cargo stdout -----");
  lines.push(cargoResult.stdout || "(なし)");
  lines.push("");
  lines.push("----- cargo stderr -----");
  lines.push(cargoResult.stderr || "(なし)");
  lines.push("");
  lines.push("----- wasm-bindgen stdout -----");
  lines.push(bindgenResult.stdout || "(なし)");
  lines.push("");
  lines.push("----- wasm-bindgen stderr -----");
  lines.push(bindgenResult.stderr || "(なし)");

  return lines.join("\n");
}

function createLooseArtifacts(config, cargoResult, bindgenResult) {
  const cargoWasmPath = findCargoWasm(config);
  if (!cargoWasmPath) {
    throw new Error(".wasm ファイルが cargo build で生成されませんでした。");
  }

  const bindgenWasmPath = findBindgenWasm(config);
  const bindgenJsPath = findBindgenJs(config);

  if (!bindgenWasmPath) {
    throw new Error("wasm-bindgen 後の .wasm ファイルが見つかりません。");
  }

  if (!bindgenJsPath) {
    throw new Error("wasm-bindgen 後の JavaScript ファイルが見つかりません。");
  }

  const wasmName = `${config.projectName}.wasm`;
  const loaderName = `${config.projectName}.loader.js`;
  const embeddedLoaderName = `${config.projectName}.embedded-loader.js`;
  const base64Name = `${config.projectName}.base64`;
  const buildLogName = "build-log.txt";
  const buildRequestName = "build-request.json";
  const outputSummaryName = "output-summary.txt";
  const zipName = `${config.projectName}-wasm-build.zip`;

  const wasmBytes = readBinary(bindgenWasmPath);
  const wasmBase64 = wasmBytes.toString("base64");

  const bindgenJsContent = readText(bindgenJsPath);
  const loaderJsContent = makeLoaderJs(config, bindgenJsContent, wasmName);
  const embeddedLoaderContent = makeEmbeddedLoaderJs(config, bindgenJsContent, wasmBase64);

  writeBinary(path.join(LOOSE_DIR, wasmName), wasmBytes);
  writeText(path.join(LOOSE_DIR, loaderName), loaderJsContent);
  writeText(path.join(LOOSE_DIR, embeddedLoaderName), embeddedLoaderContent);
  writeText(path.join(LOOSE_DIR, base64Name), wasmBase64);
  writeText(path.join(LOOSE_DIR, buildRequestName), JSON.stringify(config.rawRequest, null, 2));

  const artifactNames = {
    wasmName,
    loaderName,
    embeddedLoaderName,
    base64Name,
    buildLogName,
    buildRequestName,
    outputSummaryName,
    zipName
  };

  const artifacts = {
    loose: [
      wasmName,
      loaderName,
      embeddedLoaderName,
      base64Name,
      buildRequestName,
      buildLogName,
      outputSummaryName
    ],
    page: [
      buildLogName,
      outputSummaryName,
      embeddedLoaderName,
      zipName
    ],
    zipContents: [
      wasmName,
      loaderName,
      embeddedLoaderName,
      base64Name,
      buildLogName,
      buildRequestName
    ],
    names: artifactNames
  };

  const buildLogText = makeBuildLog(config, cargoResult, bindgenResult, artifacts);
  const outputSummaryText = makeOutputSummary(config, artifacts);

  writeText(path.join(LOOSE_DIR, buildLogName), buildLogText);
  writeText(path.join(LOOSE_DIR, outputSummaryName), outputSummaryText);

  return artifacts;
}

function publishPageArtifacts(config, artifacts) {
  const { buildLogName, outputSummaryName, embeddedLoaderName, zipName } = artifacts.names;

  copyFile(path.join(LOOSE_DIR, buildLogName), path.join(DIST_DIR, buildLogName));
  copyFile(path.join(LOOSE_DIR, outputSummaryName), path.join(DIST_DIR, outputSummaryName));
  copyFile(path.join(LOOSE_DIR, embeddedLoaderName), path.join(DIST_DIR, embeddedLoaderName));

  const pageManifest = {
    ok: true,
    buildId: config.buildId,
    projectName: config.projectName,
    generatedAt: new Date().toISOString(),
    displayFiles: [
      buildLogName,
      outputSummaryName,
      embeddedLoaderName
    ],
    zipFile: zipName
  };

  writeText(path.join(DIST_DIR, "page-manifest.json"), JSON.stringify(pageManifest, null, 2));
}

function createZipFromLooseArtifacts(config, artifacts) {
  fs.rmSync(ZIP_WORK_DIR, { recursive: true, force: true });
  ensureDir(ZIP_WORK_DIR);

  for (const name of artifacts.zipContents) {
    copyFile(path.join(LOOSE_DIR, name), path.join(ZIP_WORK_DIR, name));
  }

  const zipName = artifacts.names.zipName;
  const zipPath = path.join(DIST_DIR, zipName);

  const zipResult = runRequired(
    "zip",
    ["-r", zipPath, "."],
    { cwd: ZIP_WORK_DIR }
  );

  return {
    zipName,
    zipPath,
    zipResult
  };
}

function publishZipArtifact(config, zipInfo, artifacts) {
  const zipManifest = {
    ok: true,
    buildId: config.buildId,
    projectName: config.projectName,
    zipFile: zipInfo.zipName,
    zipContents: artifacts.zipContents,
    generatedAt: new Date().toISOString()
  };

  writeText(path.join(DIST_DIR, "zip-manifest.json"), JSON.stringify(zipManifest, null, 2));
}

function writeFailureLog(error) {
  ensureDir(DIST_DIR);

  const text = [
    "=== Rust Wasm Build ===",
    "status: error",
    "",
    safeString(error && error.stack ? error.stack : error)
  ].join("\n");

  writeText(path.join(DIST_DIR, "build-log.txt"), text);
}

function main() {
  try {
    const rawRequest = readJsonFromEnv();
    const config = collectConfig(rawRequest);

    const validation = validateConfig(config);

    if (validation.errors.length) {
      throw new Error("ビルド設定が不正です。\n- " + validation.errors.join("\n- "));
    }

    cleanWorkspace();
    createRustProject(config);

    const cargoResult = runCargoBuild(config);

    const cargoWasmPath = findCargoWasm(config);
    if (!cargoWasmPath) {
      throw new Error("cargo build 後の .wasm ファイルが見つかりません。");
    }

    const bindgenResult = runWasmBindgen(config, cargoWasmPath);

    const artifacts = createLooseArtifacts(config, cargoResult, bindgenResult);

    publishPageArtifacts(config, artifacts);

    const zipInfo = createZipFromLooseArtifacts(config, artifacts);

    publishZipArtifact(config, zipInfo, artifacts);

    console.log("Rust Wasm build succeeded.");
    console.log("buildId:", config.buildId);
    console.log("projectName:", config.projectName);
    console.log("page artifacts:");
    for (const name of artifacts.page) {
      console.log("-", name);
    }
    console.log("zip contents:");
    for (const name of artifacts.zipContents) {
      console.log("-", name);
    }
    console.log("zip:", zipInfo.zipName);
  } catch (error) {
    writeFailureLog(error);
    console.error(safeString(error && error.stack ? error.stack : error));
    process.exit(1);
  }
}

main();