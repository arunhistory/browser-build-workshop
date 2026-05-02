import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT_DIR = process.cwd();

const GENERATED_DIR = path.join(ROOT_DIR, ".generated");
const DIST_DIR = path.join(GENERATED_DIR, "dist");
const LOOSE_DIR = path.join(GENERATED_DIR, "loose-artifacts");
const RUST_OUTPUT_DIR = path.join(ROOT_DIR, "rust-output");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(content || ""), "utf8");
}

function copyFile(source, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(source, dest);
}

function listFiles(dirPath) {
  if (!fileExists(dirPath)) return [];
  return fs.readdirSync(dirPath).filter((name) => {
    return fs.statSync(path.join(dirPath, name)).isFile();
  });
}

function findFirstFile(dirPath, predicate) {
  const files = listFiles(dirPath);
  for (const name of files) {
    if (predicate(name)) {
      return path.join(dirPath, name);
    }
  }
  return null;
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `コマンドに失敗しました: ${command} ${args.join(" ")}`,
        `cwd: ${cwd}`,
        `status: ${result.status}`,
        "",
        "----- stdout -----",
        result.stdout || "(なし)",
        "",
        "----- stderr -----",
        result.stderr || "(なし)"
      ].join("\n")
    );
  }

  return result;
}

function readPageManifest() {
  const manifestPath = path.join(DIST_DIR, "page-manifest.json");

  if (!fileExists(manifestPath)) {
    return null;
  }

  try {
    return JSON.parse(readText(manifestPath));
  } catch {
    return null;
  }
}

function inferProjectName(manifest) {
  if (manifest && typeof manifest.projectName === "string" && manifest.projectName.trim()) {
    return manifest.projectName.trim();
  }

  const embeddedFromDist = findFirstFile(DIST_DIR, (name) => name.endsWith(".embedded-loader.js"));
  if (embeddedFromDist) {
    return path.basename(embeddedFromDist).replace(/\.embedded-loader\.js$/, "");
  }

  const embeddedFromLoose = findFirstFile(LOOSE_DIR, (name) => name.endsWith(".embedded-loader.js"));
  if (embeddedFromLoose) {
    return path.basename(embeddedFromLoose).replace(/\.embedded-loader\.js$/, "");
  }

  return "sample-rust-project";
}

function findEmbeddedLoader(projectName) {
  const expectedName = `${projectName}.embedded-loader.js`;

  const candidates = [
    path.join(DIST_DIR, expectedName),
    path.join(LOOSE_DIR, expectedName)
  ];

  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate;
  }

  return (
    findFirstFile(DIST_DIR, (name) => name.endsWith(".embedded-loader.js")) ||
    findFirstFile(LOOSE_DIR, (name) => name.endsWith(".embedded-loader.js"))
  );
}

function findZip(projectName) {
  const expectedName = `${projectName}-wasm-build.zip`;

  const candidates = [
    path.join(DIST_DIR, expectedName),
    path.join(LOOSE_DIR, expectedName)
  ];

  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate;
  }

  return (
    findFirstFile(DIST_DIR, (name) => name.endsWith(".zip")) ||
    findFirstFile(LOOSE_DIR, (name) => name.endsWith(".zip"))
  );
}

function copyBasicPageFiles() {
  const names = ["build-log.txt", "output-summary.txt", "page-manifest.json"];

  for (const name of names) {
    const source = path.join(DIST_DIR, name);
    const dest = path.join(RUST_OUTPUT_DIR, name);

    if (fileExists(source)) {
      copyFile(source, dest);
    }
  }
}

function createZipFromLoose(projectName) {
  if (!fileExists(LOOSE_DIR)) {
    throw new Error(".generated/loose-artifacts が見つかりません。ZIPを作れません。");
  }

  const zipName = `${projectName}-wasm-build.zip`;
  const zipPath = path.join(RUST_OUTPUT_DIR, zipName);

  const looseFiles = listFiles(LOOSE_DIR);

  if (!looseFiles.length) {
    throw new Error(".generated/loose-artifacts が空です。ZIPを作れません。");
  }

  if (fileExists(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }

  runCommand("zip", ["-r", zipPath, "."], LOOSE_DIR);

  return zipPath;
}

function createOutputManifest(projectName, embeddedLoaderName, zipName) {
  const manifest = {
    ok: true,
    projectName,
    generatedAt: new Date().toISOString(),
    displayFiles: [
      "build-log.txt",
      "output-summary.txt",
      embeddedLoaderName
    ],
    embeddedLoaderFile: embeddedLoaderName,
    zipFile: zipName,
    zipUrl: `./${zipName}`
  };

  writeText(
    path.join(RUST_OUTPUT_DIR, "page-manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
}

function main() {
  ensureDir(RUST_OUTPUT_DIR);

  const manifest = readPageManifest();
  const projectName = inferProjectName(manifest);

  copyBasicPageFiles();

  const embeddedSource = findEmbeddedLoader(projectName);

  if (!embeddedSource) {
    throw new Error(
      `${projectName}.embedded-loader.js が見つかりません。` +
        " tools/build-rust-wasm.mjs 側で embedded-loader.js が生成されているか確認してください。"
    );
  }

  const embeddedLoaderName = `${projectName}.embedded-loader.js`;
  const embeddedDest = path.join(RUST_OUTPUT_DIR, embeddedLoaderName);
  copyFile(embeddedSource, embeddedDest);

  let zipSource = findZip(projectName);
  let zipDest;

  if (zipSource) {
    const zipName = `${projectName}-wasm-build.zip`;
    zipDest = path.join(RUST_OUTPUT_DIR, zipName);
    copyFile(zipSource, zipDest);
  } else {
    zipDest = createZipFromLoose(projectName);
  }

  const zipName = path.basename(zipDest);

  createOutputManifest(projectName, embeddedLoaderName, zipName);

  console.log("rust-output publish succeeded.");
  console.log("projectName:", projectName);
  console.log("embedded-loader:", embeddedLoaderName);
  console.log("zip:", zipName);
  console.log("output dir:", RUST_OUTPUT_DIR);
}

main();