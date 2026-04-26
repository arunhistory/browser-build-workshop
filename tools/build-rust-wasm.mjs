import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT_DIR = process.cwd();
const GENERATED_DIR = path.join(ROOT_DIR, '.generated');
const WORK_DIR = path.join(GENERATED_DIR, 'work');
const DIST_DIR = path.join(GENERATED_DIR, 'dist');

const logLines = [];

function log(message) {
  const text = String(message);
  logLines.push(text);
  console.log(text);
}

function normalizeProjectName(raw) {
  const value = String(raw || 'index')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return value || 'index';
}

function normalizeFileBaseName(projectName) {
  const value = String(projectName || 'index')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return value || 'index';
}

function normalizeEdition(raw) {
  const value = String(raw || '2021').trim();
  if (['2015', '2018', '2021', '2024'].includes(value)) return value;
  return '2021';
}

function normalizeVersion(raw) {
  const value = String(raw || '0.1.0').trim();
  if (/^\d+\.\d+\.\d+$/.test(value)) return value;
  return '0.1.0';
}

function normalizeBuildMode(raw) {
  return raw === 'debug' ? 'debug' : 'release';
}

function normalizeOutputMode(raw) {
  if (raw === 'wasm-only') return 'wasm-only';
  if (raw === 'js-only') return 'js-only';
  return 'wasm-js';
}

function normalizeEntryPoint(raw) {
  const value = String(raw || 'src/lib.rs').trim().replace(/\\/g, '/').replace(/^\/+/, '');

  if (!value) return 'src/lib.rs';
  if (value === 'lib.rs') return 'src/lib.rs';
  if (value === 'main.rs') return 'src/main.rs';
  if (value.startsWith('src/')) return value;

  return `src/${value}`;
}

function normalizeCrateType(raw, entryPoint) {
  if (entryPoint.endsWith('main.rs')) return 'bin';

  const value = String(raw || 'cdylib').trim().toLowerCase();

  if (['cdylib', 'rlib', 'staticlib', 'dylib'].includes(value)) {
    return value;
  }

  return 'cdylib';
}

function parseBuildRequest() {
  const raw = process.env.BUILD_REQUEST_JSON;

  if (!raw || !raw.trim()) {
    throw new Error('BUILD_REQUEST_JSON が空です。GitHub Actions の buildRequestJson にJSONを入れてください。');
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`BUILD_REQUEST_JSON のJSON解析に失敗しました: ${error.message}`);
  }

  const build = parsed && parsed.build ? parsed.build : parsed;

  if (!build || typeof build !== 'object') {
    throw new Error('build オブジェクトが見つかりません。');
  }

  const projectName = normalizeProjectName(build.projectName || 'index');
  const entryPoint = normalizeEntryPoint(build.entryPoint || 'src/lib.rs');
  const crateType = normalizeCrateType(build.crateType || 'cdylib', entryPoint);

  return {
    buildId: String(build.buildId || `rust-build-${Date.now()}`),
    projectName,
    fileBaseName: normalizeFileBaseName(projectName),
    version: normalizeVersion(build.version || '0.1.0'),
    edition: normalizeEdition(build.edition || '2021'),
    entryPoint,
    outputMode: normalizeOutputMode(build.outputMode || 'wasm-js'),
    buildMode: normalizeBuildMode(build.buildMode || 'release'),
    crateType,
    dependenciesText: String(build.dependenciesText || ''),
    featuresText: String(build.featuresText || ''),
    mainRustCode: String(build.mainRustCode || ''),
    subFiles: Array.isArray(build.subFiles) ? build.subFiles : [],
    flags: build.flags && typeof build.flags === 'object' ? build.flags : {}
  };
}

async function resetGeneratedDirs() {
  await fs.rm(GENERATED_DIR, { recursive: true, force: true });
  await fs.mkdir(WORK_DIR, { recursive: true });
  await fs.mkdir(DIST_DIR, { recursive: true });
}

function safeRelativePath(rawPath) {
  const value = String(rawPath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');

  if (!value) {
    throw new Error('空のファイルパスは使えません。');
  }

  if (value.includes('..')) {
    throw new Error(`危険なファイルパスです: ${value}`);
  }

  if (!value.endsWith('.rs')) {
    throw new Error(`Rustファイルではありません: ${value}`);
  }

  if (value.startsWith('src/')) return value;

  return `src/${value}`;
}

function createCargoToml(input) {
  const lines = [];

  lines.push('[package]');
  lines.push(`name = "${input.projectName}"`);
  lines.push(`version = "${input.version}"`);
  lines.push(`edition = "${input.edition}"`);
  lines.push('');

  if (input.crateType !== 'bin') {
    lines.push('[lib]');
    lines.push(`crate-type = ["${input.crateType}"]`);
    lines.push('');
  }

  if (input.featuresText.trim()) {
    lines.push('[features]');
    lines.push(input.featuresText.trim());
    lines.push('');
  }

  lines.push('[dependencies]');

  const dependencies = input.dependenciesText.trim();

  if (dependencies) {
    lines.push(dependencies);
  } else {
    lines.push('wasm-bindgen = "0.2"');
  }

  lines.push('');

  return lines.join('\n');
}

async function writeProjectFiles(input) {
  const cargoToml = createCargoToml(input);
  const cargoPath = path.join(WORK_DIR, 'Cargo.toml');

  await fs.writeFile(cargoPath, cargoToml, 'utf8');

  const entryRelativePath = safeRelativePath(input.entryPoint);
  const entryAbsolutePath = path.join(WORK_DIR, entryRelativePath);

  await fs.mkdir(path.dirname(entryAbsolutePath), { recursive: true });

  if (!input.mainRustCode.trim()) {
    throw new Error('mainRustCode が空です。');
  }

  await fs.writeFile(entryAbsolutePath, input.mainRustCode, 'utf8');

  for (const file of input.subFiles) {
    const relativePath = safeRelativePath(file.name);
    const absolutePath = path.join(WORK_DIR, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, String(file.content || ''), 'utf8');
  }

  log('Cargo.toml と Rust ソースを生成しました。');
  log(`entryPoint: ${entryRelativePath}`);
}

async function runCommand(command, args, options = {}) {
  log('');
  log(`$ ${command} ${args.join(' ')}`);

  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd || WORK_DIR,
      maxBuffer: 1024 * 1024 * 20
    });

    if (result.stdout) log(result.stdout.trim());
    if (result.stderr) log(result.stderr.trim());

    return result;
  } catch (error) {
    if (error.stdout) log(error.stdout.trim());
    if (error.stderr) log(error.stderr.trim());
    throw error;
  }
}

async function buildCargo(input) {
  const args = ['build', '--target', 'wasm32-unknown-unknown'];

  if (input.buildMode === 'release') {
    args.push('--release');
  }

  await runCommand('cargo', args, { cwd: WORK_DIR });

  log('cargo build が完了しました。');
}

async function findBuiltWasm(input) {
  const profileDir = input.buildMode === 'release' ? 'release' : 'debug';
  const targetDir = path.join(WORK_DIR, 'target', 'wasm32-unknown-unknown', profileDir);
  const files = await fs.readdir(targetDir);

  const wasmFiles = files.filter((name) => name.endsWith('.wasm'));

  if (!wasmFiles.length) {
    throw new Error(`生成された .wasm が見つかりません: ${targetDir}`);
  }

  const preferredName = `${input.fileBaseName}.wasm`;
  const picked = wasmFiles.includes(preferredName) ? preferredName : wasmFiles[0];

  return path.join(targetDir, picked);
}

async function runWasmBindgen(input, builtWasmPath) {
  const bindgenOutDir = path.join(GENERATED_DIR, 'bindgen');

  await fs.mkdir(bindgenOutDir, { recursive: true });

  await runCommand(
    'wasm-bindgen',
    [
      builtWasmPath,
      '--target',
      'web',
      '--out-dir',
      bindgenOutDir,
      '--out-name',
      input.fileBaseName
    ],
    { cwd: WORK_DIR }
  );

  log('wasm-bindgen が完了しました。');

  return {
    bindgenOutDir,
    bindgenWasmPath: path.join(bindgenOutDir, `${input.fileBaseName}_bg.wasm`),
    bindgenJsPath: path.join(bindgenOutDir, `${input.fileBaseName}.js`)
  };
}

function createNormalLoaderJs(input) {
  const wasmFileName = `${input.fileBaseName}.wasm`;
  const bindgenJsFileName = `${input.fileBaseName}.bindgen.js`;

  return [
    `import init, * as wasmModule from './${bindgenJsFileName}';`,
    '',
    'let wasmReadyPromise = null;',
    '',
    'export async function initWasm() {',
    '  if (!wasmReadyPromise) {',
    `    wasmReadyPromise = init(new URL('./${wasmFileName}', import.meta.url));`,
    '  }',
    '',
    '  await wasmReadyPromise;',
    '  return wasmModule;',
    '}',
    '',
    'export async function getWasmModule() {',
    '  return initWasm();',
    '}',
    '',
    'export default initWasm;',
    ''
  ].join('\n');
}

function createEmbeddedLoaderJs(input, base64Text, bindgenJsText) {
  return [
    '// embedded-loader.js',
    '// .wasm を base64 として内蔵し、wasm-bindgen JS と接続して読み込むための単体ローダーです。',
    '',
    `const WASM_BASE64 = ${JSON.stringify(base64Text)};`,
    '',
    'function base64ToUint8Array(base64) {',
    '  const binary = atob(base64);',
    '  const bytes = new Uint8Array(binary.length);',
    '',
    '  for (let i = 0; i < binary.length; i += 1) {',
    '    bytes[i] = binary.charCodeAt(i);',
    '  }',
    '',
    '  return bytes;',
    '}',
    '',
    'const wasmBytes = base64ToUint8Array(WASM_BASE64);',
    '',
    '// ===== wasm-bindgen generated JS start =====',
    bindgenJsText,
    '// ===== wasm-bindgen generated JS end =====',
    '',
    'let embeddedWasmReadyPromise = null;',
    '',
    'export async function initEmbeddedWasm() {',
    '  if (!embeddedWasmReadyPromise) {',
    '    embeddedWasmReadyPromise = init(wasmBytes);',
    '  }',
    '',
    '  await embeddedWasmReadyPromise;',
    '',
    '  return {',
    '    hashLoginValues: typeof hashLoginValues === "function" ? hashLoginValues : undefined',
    '  };',
    '}',
    '',
    'export async function getEmbeddedWasmModule() {',
    '  return initEmbeddedWasm();',
    '}',
    '',
    'export { hashLoginValues };',
    '',
    'export default initEmbeddedWasm;',
    ''
  ].join('\n');
}

async function writeDistFiles(input, bindgenResult) {
  const wasmBytes = await fs.readFile(bindgenResult.bindgenWasmPath);
  const bindgenJsText = await fs.readFile(bindgenResult.bindgenJsPath, 'utf8');

  const wasmFileName = `${input.fileBaseName}.wasm`;
  const base64FileName = `${input.fileBaseName}.wasm.base64.txt`;
  const bindgenJsFileName = `${input.fileBaseName}.bindgen.js`;
  const loaderFileName = `${input.fileBaseName}.loader.js`;
  const embeddedLoaderFileName = `${input.fileBaseName}.embedded-loader.js`;

  const base64Text = wasmBytes.toString('base64');
  const normalLoaderJs = createNormalLoaderJs(input);
  const embeddedLoaderJs = createEmbeddedLoaderJs(input, base64Text, bindgenJsText);

  await fs.writeFile(path.join(DIST_DIR, wasmFileName), wasmBytes);
  await fs.writeFile(path.join(DIST_DIR, base64FileName), base64Text, 'utf8');
  await fs.writeFile(path.join(DIST_DIR, bindgenJsFileName), bindgenJsText, 'utf8');
  await fs.writeFile(path.join(DIST_DIR, loaderFileName), normalLoaderJs, 'utf8');
  await fs.writeFile(path.join(DIST_DIR, embeddedLoaderFileName), embeddedLoaderJs, 'utf8');

  log('');
  log('生成ファイル:');
  log(`- ${wasmFileName}`);
  log(`- ${base64FileName}`);
  log(`- ${bindgenJsFileName}`);
  log(`- ${loaderFileName}`);
  log(`- ${embeddedLoaderFileName}`);

  return {
    wasmFileName,
    base64FileName,
    bindgenJsFileName,
    loaderFileName,
    embeddedLoaderFileName,
    embeddedLoaderJs
  };
}

async function writeBuildLog() {
  const text = logLines.join('\n') + '\n';
  await fs.writeFile(path.join(DIST_DIR, 'build-log.txt'), text, 'utf8');
}

async function main() {
  try {
    const input = parseBuildRequest();

    log('Rust Wasm Build を開始します。');
    log(`buildId: ${input.buildId}`);
    log(`projectName: ${input.projectName}`);
    log(`fileBaseName: ${input.fileBaseName}`);
    log(`entryPoint: ${input.entryPoint}`);
    log(`buildMode: ${input.buildMode}`);
    log(`crateType: ${input.crateType}`);
    log(`outputMode: ${input.outputMode}`);

    await resetGeneratedDirs();
    await writeProjectFiles(input);
    await buildCargo(input);

    const builtWasmPath = await findBuiltWasm(input);
    log(`built wasm: ${builtWasmPath}`);

    const bindgenResult = await runWasmBindgen(input, builtWasmPath);
    await writeDistFiles(input, bindgenResult);

    log('');
    log('Rust Wasm Build が完了しました。');
    await writeBuildLog();
  } catch (error) {
    log('');
    log('Rust Wasm Build に失敗しました。');
    log(error && error.stack ? error.stack : String(error));

    await fs.mkdir(DIST_DIR, { recursive: true });
    await writeBuildLog();

    process.exitCode = 1;
  }
}

await main();