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

/*
  ページ側が読む場所。
  app/rust-output/ に固定する。
*/
const DIST_DIR = path.join(ROOT_DIR, "app", "rust-output");

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
  fs.rmSync(DIST_DIR, { recursive: true, force: true });

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
    warnings.push("js-only では .wasm 本体を生成しません。通常は wasm-js を使用してください。");
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

function makeLoadFunctionName(projectName) {
  return (
    "load" +
    normalizeProjectName(projectName)
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")
  );
}

function makeLoaderJs(config, bindgenJsFileName, wasmFileName) {
  const functionName = makeLoadFunctionName(config.projectName);

  return [
    "// Rust Wasm loader",
    `// build id: ${config.buildId}`,
    `// project: ${config.projectName}`,
    "",
    `import init, * as wasmModule from "./${bindgenJsFileName}";`,
    "",
    `export async function ${functionName}() {`,
    `  const wasmUrl = new URL("./${wasmFileName}", import.meta.url);`,
    "  await init(wasmUrl);",
    "  return wasmModule;",
    "}",
    "",
    "export { wasmModule };",
    `export default ${functionName};`,
    ""
  ].join("\n");
}

function patchBindgenJsForEmbedded(bindgenJsContent) {
  let patched = normalizeLineBreaks(bindgenJsContent);

  /*
    wasm-bindgen の default export と競合しないようにする。
    元の `export default __wbg_init;` を named export に変える。
  */
  patched = patched.replace(
    /export\s+default\s+__wbg_init\s*;/g,
    "export { __wbg_init as __wasmBindgenInit };"
  );

  return patched;
}

function makeEmbeddedLoaderJs(config, bindgenJsContent, wasmBase64) {
  const functionName = makeLoadFunctionName(config.projectName);
  const patchedBindgenJs = patchBindgenJsForEmbedded(bindgenJsContent);

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
    "  await __wbg_init(__embeddedWasmBytes());",
    "  return wasm;",
    "}",
    "",
    `export default ${functionName};`,
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
  const bindgenJsName = `${config.projectName}.bindgen.js`;
  const loaderName = `${config.projectName}.loader.js`;
  const base64Name = `${config.projectName}.base64`;
  const embeddedLoaderName = `${config.projectName}.embedded-loader.js`;
  const buildRequestName = "build-request.json";
  const buildLogName = "build-log.txt";
  const outputSummaryName = "output-summary.txt";
  const zipName = `${config.projectName}-wasm-build.zip`;

  const wasmBytes = readBinary(bindgenWasmPath);
  const wasmBase64 = wasmBytes.toString("base64");

  const bindgenJsContent = readText(bindgenJsPath);
  const loaderJsContent = makeLoaderJs(config, bindgenJsName, wasmName);
  const embeddedLoaderContent = makeEmbeddedLoaderJs(config, bindgenJsContent, wasmBase64);

  writeBinary(path.join(LOOSE_DIR, wasmName), wasmBytes);
  writeText(path.join(LOOSE_DIR, bindgenJsName), bindgenJsContent);
  writeText(path.join(LOOSE_DIR, loaderName), loaderJsContent);
  writeText(path.join(LOOSE_DIR, base64Name), wasmBase64);
  writeText(path.join(LOOSE_DIR, embeddedLoaderName), embeddedLoaderContent);
  writeText(path.join(LOOSE_DIR, buildRequestName), JSON.stringify(config.rawRequest, null, 2));

  const artifactNames = {
    wasmName,
    bindgenJsName,
    loaderName,
    base64Name,
    embeddedLoaderName,
    buildRequestName,
    buildLogName,
    outputSummaryName,
    zipName
  };

  const artifacts = {
    loose: [
      wasmName,
      bindgenJsName,
      loaderName,
      base64Name,
      embeddedLoaderName,
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
      bindgenJsName,
      loaderName,
      base64Name,
      embeddedLoaderName,
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

function createZipFromLooseArtifacts(artifacts) {
  fs.rmSync(ZIP_WORK_DIR, { recursive: true, force: true });
  ensureDir(ZIP_WORK_DIR);

  for (const name of artifacts.zipContents) {
    copyFile(path.join(LOOSE_DIR, name), path.join(ZIP_WORK_DIR, name));
  }

  const zipPath = path.join(DIST_DIR, artifacts.names.zipName);

  runRequired(
    "zip",
    ["-r", zipPath, "."],
    { cwd: ZIP_WORK_DIR }
  );

  return {
    zipName: artifacts.names.zipName,
    zipPath
  };
}

function publishPageArtifacts(config, artifacts, zipInfo) {
  const { buildLogName, outputSummaryName, embeddedLoaderName } = artifacts.names;

  copyFile(path.join(LOOSE_DIR, buildLogName), path.join(DIST_DIR, buildLogName));
  copyFile(path.join(LOOSE_DIR, outputSummaryName), path.join(DIST_DIR, outputSummaryName));
  copyFile(path.join(LOOSE_DIR, embeddedLoaderName), path.join(DIST_DIR, embeddedLoaderName));

  const pageManifest = {
    ok: true,
    buildId: config.buildId,
    projectName: config.projectName,
    generatedAt: new Date().toISOString(),
    displayFiles: {
      buildLog: buildLogName,
      outputSummary: outputSummaryName,
      embeddedLoader: embeddedLoaderName
    },
    zipFile: zipInfo.zipName
  };

  writeText(path.join(DIST_DIR, "page-manifest.json"), JSON.stringify(pageManifest, null, 2));
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

  const manifest = {
    ok: false,
    generatedAt: new Date().toISOString(),
    error: safeString(error && error.message ? error.message : error),
    displayFiles: {
      buildLog: "build-log.txt",
      outputSummary: null,
      embeddedLoader: null
    },
    zipFile: null
  };

  writeText(path.join(DIST_DIR, "page-manifest.json"), JSON.stringify(manifest, null, 2));
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

    const zipInfo = createZipFromLooseArtifacts(artifacts);

    publishPageArtifacts(config, artifacts, zipInfo);

    console.log("Rust Wasm build succeeded.");
    console.log("buildId:", config.buildId);
    console.log("projectName:", config.projectName);
    console.log("page output dir:", DIST_DIR);
    console.log("page artifacts:");
    for (const name of artifacts.page) {
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