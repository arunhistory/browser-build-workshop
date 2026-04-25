import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT_DIR = process.cwd();
const GENERATED_DIR = path.join(ROOT_DIR, ".generated");
const PROJECT_DIR = path.join(GENERATED_DIR, "rust-project");
const SRC_DIR = path.join(PROJECT_DIR, "src");
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

function readJsonFromEnv() {
  const raw = process.env.BUILD_REQUEST_JSON;

  if (!raw || !raw.trim()) {
    throw new Error(
      "BUILD_REQUEST_JSON が未設定です。GitHub Actions の手動実行入力に buildRequestJson を入れてください。"
    );
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      "BUILD_REQUEST_JSON の JSON 解析に失敗しました。\n" +
        String(error && error.message ? error.message : error)
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

function normalizeEntryPoint(entryPoint) {
  const value = trimOrEmpty(entryPoint || "src/lib.rs") || "src/lib.rs";

  if (value.startsWith("/")) {
    return value.slice(1);
  }

  if (value === "lib.rs") return "src/lib.rs";
  if (value === "main.rs") return "src/main.rs";

  return value;
}

function inferEntryTarget(entryPoint) {
  const value = normalizeEntryPoint(entryPoint).toLowerCase();
  if (value.endsWith("main.rs")) return "main";
  return "lib";
}

function normalizeCrateType(crateType, entryTarget) {
  const value = trimOrEmpty(crateType || "cdylib").toLowerCase();

  if (entryTarget === "main") {
    return "bin";
  }

  if (value === "cdylib") {
    return "cdylib";
  }

  return "cdylib";
}

function normalizeOutputMode(outputMode) {
  const value = trimOrEmpty(outputMode || "wasm-js").toLowerCase();

  if (value === "wasm-only") return "wasm-only";
  if (value === "js-only") return "js-only";

  return "wasm-js";
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

  return {
    buildId: trimOrEmpty(request.buildId || `rust-build-${Date.now()}`),
    projectName: normalizeProjectName(request.projectName || "sample-rust-project"),
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
    subFiles: normalizeSubFiles(request.subFiles)
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
    errors.push("version は 0.1.0 のような形式にしてください。");
  }

  if (!config.entryPoint.endsWith(".rs")) {
    errors.push("entryPoint は .rs ファイルを指定してください。");
  }

  if (config.entryPoint.includes("..")) {
    errors.push("entryPoint に危険なパスが含まれています。");
  }

  if (!trimOrEmpty(config.mainRustCode)) {
    errors.push("mainRustCode が空です。");
  }

  if (config.entryTarget === "main") {
    warnings.push(
      "main.rs はバイナリ扱いです。Wasmライブラリ用途なら src/lib.rs を推奨します。"
    );
  }

  if (config.outputMode === "js-only") {
    warnings.push(
      "js-only は loader/example のみ出力します。ただし検証のため Rust ビルド自体は実行します。"
    );
  }

  return { errors, warnings };
}

function cleanGenerated() {
  fs.rmSync(GENERATED_DIR, { recursive: true, force: true });
  ensureDir(PROJECT_DIR);
  ensureDir(SRC_DIR);
  ensureDir(DIST_DIR);
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
  const dependencies = trimOrEmpty(config.dependenciesText);
  if (dependencies) {
    lines.push(dependencies);
  }
  lines.push("");

  const features = trimOrEmpty(config.featuresText);
  if (features) {
    lines.push("[features]");
    lines.push(features);
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

  if (!clean.endsWith(".rs")) {
    throw new Error("補助ファイルは .rs のみ対応しています: " + fileName);
  }

  if (clean.startsWith("src/")) {
    return clean;
  }

  return "src/" + clean;
}

function createProjectFiles(config) {
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

function buildRustProject(config) {
  const args = ["build", "--target", "wasm32-unknown-unknown"];

  if (config.buildMode === "release") {
    args.push("--release");
  }

  return runRequired("cargo", args, { cwd: PROJECT_DIR });
}

function findWasmOutput(config) {
  const crateOutputName = rustCrateOutputName(config.projectName);
  const modeDir = config.buildMode === "release" ? "release" : "debug";

  const expectedPath = path.join(
    PROJECT_DIR,
    "target",
    "wasm32-unknown-unknown",
    modeDir,
    `${crateOutputName}.wasm`
  );

  if (fs.existsSync(expectedPath)) {
    return expectedPath;
  }

  const searchDir = path.join(
    PROJECT_DIR,
    "target",
    "wasm32-unknown-unknown",
    modeDir
  );

  if (!fs.existsSync(searchDir)) {
    return null;
  }

  const candidates = fs
    .readdirSync(searchDir)
    .filter((name) => name.endsWith(".wasm"))
    .map((name) => path.join(searchDir, name));

  return candidates[0] || null;
}

function pascalCaseFromProjectName(projectName) {
  return (
    "load" +
    projectName
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")
  );
}

function makeLoaderJs(config) {
  const functionName = pascalCaseFromProjectName(config.projectName);
  const wasmFileName = `./${config.projectName}.wasm`;

  return [
    "// Rust Wasm loader",
    `// build id: ${config.buildId}`,
    `// project: ${config.projectName}`,
    "",
    `export async function ${functionName}(imports = {}) {`,
    `  const wasmUrl = new URL("${wasmFileName}", import.meta.url);`,
    "  const response = await fetch(wasmUrl);",
    "",
    "  if (!response.ok) {",
    "    throw new Error(`Wasm fetch failed: ${response.status} ${response.statusText}`);",
    "  }",
    "",
    "  const bytes = await response.arrayBuffer();",
    "  const result = await WebAssembly.instantiate(bytes, imports);",
    "  return result.instance;",
    "}",
    "",
    "export default " + functionName + ";",
    ""
  ].join("\n");
}

function makeExampleJs(config) {
  const functionName = pascalCaseFromProjectName(config.projectName);

  return [
    "// Example usage",
    `import { ${functionName} } from "./${config.projectName}.loader.js";`,
    "",
    "async function main() {",
    `  const instance = await ${functionName}({});`,
    "  console.log('Wasm instance:', instance);",
    "  console.log('exports:', Object.keys(instance.exports));",
    "}",
    "",
    "main().catch(console.error);",
    ""
  ].join("\n");
}

function makeBuildLog(config, validation, cargoResult, artifacts) {
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

  lines.push("warnings:");
  if (validation.warnings.length) {
    for (const warning of validation.warnings) {
      lines.push("- " + warning);
    }
  } else {
    lines.push("- なし");
  }

  lines.push("");
  lines.push("generated files:");
  for (const file of artifacts) {
    lines.push("- " + file.name);
  }

  lines.push("");
  lines.push("----- cargo stdout -----");
  lines.push(cargoResult.stdout || "(なし)");
  lines.push("");
  lines.push("----- cargo stderr -----");
  lines.push(cargoResult.stderr || "(なし)");

  return lines.join("\n");
}

function copyArtifacts(config, validation, cargoResult) {
  const artifacts = [];

  const cargoToml = fs.readFileSync(path.join(PROJECT_DIR, "Cargo.toml"), "utf8");

  writeText(path.join(DIST_DIR, "Cargo.toml"), cargoToml);

  artifacts.push({
    name: "Cargo.toml",
    type: "text/plain;charset=utf-8",
    content: cargoToml
  });

  const wasmPath = findWasmOutput(config);

  if (!wasmPath) {
    throw new Error(
      ".wasm ファイルが生成されませんでした。crate-type、entryPoint、Rustコードを確認してください。"
    );
  }

  if (config.outputMode === "wasm-js" || config.outputMode === "wasm-only") {
    const distWasmName = `${config.projectName}.wasm`;
    const distWasmPath = path.join(DIST_DIR, distWasmName);

    fs.copyFileSync(wasmPath, distWasmPath);

    artifacts.push({
      name: distWasmName,
      type: "application/wasm",
      content: "[binary wasm artifact]"
    });
  }

  if (config.outputMode === "wasm-js" || config.outputMode === "js-only") {
    const loaderName = `${config.projectName}.loader.js`;
    const exampleName = `${config.projectName}.example.js`;
    const loaderContent = makeLoaderJs(config);
    const exampleContent = makeExampleJs(config);

    writeText(path.join(DIST_DIR, loaderName), loaderContent);
    writeText(path.join(DIST_DIR, exampleName), exampleContent);

    artifacts.push({
      name: loaderName,
      type: "application/javascript;charset=utf-8",
      content: loaderContent
    });

    artifacts.push({
      name: exampleName,
      type: "application/javascript;charset=utf-8",
      content: exampleContent
    });
  }

  const logText = makeBuildLog(config, validation, cargoResult, artifacts);
  writeText(path.join(DIST_DIR, "build-log.txt"), logText);

  artifacts.unshift({
    name: "build-log.txt",
    type: "text/plain;charset=utf-8",
    content: logText
  });

  const manifest = {
    ok: true,
    buildId: config.buildId,
    projectName: config.projectName,
    version: config.version,
    edition: config.edition,
    buildMode: config.buildMode,
    outputMode: config.outputMode,
    entryPoint: config.entryPoint,
    entryTarget: config.entryTarget,
    crateType: config.crateType,
    generatedAt: new Date().toISOString(),
    artifacts: artifacts.map((file) => ({
      name: file.name,
      type: file.type
    }))
  };

  const manifestText = JSON.stringify(manifest, null, 2);
  writeText(path.join(DIST_DIR, "manifest.json"), manifestText);

  artifacts.push({
    name: "manifest.json",
    type: "application/json;charset=utf-8",
    content: manifestText
  });

  return artifacts;
}

function writeFailureLog(error) {
  ensureDir(DIST_DIR);

  const text = [
    "=== Rust Wasm Build ===",
    "status: error",
    "",
    String(error && error.stack ? error.stack : error)
  ].join("\n");

  writeText(path.join(DIST_DIR, "build-log.txt"), text);
}

function main() {
  try {
    const rawRequest = readJsonFromEnv();
    const config = collectConfig(rawRequest);

    cleanGenerated();

    const validation = validateConfig(config);

    if (validation.errors.length) {
      throw new Error("ビルド設定が不正です。\n- " + validation.errors.join("\n- "));
    }

    createProjectFiles(config);

    const cargoResult = buildRustProject(config);
    const artifacts = copyArtifacts(config, validation, cargoResult);

    console.log("Rust Wasm build succeeded.");
    console.log("buildId:", config.buildId);
    console.log("projectName:", config.projectName);
    console.log("artifacts:");

    for (const file of artifacts) {
      console.log("-", file.name);
    }
  } catch (error) {
    writeFailureLog(error);
    console.error(String(error && error.stack ? error.stack : error));
    process.exit(1);
  }
}

main();