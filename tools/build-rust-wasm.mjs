import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT_DIR = process.cwd();
const REQUEST_PATH = path.join(ROOT_DIR, "build-requests", "current", "build-request.json");
const GENERATED_DIR = path.join(ROOT_DIR, ".generated");
const PROJECT_DIR = path.join(GENERATED_DIR, "rust-project");
const DIST_DIR = path.join(GENERATED_DIR, "dist");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeFileSafe(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function copyFileSafe(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function normalizeProjectName(name) {
  return String(name || "sample-rust-project")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "sample-rust-project";
}

function crateFileStem(projectName) {
  return normalizeProjectName(projectName).replace(/-/g, "_");
}

function assertRequestExists() {
  if (!fs.existsSync(REQUEST_PATH)) {
    throw new Error(
      [
        "build-request.json が見つかりません。",
        "配置先:",
        REQUEST_PATH,
        "",
        "ブラウザ側で生成した build-request.json を",
        "build-requests/current/build-request.json に置いてください。"
      ].join("\n")
    );
  }
}

function loadRequest() {
  assertRequestExists();

  const request = readJson(REQUEST_PATH);

  if (!request || typeof request !== "object") {
    throw new Error("build-request.json の形式が不正です。");
  }

  if (!request.build || typeof request.build !== "object") {
    throw new Error("build-request.json に build がありません。");
  }

  if (!request.virtualFs || typeof request.virtualFs !== "object") {
    throw new Error("build-request.json に virtualFs がありません。");
  }

  if (!request.virtualFs.files || typeof request.virtualFs.files !== "object") {
    throw new Error("build-request.json に virtualFs.files がありません。");
  }

  return request;
}

function cleanGenerated() {
  fs.rmSync(GENERATED_DIR, { recursive: true, force: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

function validateVirtualPath(virtualPath) {
  if (typeof virtualPath !== "string") {
    throw new Error("virtualFs のパスが文字列ではありません。");
  }

  if (!virtualPath.startsWith("/")) {
    throw new Error("virtualFs のパスは / から始めてください: " + virtualPath);
  }

  if (virtualPath.includes("..")) {
    throw new Error("virtualFs のパスに .. は使えません: " + virtualPath);
  }

  if (virtualPath.includes("\0")) {
    throw new Error("virtualFs のパスに NULL 文字は使えません。");
  }
}

function writeVirtualFs(request) {
  const files = request.virtualFs.files;

  Object.keys(files).forEach((virtualPath) => {
    validateVirtualPath(virtualPath);

    const relativePath = virtualPath.replace(/^\/+/, "");
    const realPath = path.join(PROJECT_DIR, relativePath);

    if (!realPath.startsWith(PROJECT_DIR)) {
      throw new Error("virtualFs のパスがプロジェクト外を指しています: " + virtualPath);
    }

    writeFileSafe(realPath, String(files[virtualPath] ?? ""));
  });
}

function ensureCargoToml() {
  const cargoTomlPath = path.join(PROJECT_DIR, "Cargo.toml");

  if (!fs.existsSync(cargoTomlPath)) {
    throw new Error("Cargo.toml が生成されていません。");
  }
}

function ensureSourceExists(request) {
  const entryPath = String(request.virtualFs.entryPath || "/src/lib.rs");
  validateVirtualPath(entryPath);

  const relativePath = entryPath.replace(/^\/+/, "");
  const realPath = path.join(PROJECT_DIR, relativePath);

  if (!fs.existsSync(realPath)) {
    throw new Error("エントリーファイルが存在しません: " + entryPath);
  }
}

function prepare() {
  const request = loadRequest();

  cleanGenerated();
  writeVirtualFs(request);
  ensureCargoToml();
  ensureSourceExists(request);

  writeFileSafe(
    path.join(DIST_DIR, "build-request.json"),
    JSON.stringify(request, null, 2)
  );

  writeFileSafe(
    path.join(DIST_DIR, "prepare-log.txt"),
    [
      "prepare completed",
      "build id: " + request.build.buildId,
      "project: " + request.build.projectName,
      "entry: " + request.build.entryPoint,
      "crate type: " + request.build.crateType,
      "build mode: " + request.build.buildMode,
      "output mode: " + request.build.outputMode
    ].join("\n")
  );

  console.log("Prepared virtual Rust project.");
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options
  });

  if (result.status !== 0) {
    throw new Error(command + " failed with exit code " + result.status);
  }
}

function findBuiltWasm(request) {
  const projectName = normalizeProjectName(request.build.projectName);
  const stem = crateFileStem(projectName);
  const buildMode = String(request.build.buildMode || "release");
  const profileDir = buildMode === "debug" ? "debug" : "release";

  const directPath = path.join(
    PROJECT_DIR,
    "target",
    "wasm32-unknown-unknown",
    profileDir,
    stem + ".wasm"
  );

  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const searchDir = path.join(
    PROJECT_DIR,
    "target",
    "wasm32-unknown-unknown",
    profileDir
  );

  if (!fs.existsSync(searchDir)) {
    throw new Error("wasm 出力ディレクトリが見つかりません: " + searchDir);
  }

  const candidates = fs
    .readdirSync(searchDir)
    .filter((name) => name.endsWith(".wasm"))
    .map((name) => path.join(searchDir, name));

  if (!candidates.length) {
    throw new Error("cargo build 後の .wasm が見つかりません。");
  }

  return candidates[0];
}

function bindgen() {
  const request = loadRequest();
  const outputMode = String(request.build.outputMode || "wasm-js");

  const wasmPath = findBuiltWasm(request);
  const rawWasmOut = path.join(DIST_DIR, "raw", path.basename(wasmPath));

  copyFileSafe(wasmPath, rawWasmOut);

  if (outputMode === "wasm-only") {
    copyFileSafe(
      wasmPath,
      path.join(DIST_DIR, normalizeProjectName(request.build.projectName) + ".wasm")
    );

    writeFileSafe(
      path.join(DIST_DIR, "bindgen-log.txt"),
      [
        "wasm-only mode",
        "wasm copied: " + path.basename(wasmPath)
      ].join("\n")
    );

    console.log("wasm-only output completed.");
    return;
  }

  runCommand("wasm-bindgen", [
    wasmPath,
    "--target",
    "web",
    "--out-dir",
    path.join(DIST_DIR, "pkg"),
    "--out-name",
    crateFileStem(request.build.projectName)
  ]);

  writeFileSafe(
    path.join(DIST_DIR, "bindgen-log.txt"),
    [
      "wasm-bindgen completed",
      "target: web",
      "source wasm: " + wasmPath,
      "out dir: " + path.join(DIST_DIR, "pkg")
    ].join("\n")
  );

  console.log("wasm-bindgen completed.");
}

function collectCargoFiles() {
  const cargoToml = path.join(PROJECT_DIR, "Cargo.toml");
  const cargoLock = path.join(PROJECT_DIR, "Cargo.lock");

  if (fs.existsSync(cargoToml)) {
    copyFileSafe(cargoToml, path.join(DIST_DIR, "Cargo.toml"));
  }

  if (fs.existsSync(cargoLock)) {
    copyFileSafe(cargoLock, path.join(DIST_DIR, "Cargo.lock"));
  }
}

function collectSourceFiles() {
  const srcDir = path.join(PROJECT_DIR, "src");
  const outDir = path.join(DIST_DIR, "src");

  if (!fs.existsSync(srcDir)) return;

  function walk(currentDir) {
    fs.readdirSync(currentDir, { withFileTypes: true }).forEach((entry) => {
      const from = path.join(currentDir, entry.name);
      const relative = path.relative(srcDir, from);
      const to = path.join(outDir, relative);

      if (entry.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        walk(from);
        return;
      }

      if (entry.isFile()) {
        copyFileSafe(from, to);
      }
    });
  }

  walk(srcDir);
}

function makeFinalReadme(request) {
  const projectName = normalizeProjectName(request.build.projectName);
  const stem = crateFileStem(projectName);

  const lines = [];

  lines.push("# Rust Wasm Build Output");
  lines.push("");
  lines.push("build id: `" + request.build.buildId + "`");
  lines.push("project: `" + projectName + "`");
  lines.push("mode: `" + request.build.buildMode + "`");
  lines.push("output: `" + request.build.outputMode + "`");
  lines.push("");
  lines.push("## Browser usage");
  lines.push("");
  lines.push("```js");
  lines.push('import init, * as wasmModule from "./pkg/' + stem + '.js";');
  lines.push("");
  lines.push("await init();");
  lines.push("console.log(wasmModule);");
  lines.push("```");
  lines.push("");
  lines.push("## Files");
  lines.push("");
  lines.push("- `pkg/` : wasm-bindgen output");
  lines.push("- `raw/` : cargo build raw wasm");
  lines.push("- `Cargo.toml`");
  lines.push("- `Cargo.lock`");
  lines.push("- `src/`");
  lines.push("- `build-request.json`");

  return lines.join("\n");
}

function collect() {
  const request = loadRequest();

  collectCargoFiles();
  collectSourceFiles();

  writeFileSafe(
    path.join(DIST_DIR, "README.md"),
    makeFinalReadme(request)
  );

  writeFileSafe(
    path.join(DIST_DIR, "final-log.txt"),
    [
      "collect completed",
      "build id: " + request.build.buildId,
      "project: " + request.build.projectName,
      "artifact directory: .generated/dist"
    ].join("\n")
  );

  console.log("Artifacts collected.");
}

const command = process.argv[2];

try {
  if (command === "prepare") {
    prepare();
  } else if (command === "bindgen") {
    bindgen();
  } else if (command === "collect") {
    collect();
  } else {
    throw new Error("unknown command: " + command);
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}