import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';

const ROOT_DIR = process.cwd();
const GENERATED_DIR = path.join(ROOT_DIR, '.generated');
const WORK_DIR = path.join(GENERATED_DIR, 'work');
const DIST_DIR = path.join(GENERATED_DIR, 'dist');

const BUILD_REQUEST_JSON = process.env.BUILD_REQUEST_JSON || '';

const logLines = [];

function log(message) {
  const text = String(message);
  logLines.push(text);
  console.log(text);
}

function fail(message) {
  log('ERROR: ' + message);
  writeLogFile();
  process.exit(1);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(content), 'utf8');
}

function writeBuffer(filePath, buffer) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buffer);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readBuffer(filePath) {
  return fs.readFileSync(filePath);
}

function writeLogFile() {
  ensureDir(DIST_DIR);
  fs.writeFileSync(path.join(DIST_DIR, 'build-log.txt'), logLines.join('\n') + '\n', 'utf8');
}

function normalizeLineBreaks(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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

function normalizePackageName(raw) {
  return normalizeProjectName(raw || 'index');
}

function normalizeRustIdent(raw) {
  const value = String(raw || 'index')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!value) return 'index';
  if (/^[0-9]/.test(value)) return 'p_' + value;
  return value;
}

function normalizeVersion(raw) {
  const value = String(raw || '0.1.0').trim();
  if (/^\d+\.\d+\.\d+$/.test(value)) return value;
  return '0.1.0';
}

function normalizeEdition(raw) {
  const value = String(raw || '2021').trim();
  if (['2015', '2018', '2021', '2024'].includes(value)) return value;
  return '2021';
}

function normalizeEntryPoint(raw) {
  const value = String(raw || 'src/lib.rs').trim().replace(/\\/g, '/').replace(/^\/+/, '');

  if (value === 'lib.rs') return 'src/lib.rs';
  if (value === 'main.rs') return 'src/main.rs';
  if (value.startsWith('src/')) return value;
  return 'src/' + value;
}

function normalizeCrateType(raw, entryPoint) {
  if (entryPoint.endsWith('main.rs')) return 'bin';

  const value = String(raw || 'cdylib').trim().toLowerCase();
  if (['cdylib', 'rlib', 'staticlib', 'dylib'].includes(value)) return value;
  return 'cdylib';
}

function normalizeOutputMode(raw) {
  const value = String(raw || 'wasm-js').trim();
  if (value === 'wasm-only') return 'wasm-only';
  if (value === 'js-only') return 'js-only';
  return 'wasm-js';
}

function safeRelativePath(raw) {
  const value = String(raw || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!value) return '';
  if (value.includes('..')) return '';
  return value;
}

function parseBuildRequest() {
  if (!BUILD_REQUEST_JSON.trim()) {
    fail('BUILD_REQUEST_JSON が空です。GitHub Actions の buildRequestJson にJSONを入れてください。');
  }

  let parsed;

  try {
    parsed = JSON.parse(BUILD_REQUEST_JSON);
  } catch (error) {
    fail('BUILD_REQUEST_JSON のJSON解析に失敗しました: ' + error.message);
  }

  const build = parsed && parsed.build ? parsed.build : parsed;

  if (!build || typeof build !== 'object') {
    fail('build オブジェクトが見つかりません。');
  }

  const projectName = normalizeProjectName(build.projectName || 'index');
  const packageName = normalizePackageName(build.projectName || 'index');
  const rustOutName = normalizeRustIdent(projectName);
  const entryPoint = normalizeEntryPoint(build.entryPoint || 'src/lib.rs');
  const crateType = normalizeCrateType(build.crateType || 'cdylib', entryPoint);
  const outputMode = normalizeOutputMode(build.outputMode || 'wasm-js');

  return {
    buildId: String(build.buildId || 'rust-build-' + Date.now()),
    projectName,
    packageName,
    rustOutName,
    version: normalizeVersion(build.version || '0.1.0'),
    edition: normalizeEdition(build.edition || '2021'),
    entryPoint,
    outputMode,
    buildMode: String(build.buildMode || 'release') === 'debug' ? 'debug' : 'release',
    crateType,
    dependenciesText: normalizeLineBreaks(build.dependenciesText || 'wasm-bindgen = "0.2"'),
    featuresText: normalizeLineBreaks(build.featuresText || ''),
    mainRustCode: normalizeLineBreaks(build.mainRustCode || ''),
    subFiles: Array.isArray(build.subFiles) ? build.subFiles : [],
    flags: build.flags && typeof build.flags === 'object' ? build.flags : {}
  };
}

function makeCargoToml(config) {
  const lines = [];

  lines.push('[package]');
  lines.push('name = "' + config.packageName + '"');
  lines.push('version = "' + config.version + '"');
  lines.push('edition = "' + config.edition + '"');
  lines.push('');

  if (!config.entryPoint.endsWith('main.rs')) {
    lines.push('[lib]');
    lines.push('crate-type = ["' + config.crateType + '"]');
    lines.push('');
  }

  lines.push('[dependencies]');

  const deps = normalizeLineBreaks(config.dependenciesText).trim();
  if (deps) {
    lines.push(deps);
  } else {
    lines.push('wasm-bindgen = "0.2"');
  }

  const features = normalizeLineBreaks(config.featuresText).trim();
  if (features) {
    lines.push('');
    lines.push('[features]');
    lines.push(features);
  }

  lines.push('');
  return lines.join('\n');
}

function prepareProject(config) {
  removeDir(WORK_DIR);
  removeDir(DIST_DIR);

  ensureDir(WORK_DIR);
  ensureDir(DIST_DIR);

  log('作業ディレクトリを初期化しました。');
  log('WORK_DIR: ' + WORK_DIR);
  log('DIST_DIR: ' + DIST_DIR);

  writeText(path.join(WORK_DIR, 'Cargo.toml'), makeCargoToml(config));

  if (!config.mainRustCode.trim()) {
    fail('mainRustCode が空です。Rustコードを入力してください。');
  }

  writeText(path.join(WORK_DIR, config.entryPoint), config.mainRustCode);

  for (const file of config.subFiles) {
    const safePath = safeRelativePath(file && file.name ? file.name : '');
    if (!safePath) {
      fail('補助Rustファイルに不正なパスがあります。');
    }

    if (!safePath.endsWith('.rs')) {
      fail('補助Rustファイルは .rs で終わる必要があります: ' + safePath);
    }

    const finalPath = safePath.startsWith('src/') ? safePath : 'src/' + safePath;
    writeText(path.join(WORK_DIR, finalPath), normalizeLineBreaks(file.content || ''));
  }

  log('Cargo.toml と Rust ソースを生成しました。');
}

function runCommand(command, args, options = {}) {
  log('');
  log('$ ' + command + ' ' + args.join(' '));

  try {
    const output = execFileSync(command, args, {
      cwd: options.cwd || WORK_DIR,
      env: {
        ...process.env,
        ...(options.env || {})
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (output && output.trim()) {
      log(output.trim());
    }

    return output || '';
  } catch (error) {
    const stdout = error.stdout ? String(error.stdout) : '';
    const stderr = error.stderr ? String(error.stderr) : '';

    if (stdout.trim()) log(stdout.trim());
    if (stderr.trim()) log(stderr.trim());

    fail(command + ' の実行に失敗しました。');
  }
}

function buildRust(config) {
  runCommand('rustc', ['--version'], { cwd: ROOT_DIR });
  runCommand('cargo', ['--version'], { cwd: ROOT_DIR });
  runCommand('wasm-bindgen', ['--version'], { cwd: ROOT_DIR });

  const cargoArgs = ['build', '--target', 'wasm32-unknown-unknown'];

  if (config.buildMode === 'release') {
    cargoArgs.push('--release');
  }

  runCommand('cargo', cargoArgs, { cwd: WORK_DIR });

  const profileDir = config.buildMode === 'release' ? 'release' : 'debug';
  const wasmNameFromCargo = config.entryPoint.endsWith('main.rs')
    ? config.packageName.replace(/-/g, '_') + '.wasm'
    : config.packageName.replace(/-/g, '_') + '.wasm';

  const cargoWasmPath = path.join(
    WORK_DIR,
    'target',
    'wasm32-unknown-unknown',
    profileDir,
    wasmNameFromCargo
  );

  if (!fs.existsSync(cargoWasmPath)) {
    const targetDir = path.join(WORK_DIR, 'target', 'wasm32-unknown-unknown', profileDir);
    const candidates = fs.existsSync(targetDir)
      ? fs.readdirSync(targetDir).filter((name) => name.endsWith('.wasm'))
      : [];

    if (!candidates.length) {
      fail('cargo build 後の .wasm が見つかりません。');
    }

    return path.join(targetDir, candidates[0]);
  }

  return cargoWasmPath;
}

function runWasmBindgen(config, cargoWasmPath) {
  const bindgenDir = path.join(WORK_DIR, 'bindgen');
  removeDir(bindgenDir);
  ensureDir(bindgenDir);

  runCommand('wasm-bindgen', [
    cargoWasmPath,
    '--out-dir',
    bindgenDir,
    '--target',
    'web',
    '--out-name',
    config.rustOutName
  ], { cwd: WORK_DIR });

  const generatedJsPath = path.join(bindgenDir, config.rustOutName + '.js');
  const generatedWasmPath = path.join(bindgenDir, config.rustOutName + '_bg.wasm');

  if (!fs.existsSync(generatedJsPath)) {
    fail('wasm-bindgen の JS 出力が見つかりません: ' + generatedJsPath);
  }

  if (!fs.existsSync(generatedWasmPath)) {
    fail('wasm-bindgen の wasm 出力が見つかりません: ' + generatedWasmPath);
  }

  return {
    generatedJsPath,
    generatedWasmPath
  };
}

function makeLoaderJs(config, generatedJsText) {
  let code = generatedJsText;

  code = code.replace(
    /new URL\(['"`][^'"`]+_bg\.wasm['"`],\s*import\.meta\.url\)/g,
    "new URL('./" + config.projectName + ".wasm', import.meta.url)"
  );

  code = [
    '/*',
    '  Generated by browser-build-workshop.',
    '  File: ' + config.projectName + '.loader.js',
    '  Mode: external wasm loader',
    '  Required file: ./' + config.projectName + '.wasm',
    '*/',
    '',
    code
  ].join('\n');

  return code;
}

function makeEmbeddedLoaderJs(config, generatedJsText, wasmBase64) {
  let code = generatedJsText;

  const helper = [
    'const __BROWSER_BUILD_WORKSHOP_WASM_BASE64 = "' + wasmBase64 + '";',
    '',
    'function __browserBuildWorkshopBase64ToBytes(base64) {',
    '  const binary = atob(base64);',
    '  const bytes = new Uint8Array(binary.length);',
    '  for (let i = 0; i < binary.length; i += 1) {',
    '    bytes[i] = binary.charCodeAt(i);',
    '  }',
    '  return bytes;',
    '}',
    ''
  ].join('\n');

  code = code.replace(
    /if \(typeof module_or_path === ['"`]undefined['"`]\) \{\s*module_or_path = new URL\(['"`][^'"`]+_bg\.wasm['"`],\s*import\.meta\.url\);\s*\}/,
    [
      'if (typeof module_or_path === "undefined") {',
      '        module_or_path = __browserBuildWorkshopBase64ToBytes(__BROWSER_BUILD_WORKSHOP_WASM_BASE64);',
      '    }'
    ].join('\n')
  );

  code = code.replace(
    /new URL\(['"`][^'"`]+_bg\.wasm['"`],\s*import\.meta\.url\)/g,
    '__browserBuildWorkshopBase64ToBytes(__BROWSER_BUILD_WORKSHOP_WASM_BASE64)'
  );

  code = [
    '/*',
    '  Generated by browser-build-workshop.',
    '  File: ' + config.projectName + '.embedded-loader.js',
    '  Mode: embedded base64 wasm loader',
    '  This file contains the wasm body as Base64.',
    '*/',
    '',
    helper,
    code
  ].join('\n');

  return code;
}

function makeManifest(config, files) {
  const manifest = {
    tool: 'browser-build-workshop',
    type: 'rust-wasm-build',
    createdAt: new Date().toISOString(),
    buildId: config.buildId,
    projectName: config.projectName,
    outputMode: config.outputMode,
    buildMode: config.buildMode,
    entryPoint: config.entryPoint,
    files: files.map((file) => {
      const buffer = readBuffer(file.path);
      return {
        name: file.name,
        size: buffer.length,
        sha256: crypto.createHash('sha256').update(buffer).digest('hex')
      };
    })
  };

  return JSON.stringify(manifest, null, 2);
}

function crc32(buffer) {
  let table = crc32.table;

  if (!table) {
    table = new Uint32Array(256);

    for (let i = 0; i < 256; i += 1) {
      let c = i;

      for (let j = 0; j < 8; j += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }

      table[i] = c >>> 0;
    }

    crc32.table = table;
  }

  let crc = 0xffffffff;

  for (let i = 0; i < buffer.length; i += 1) {
    crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = Math.floor(date.getSeconds() / 2);

  const dosTime = (hour << 11) | (minute << 5) | second;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;

  return { dosTime, dosDate };
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const { dosTime, dosDate } = dosDateTime(now);

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data || ''), 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralStart = offset;
  const centralBuffer = Buffer.concat(centralParts);
  const centralSize = centralBuffer.length;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuffer, end]);
}

function writeArtifacts(config, bindgenResult) {
  const wasmBuffer = readBuffer(bindgenResult.generatedWasmPath);
  const generatedJsText = readText(bindgenResult.generatedJsPath);
  const wasmBase64 = wasmBuffer.toString('base64');

  const wasmFileName = config.projectName + '.wasm';
  const loaderFileName = config.projectName + '.loader.js';
  const embeddedLoaderFileName = config.projectName + '.embedded-loader.js';
  const zipFileName = config.projectName + '-wasm-build.zip';

  const wasmPath = path.join(DIST_DIR, wasmFileName);
  const loaderPath = path.join(DIST_DIR, loaderFileName);
  const embeddedLoaderPath = path.join(DIST_DIR, embeddedLoaderFileName);
  const zipPath = path.join(DIST_DIR, zipFileName);
  const logPath = path.join(DIST_DIR, 'build-log.txt');
  const manifestPath = path.join(DIST_DIR, 'manifest.json');

  const loaderJs = makeLoaderJs(config, generatedJsText);
  const embeddedLoaderJs = makeEmbeddedLoaderJs(config, generatedJsText, wasmBase64);

  writeBuffer(wasmPath, wasmBuffer);
  writeText(loaderPath, loaderJs);
  writeText(embeddedLoaderPath, embeddedLoaderJs);

  const manifestTargetFiles = [
    { name: wasmFileName, path: wasmPath },
    { name: loaderFileName, path: loaderPath },
    { name: embeddedLoaderFileName, path: embeddedLoaderPath }
  ];

  writeText(manifestPath, makeManifest(config, manifestTargetFiles));

  log('');
  log('成果物を生成しました。');
  log('- ' + wasmFileName);
  log('- ' + loaderFileName);
  log('- ' + embeddedLoaderFileName);
  log('- manifest.json');
  log('- build-log.txt');
  log('');
  log('ZIP は自己自身を中に入れられないため、ZIP内部には実用ファイル4点を入れます。');
  log('ZIP内部: .wasm / .loader.js / .embedded-loader.js / build-log.txt / manifest.json');

  writeLogFile();

  const zipEntries = [
    { name: wasmFileName, data: readBuffer(wasmPath) },
    { name: loaderFileName, data: readBuffer(loaderPath) },
    { name: embeddedLoaderFileName, data: readBuffer(embeddedLoaderPath) },
    { name: 'build-log.txt', data: readBuffer(logPath) },
    { name: 'manifest.json', data: readBuffer(manifestPath) }
  ];

  const zipBuffer = makeZip(zipEntries);
  writeBuffer(zipPath, zipBuffer);

  log('');
  log('ZIPを生成しました。');
  log('- ' + zipFileName);

  writeLogFile();

  return {
    wasmFileName,
    loaderFileName,
    embeddedLoaderFileName,
    zipFileName
  };
}

function main() {
  log('Rust Wasm Build を開始します。');

  const config = parseBuildRequest();

  log('');
  log('buildId: ' + config.buildId);
  log('projectName: ' + config.projectName);
  log('packageName: ' + config.packageName);
  log('rustOutName: ' + config.rustOutName);
  log('entryPoint: ' + config.entryPoint);
  log('buildMode: ' + config.buildMode);
  log('crateType: ' + config.crateType);
  log('outputMode: ' + config.outputMode);

  prepareProject(config);

  const cargoWasmPath = buildRust(config);
  log('');
  log('cargo wasm: ' + cargoWasmPath);

  const bindgenResult = runWasmBindgen(config, cargoWasmPath);
  log('');
  log('wasm-bindgen js: ' + bindgenResult.generatedJsPath);
  log('wasm-bindgen wasm: ' + bindgenResult.generatedWasmPath);

  const artifacts = writeArtifacts(config, bindgenResult);

  log('');
  log('完了しました。');
  log('Artifacts:');
  log('- ' + artifacts.wasmFileName);
  log('- ' + artifacts.loaderFileName);
  log('- ' + artifacts.embeddedLoaderFileName);
  log('- ' + artifacts.zipFileName);
  log('- build-log.txt');

  writeLogFile();
}

main();