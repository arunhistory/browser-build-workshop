// tools/build-rust-wasm.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const BUILD_REQUEST_PATH = path.join(ROOT_DIR, 'build-request.json');
const WORK_DIR = path.join(ROOT_DIR, '.rust-wasm-work');
const PROJECT_DIR = path.join(WORK_DIR, 'project');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const LOG_LINES = [];

function log(message) {
  const text = String(message);
  LOG_LINES.push(text);
  console.log(text);
}

function fail(message) {
  log('');
  log('[ERROR] ' + message);
  writeBuildLog();
  process.exit(1);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`${filePath} が見つかりません。`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`JSONの読み込みに失敗しました: ${error.message}`);
  }
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function writeTextFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeBuildLog() {
  ensureDir(DIST_DIR);
  fs.writeFileSync(
    path.join(DIST_DIR, 'build-log.txt'),
    LOG_LINES.join('\n'),
    'utf8'
  );
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

function normalizeVersion(raw) {
  const value = String(raw || '0.1.0').trim();
  return /^\d+\.\d+\.\d+$/.test(value) ? value : '0.1.0';
}

function normalizeEdition(raw) {
  const value = String(raw || '2021').trim();
  if (['2015', '2018', '2021', '2024'].includes(value)) return value;
  return '2021';
}

function normalizeEntryPoint(raw) {
  const value = String(raw || 'src/lib.rs')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');

  if (!value) return 'src/lib.rs';
  if (value.includes('..')) fail('entryPoint に .. は使えません。');
  if (!value.endsWith('.rs')) fail('entryPoint は .rs で終わる必要があります。');

  if (value.startsWith('src/')) return value;
  return 'src/' + value;
}

function normalizeOutputMode(raw) {
  if (raw === 'wasm-only') return 'wasm-only';
  if (raw === 'js-only') return 'js-only';
  return 'wasm-js';
}

function normalizeBuildMode(raw) {
  return raw === 'debug' ? 'debug' : 'release';
}

function normalizeCrateType(raw, entryPoint) {
  if (entryPoint.endsWith('main.rs')) return 'bin';

  const value = String(raw || 'cdylib').trim().toLowerCase();
  if (['cdylib', 'rlib', 'staticlib', 'dylib'].includes(value)) return value;

  return 'cdylib';
}

function normalizeDependenciesText(raw) {
  return String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function normalizeRustCode(raw) {
  return String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function normalizeSubFilePath(raw) {
  const value = String(raw || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');

  if (!value) return '';
  if (value.includes('..')) fail('subFiles に .. は使えません。');
  if (!value.endsWith('.rs')) fail('subFiles は .rs で終わる必要があります。');

  if (value.startsWith('src/')) return value;
  return 'src/' + value;
}

function parseBuildRequest(raw) {
  const build = raw && raw.build ? raw.build : raw;

  if (!build || typeof build !== 'object') {
    fail('build オブジェクトが見つかりません。');
  }

  const entryPoint = normalizeEntryPoint(build.entryPoint);

  const result = {
    buildId: String(build.buildId || `rust-build-${Date.now()}`),
    projectName: normalizeProjectName(build.projectName),
    version: normalizeVersion(build.version),
    edition: normalizeEdition(build.edition),
    entryPoint,
    outputMode: normalizeOutputMode(build.outputMode),
    buildMode: normalizeBuildMode(build.buildMode),
    crateType: normalizeCrateType(build.crateType, entryPoint),
    dependenciesText: normalizeDependenciesText(build.dependenciesText),
    featuresText: String(build.featuresText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim(),
    mainRustCode: normalizeRustCode(build.mainRustCode),
    subFiles: Array.isArray(build.subFiles) ? build.subFiles : [],
    flags: build.flags || {}
  };

  if (!result.mainRustCode.trim()) {
    fail('mainRustCode が空です。');
  }

  return result;
}

function makeCargoToml(config) {
  const libSection = config.entryPoint.endsWith('lib.rs')
    ? [
        '',
        '[lib]',
        `crate-type = ["${config.crateType}"]`
      ].join('\n')
    : '';

  const dependencies = config.dependenciesText || 'wasm-bindgen = "0.2"';

  return [
    '[package]',
    `name = "${config.projectName}"`,
    `version = "${config.version}"`,
    `edition = "${config.edition}"`,
    libSection,
    '',
    '[dependencies]',
    dependencies,
    ''
  ].join('\n');
}

function createProjectFiles(config) {
  removeDir(WORK_DIR);
  removeDir(DIST_DIR);
  ensureDir(PROJECT_DIR);
  ensureDir(DIST_DIR);

  writeTextFile(path.join(PROJECT_DIR, 'Cargo.toml'), makeCargoToml(config));
  writeTextFile(path.join(PROJECT_DIR, config.entryPoint), config.mainRustCode);

  for (const file of config.subFiles) {
    const filePath = normalizeSubFilePath(file.name);
    const content = normalizeRustCode(file.content || '');
    writeTextFile(path.join(PROJECT_DIR, filePath), content);
  }

  log('プロジェクトファイルを生成しました。');
  log(`projectName: ${config.projectName}`);
  log(`entryPoint: ${config.entryPoint}`);
  log(`buildMode: ${config.buildMode}`);
  log(`outputMode: ${config.outputMode}`);
}

function runCommand(command, args, options = {}) {
  log('');
  log(`$ ${command} ${args.join(' ')}`);

  try {
    const output = execFileSync(command, args, {
      cwd: options.cwd || PROJECT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (output.trim()) {
      log(output.trim());
    }

    return output;
  } catch (error) {
    if (error.stdout) log(String(error.stdout));
    if (error.stderr) log(String(error.stderr));
    fail(`${command} の実行に失敗しました。`);
  }
}

function commandExists(command, args = ['--version']) {
  try {
    execFileSync(command, args, {
      cwd: ROOT_DIR,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

function ensureTooling() {
  if (!commandExists('cargo')) {
    fail('cargo が見つかりません。GitHub Actions に Rust toolchain を入れてください。');
  }

  if (!commandExists('wasm-bindgen', ['--version'])) {
    fail('wasm-bindgen CLI が見つかりません。GitHub Actions で cargo install wasm-bindgen-cli を実行してください。');
  }

  log('必要ツール確認OK: cargo / wasm-bindgen');
}

function buildWasm(config) {
  runCommand('rustup', ['target', 'add', 'wasm32-unknown-unknown'], {
    cwd: PROJECT_DIR
  });

  const cargoArgs = ['build', '--target', 'wasm32-unknown-unknown'];

  if (config.buildMode === 'release') {
    cargoArgs.push('--release');
  }

  runCommand('cargo', cargoArgs, { cwd: PROJECT_DIR });

  const profileDir = config.buildMode === 'release' ? 'release' : 'debug';
  const rawWasmPath = path.join(
    PROJECT_DIR,
    'target',
    'wasm32-unknown-unknown',
    profileDir,
    `${config.projectName.replace(/-/g, '_')}.wasm`
  );

  if (!fs.existsSync(rawWasmPath)) {
    fail(`生成された wasm が見つかりません: ${rawWasmPath}`);
  }

  const bindgenOutDir = path.join(PROJECT_DIR, 'pkg');
  removeDir(bindgenOutDir);
  ensureDir(bindgenOutDir);

  runCommand(
    'wasm-bindgen',
    [
      rawWasmPath,
      '--target',
      'web',
      '--out-dir',
      bindgenOutDir,
      '--out-name',
      config.projectName
    ],
    { cwd: PROJECT_DIR }
  );

  log('wasm-bindgen 出力完了。');

  return bindgenOutDir;
}

function findFirstFile(dirPath, predicate) {
  if (!fs.existsSync(dirPath)) return null;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const found = findFirstFile(fullPath, predicate);
      if (found) return found;
      continue;
    }

    if (predicate(fullPath, entry.name)) {
      return fullPath;
    }
  }

  return null;
}

function readBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

function makeLoaderJs(config, bindgenJsName, wasmName) {
  const exportName = toSafeJsIdentifier(config.projectName) + 'WasmModule';

  return [
    `// ${config.projectName}.loader.js`,
    '// GitHub Actions で生成された本物の .wasm を読み込むための loader です。',
    '',
    `import init, * as wasmExports from './${bindgenJsName}';`,
    '',
    'let cachedModule = null;',
    '',
    `export async function load${toPascalCase(config.projectName)}Wasm() {`,
    '  if (cachedModule) {',
    '    return cachedModule;',
    '  }',
    '',
    `  await init(new URL('./${wasmName}', import.meta.url));`,
    '',
    '  cachedModule = wasmExports;',
    '  return cachedModule;',
    '}',
    '',
    `export const ${exportName} = {`,
    `  load: load${toPascalCase(config.projectName)}Wasm`,
    '};',
    ''
  ].join('\n');
}

function makeExampleJs(config) {
  const pascal = toPascalCase(config.projectName);

  return [
    `// ${config.projectName}.example.js`,
    '// 読み込み確認用サンプルです。',
    '',
    `import { load${pascal}Wasm } from './${config.projectName}.loader.js';`,
    '',
    'async function main() {',
    `  const wasm = await load${pascal}Wasm();`,
    '',
    '  console.log("wasm loaded:", wasm);',
    '',
    '  if (typeof wasm.hashLoginValues === "function") {',
    '    const result = wasm.hashLoginValues("sample-id", "sample-password");',
    '    console.log("hashLoginValues result:", result);',
    '  }',
    '',
    '  if (typeof wasm.greet === "function") {',
    '    console.log(wasm.greet("orikuro"));',
    '  }',
    '}',
    '',
    'main().catch((error) => {',
    '  console.error(error);',
    '});',
    ''
  ].join('\n');
}

function toPascalCase(value) {
  return String(value || 'Index')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') || 'Index';
}

function toSafeJsIdentifier(value) {
  const normalized = String(value || 'index')
    .replace(/[^a-zA-Z0-9_$]/g, '_')
    .replace(/^([^a-zA-Z_$])/, '_$1');

  return normalized || 'index';
}

function copyOutputs(config, bindgenOutDir) {
  const wasmPath = findFirstFile(bindgenOutDir, (fullPath, name) => name.endsWith('.wasm'));
  const bindgenJsPath = findFirstFile(bindgenOutDir, (fullPath, name) => name.endsWith('.js') && !name.endsWith('.d.ts'));

  if (!wasmPath) fail('pkg 内に .wasm が見つかりません。');
  if (!bindgenJsPath) fail('pkg 内に wasm-bindgen の .js が見つかりません。');

  const wasmName = `${config.projectName}.wasm`;
  const bindgenJsName = `${config.projectName}.bindgen.js`;
  const loaderJsName = `${config.projectName}.loader.js`;
  const exampleJsName = `${config.projectName}.example.js`;

  const distWasmPath = path.join(DIST_DIR, wasmName);
  const distBindgenJsPath = path.join(DIST_DIR, bindgenJsName);
  const distLoaderJsPath = path.join(DIST_DIR, loaderJsName);
  const distExampleJsPath = path.join(DIST_DIR, exampleJsName);

  fs.copyFileSync(wasmPath, distWasmPath);
  fs.copyFileSync(bindgenJsPath, distBindgenJsPath);

  const loaderJs = makeLoaderJs(config, bindgenJsName, wasmName);
  const exampleJs = makeExampleJs(config);

  writeTextFile(distLoaderJsPath, loaderJs);
  writeTextFile(distExampleJsPath, exampleJs);

  const wasmBase64 = readBase64(distWasmPath);
  const bindgenJs = fs.readFileSync(distBindgenJsPath, 'utf8');

  const manifest = {
    buildId: config.buildId,
    projectName: config.projectName,
    version: config.version,
    edition: config.edition,
    entryPoint: config.entryPoint,
    outputMode: config.outputMode,
    buildMode: config.buildMode,
    crateType: config.crateType,
    createdAt: new Date().toISOString(),
    files: [
      {
        name: wasmName,
        type: 'application/wasm',
        note: '本番配置する .wasm 本体'
      },
      {
        name: bindgenJsName,
        type: 'text/javascript',
        note: 'wasm-bindgen が生成した JS'
      },
      {
        name: loaderJsName,
        type: 'text/javascript',
        note: '本番ページから読み込む loader'
      },
      {
        name: exampleJsName,
        type: 'text/javascript',
        note: '動作確認用サンプル'
      },
      {
        name: 'manifest.json',
        type: 'application/json',
        note: '成果物一覧'
      },
      {
        name: 'build-log.txt',
        type: 'text/plain',
        note: 'ビルドログ'
      },
      {
        name: 'separated-output.txt',
        type: 'text/plain',
        note: 'スマホ確認用の分別表示'
      }
    ]
  };

  writeTextFile(
    path.join(DIST_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  const separatedOutput = [
    `===== FILE: ${wasmName} =====`,
    '※ .wasm はバイナリファイルなので base64 で表示しています。',
    '※ 本番では base64 ではなく、Artifacts 内の .wasm ファイルをそのまま配置してください。',
    '',
    wasmBase64,
    '',
    `===== FILE: ${bindgenJsName} =====`,
    bindgenJs,
    '',
    `===== FILE: ${loaderJsName} =====`,
    loaderJs,
    '',
    `===== FILE: ${exampleJsName} =====`,
    exampleJs,
    '',
    '===== FILE: manifest.json =====',
    JSON.stringify(manifest, null, 2),
    '',
    '===== FILE: build-log.txt =====',
    LOG_LINES.join('\n'),
    ''
  ].join('\n');

  writeTextFile(path.join(DIST_DIR, 'separated-output.txt'), separatedOutput);

  log('');
  log('成果物を dist に出力しました。');
  log(`- ${wasmName}`);
  log(`- ${bindgenJsName}`);
  log(`- ${loaderJsName}`);
  log(`- ${exampleJsName}`);
  log('- manifest.json');
  log('- separated-output.txt');

  return {
    wasmName,
    bindgenJsName,
    loaderJsName,
    exampleJsName
  };
}

function main() {
  log('Rust Wasm Build start');

  const rawRequest = readJson(BUILD_REQUEST_PATH);
  const config = parseBuildRequest(rawRequest);

  ensureTooling();
  createProjectFiles(config);

  const bindgenOutDir = buildWasm(config);
  const outputs = copyOutputs(config, bindgenOutDir);

  log('');
  log('Rust Wasm Build success');
  log(`main wasm: ${outputs.wasmName}`);
  log(`loader: ${outputs.loaderJsName}`);

  writeBuildLog();
}

main();