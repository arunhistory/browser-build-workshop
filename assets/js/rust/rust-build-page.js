(function (global) {
  'use strict';

  const state = {
    subFiles: [],
    lastBuildResult: null,
    isRunning: false,
    zipBlob: null,
    zipName: ''
  };

  function getEl(id) {
    return document.getElementById(id);
  }

  function safeValue(id, fallback) {
    const el = getEl(id);
    if (!el) return fallback || '';
    return typeof el.value === 'string' ? el.value : (fallback || '');
  }

  function setValue(id, value) {
    const el = getEl(id);
    if (el) el.value = value;
  }

  function setText(id, value) {
    const el = getEl(id);
    if (el) el.textContent = value;
  }

  function setHtml(id, value) {
    const el = getEl(id);
    if (el) el.innerHTML = value;
  }

  function setDisabled(id, disabled) {
    const el = getEl(id);
    if (el) el.disabled = !!disabled;
  }

  function setTextareaOrText(id, value) {
    const el = getEl(id);
    if (!el) return;

    if ('value' in el) {
      el.value = value || '';
      return;
    }

    el.textContent = value || '';
  }

  function normalizeLineBreaks(text) {
    return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function trimOrEmpty(text) {
    return normalizeLineBreaks(text).trim();
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showStatus(message) {
    setText('buildStatus', '状態: ' + message);
  }

  function showLog(text) {
    setTextareaOrText('buildLog', text || '');
  }

  function showOutput(text) {
    setTextareaOrText('buildOutput', text || '');
  }

  function showEmbeddedLoader(text) {
    setTextareaOrText('embeddedLoaderOutput', text || '');
  }

  function setLabelTextByFor(forId, text) {
    const label = document.querySelector('label[for="' + forId + '"]');
    if (label) label.textContent = text;
  }

  function updateProgress(percent, message) {
    const bar = getEl('buildProgressBar');
    const text = getEl('buildProgressText');

    if (bar) {
      bar.value = percent;
      bar.max = 100;
    }

    if (text) {
      text.textContent = String(percent) + '% - ' + message;
    }

    showStatus(message);
  }

  function normalizeProjectName(raw) {
    const value = trimOrEmpty(raw || 'sample-rust-project') || 'sample-rust-project';

    const normalized = value
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return normalized || 'sample-rust-project';
  }

  function normalizeEntryPoint(raw) {
    const value = trimOrEmpty(raw || 'lib.rs') || 'lib.rs';

    if (value === 'lib.rs') return 'src/lib.rs';
    if (value === 'main.rs') return 'src/main.rs';
    if (value.startsWith('/')) return value.slice(1);
    if (value.startsWith('src/')) return value;

    return 'src/' + value;
  }

  function inferEntryTarget(entryPoint) {
    const value = normalizeEntryPoint(entryPoint).toLowerCase();
    if (value.endsWith('main.rs')) return 'main';
    return 'lib';
  }

  function normalizeOutputMode(raw) {
    if (raw === 'wasm-only') return 'wasm-only';
    if (raw === 'js-only') return 'js-only';
    return 'wasm-js';
  }

  function normalizeBuildMode(raw) {
    if (raw === 'debug') return 'debug';
    return 'release';
  }

  function normalizeEdition(raw) {
    const value = trimOrEmpty(raw || '2021');
    if (['2015', '2018', '2021', '2024'].includes(value)) return value;
    return '2021';
  }

  function normalizeCrateType(raw, entryPoint) {
    if (inferEntryTarget(entryPoint) === 'main') return 'bin';

    const value = trimOrEmpty(raw || 'cdylib').toLowerCase();

    if (['cdylib', 'rlib', 'staticlib', 'dylib'].includes(value)) {
      return value;
    }

    return 'cdylib';
  }

  function normalizeSubFilePath(raw) {
    const value = trimOrEmpty(raw).replace(/\\/g, '/').replace(/^\/+/, '');

    if (!value) return '';
    if (value.includes('..')) return '';
    if (value.startsWith('src/')) return value;

    return 'src/' + value;
  }

  function getExpectedArtifactNames(projectName) {
    const baseName = normalizeProjectName(projectName || safeValue('projectName', 'sample-rust-project'));

    return {
      wasm: baseName + '.wasm',
      loaderJs: baseName + '.loader.js',
      embeddedLoaderJs: baseName + '.embedded-loader.js',
      base64: baseName + '.base64',
      buildLog: 'build-log.txt',
      buildRequest: 'build-request.json',
      zip: baseName + '-wasm-build.zip'
    };
  }

  function clearGeneratedOutputs() {
    const names = getExpectedArtifactNames();

    state.lastBuildResult = null;
    state.zipBlob = null;
    state.zipName = '';

    setLabelTextByFor('embeddedLoaderOutput', names.embeddedLoaderJs);

    showOutput('まだ出力はありません。');
    showEmbeddedLoader('まだ生成されていません。');
    setHtml('buildSummary', 'まだ要約はありません。');

    const zipNotice = getEl('zipNotice');
    if (zipNotice) {
      zipNotice.textContent = 'ZIPはまだ生成されていません。';
    }

    updateProgress(0, '待機中');
  }

  function readSubFileName() {
    return safeValue('subFileName', '').trim();
  }

  function readSubFileCode() {
    return safeValue('subFileCode', '');
  }

  function renderSubFiles() {
    const target = getEl('subFilesList');
    if (!target) return;

    if (!state.subFiles.length) {
      target.innerHTML = [
        '<div class="file-item">',
        '  <span>補助Rustファイルはまだ追加されていません</span>',
        '  <span>-</span>',
        '</div>'
      ].join('');
      return;
    }

    target.innerHTML = state.subFiles.map(function (file, index) {
      return [
        '<div class="file-item">',
        '  <div>',
        '    <strong>' + escapeHtml(file.name) + '</strong>',
        '    <div>文字数: ' + String((file.content || '').length) + '</div>',
        '  </div>',
        '  <div class="file-item-actions">',
        '    <button type="button" class="btn btn-muted" data-action="view-sub-file" data-index="' + String(index) + '">表示</button>',
        '    <button type="button" class="btn btn-danger" data-action="remove-sub-file" data-index="' + String(index) + '">削除</button>',
        '  </div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function addSubFile() {
    const rawName = readSubFileName();
    const content = readSubFileCode();
    const normalizedPath = normalizeSubFilePath(rawName);

    if (!rawName) {
      showStatus('補助ファイル名を入れてください');
      return;
    }

    if (!normalizedPath) {
      showStatus('補助ファイル名に危険な文字または不正なパスがあります');
      return;
    }

    if (!normalizedPath.endsWith('.rs')) {
      showStatus('補助ファイル名は .rs で終わる必要があります');
      return;
    }

    if (!content.trim()) {
      showStatus('補助ファイルの中身が空です');
      return;
    }

    const exists = state.subFiles.some(function (file) {
      return file.name === normalizedPath;
    });

    if (exists) {
      showStatus('同じ名前の補助ファイルは追加できません');
      return;
    }

    state.subFiles.push({
      id: 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      name: normalizedPath,
      content: normalizeLineBreaks(content)
    });

    setValue('subFileName', '');
    setValue('subFileCode', '');
    renderSubFiles();
    showStatus('補助ファイルを追加しました');
  }

  function removeSubFile(index) {
    if (index < 0 || index >= state.subFiles.length) {
      showStatus('削除対象の補助ファイルが見つかりません');
      return;
    }

    const removed = state.subFiles.splice(index, 1)[0];
    renderSubFiles();
    showStatus('補助ファイルを削除しました: ' + removed.name);
  }

  function viewSubFile(index) {
    if (index < 0 || index >= state.subFiles.length) {
      showStatus('表示対象の補助ファイルが見つかりません');
      return;
    }

    const file = state.subFiles[index];
    setValue('subFileName', file.name);
    setValue('subFileCode', file.content);
    showStatus('補助ファイルを表示しました: ' + file.name);
  }

  function collectInput() {
    const entryPoint = normalizeEntryPoint(safeValue('entryType', 'lib.rs'));
    const projectName = normalizeProjectName(safeValue('projectName', 'sample-rust-project'));

    return {
      buildId: 'rust-build-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
      projectName: projectName,
      entryPoint: entryPoint,
      outputMode: normalizeOutputMode(safeValue('outputMode', 'wasm-js').trim()),
      buildMode: normalizeBuildMode(safeValue('buildMode', 'release').trim()),
      crateType: normalizeCrateType(safeValue('crateType', 'cdylib'), entryPoint),
      version: safeValue('version', '0.1.0').trim() || '0.1.0',
      edition: normalizeEdition(safeValue('edition', '2021')),
      dependenciesText: normalizeLineBreaks(safeValue('dependenciesText', '')),
      featuresText: normalizeLineBreaks(safeValue('featuresText', '')),
      cargoTomlText: normalizeLineBreaks(safeValue('cargoToml', '')),
      mainRustCode: normalizeLineBreaks(safeValue('mainRustCode', '')),
      subFiles: state.subFiles.map(function (file) {
        return {
          name: file.name,
          content: normalizeLineBreaks(file.content || '')
        };
      }),
      flags: {
        enableWasmBindgen: !!getEl('enableWasmBindgen') ? !!getEl('enableWasmBindgen').checked : true,
        enableOptimize: !!getEl('enableOptimize') ? !!getEl('enableOptimize').checked : true,
        enableJsLoader: !!getEl('enableJsLoader') ? !!getEl('enableJsLoader').checked : true
      }
    };
  }

  function createBuildRequest(input) {
    return {
      build: {
        buildId: input.buildId,
        projectName: input.projectName,
        version: input.version,
        edition: input.edition,
        entryPoint: input.entryPoint,
        outputMode: input.outputMode,
        buildMode: input.buildMode,
        crateType: input.crateType,
        dependenciesText: input.dependenciesText,
        featuresText: input.featuresText,
        mainRustCode: input.mainRustCode,
        subFiles: input.subFiles,
        flags: input.flags
      }
    };
  }

  function validateInput(input) {
    const errors = [];
    const warnings = [];

    if (!input.projectName) {
      errors.push('projectName が空です。');
    }

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(input.projectName)) {
      errors.push('projectName は英小文字・数字・ハイフンのみで指定してください。');
    }

    if (!/^\d+\.\d+\.\d+$/.test(input.version)) {
      errors.push('version は 0.1.0 の形式にしてください。');
    }

    if (!input.entryPoint.endsWith('.rs')) {
      errors.push('entryPoint は .rs ファイルにしてください。');
    }

    if (!input.mainRustCode.trim()) {
      errors.push('メインRustコードが空です。');
    }

    if (inferEntryTarget(input.entryPoint) === 'main') {
      warnings.push('main.rs は bin 扱いです。wasmライブラリ化したい場合は lib.rs を使ってください。');
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings
    };
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }

    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  function normalizeBytes(value) {
    if (value instanceof Uint8Array) return value;

    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }

    if (Array.isArray(value)) {
      return new Uint8Array(value);
    }

    if (typeof value === 'string') {
      return base64ToBytes(value);
    }

    throw new Error('wasm本体が Uint8Array / ArrayBuffer / base64 のどれでもありません。');
  }

  function makeDefaultLoaderJs(input, names) {
    const functionName = makeLoadFunctionName(input.projectName);

    return [
      '// Rust Wasm loader',
      '// build id: ' + input.buildId,
      '// project: ' + input.projectName,
      '',
      'export async function ' + functionName + '(imports = {}) {',
      '  const wasmUrl = new URL("./' + names.wasm + '", import.meta.url);',
      '  const response = await fetch(wasmUrl);',
      '  if (!response.ok) {',
      '    throw new Error(`Wasm fetch failed: ${response.status} ${response.statusText}`);',
      '  }',
      '  const bytes = await response.arrayBuffer();',
      '  const result = await WebAssembly.instantiate(bytes, imports);',
      '  return result.instance;',
      '}',
      '',
      'export default ' + functionName + ';',
      ''
    ].join('\n');
  }

  function makeEmbeddedLoaderJs(input, names, wasmBase64, loaderJsText) {
    const functionName = makeLoadFunctionName(input.projectName);

    return [
      '// Rust Wasm embedded-loader',
      '// build id: ' + input.buildId,
      '// project: ' + input.projectName,
      '// source loader: ' + names.loaderJs,
      '',
      'const __embeddedWasmBase64 = ' + JSON.stringify(wasmBase64) + ';',
      '',
      'function __base64ToBytes(base64) {',
      '  const binary = atob(base64);',
      '  const bytes = new Uint8Array(binary.length);',
      '  for (let i = 0; i < binary.length; i += 1) {',
      '    bytes[i] = binary.charCodeAt(i);',
      '  }',
      '  return bytes;',
      '}',
      '',
      'export async function ' + functionName + '(imports = {}) {',
      '  const bytes = __base64ToBytes(__embeddedWasmBase64);',
      '  const result = await WebAssembly.instantiate(bytes, imports);',
      '  return result.instance;',
      '}',
      '',
      'export function getEmbeddedWasmBytes() {',
      '  return __base64ToBytes(__embeddedWasmBase64);',
      '}',
      '',
      'export function getEmbeddedWasmBase64() {',
      '  return __embeddedWasmBase64;',
      '}',
      '',
      'export const originalLoaderSource = ' + JSON.stringify(loaderJsText) + ';',
      '',
      'export default ' + functionName + ';',
      ''
    ].join('\n');
  }

  function makeLoadFunctionName(projectName) {
    const body = normalizeProjectName(projectName)
      .split('-')
      .filter(Boolean)
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join('');

    return 'load' + (body || 'RustWasm');
  }

  async function runCompiler(input) {
    if (
      global.RustWasmCompiler &&
      typeof global.RustWasmCompiler.compile === 'function'
    ) {
      return await global.RustWasmCompiler.compile(input);
    }

    if (
      global.RustBuildEngine &&
      typeof global.RustBuildEngine.compile === 'function'
    ) {
      return await global.RustBuildEngine.compile(input);
    }

    throw new Error(
      'Rust→Wasmコンパイラ本体が接続されていません。assets/js/rust/rust-wasm-compiler.js を読み込ませてください。'
    );
  }

  async function buildArtifacts(input) {
    const names = getExpectedArtifactNames(input.projectName);
    const buildRequest = createBuildRequest(input);

    updateProgress(20, 'Rustコードと設定をコンパイラへ渡しています');

    const compilerResult = await runCompiler(input);

    updateProgress(45, '.wasm を受け取りました');

    const wasmBytes = normalizeBytes(
      compilerResult.wasmBytes ||
      compilerResult.wasm ||
      compilerResult.wasmBase64
    );

    const wasmBase64 = bytesToBase64(wasmBytes);

    updateProgress(60, 'loader.js を生成しています');

    const loaderJsText = compilerResult.loaderJsText ||
      compilerResult.loaderJs ||
      makeDefaultLoaderJs(input, names);

    updateProgress(70, 'embedded-loader.js を生成しています');

    const embeddedLoaderText = makeEmbeddedLoaderJs(
      input,
      names,
      wasmBase64,
      loaderJsText
    );

    updateProgress(80, '成果物をまとめています');

    const buildLogText = [
      '=== Rust Wasm Build ===',
      'status: success',
      'buildId: ' + input.buildId,
      'projectName: ' + input.projectName,
      'entryPoint: ' + input.entryPoint,
      'buildMode: ' + input.buildMode,
      'crateType: ' + input.crateType,
      'outputMode: ' + input.outputMode,
      '',
      'generated artifacts:',
      '- ' + names.wasm,
      '- ' + names.loaderJs,
      '- ' + names.embeddedLoaderJs,
      '- ' + names.base64,
      '- ' + names.buildLog,
      '- ' + names.buildRequest,
      '',
      'compiler log:',
      compilerResult.logText || compilerResult.buildLog || '(なし)'
    ].join('\n');

    const outputText = [
      '=== Rust Wasm Output ===',
      'status: success',
      'projectName: ' + input.projectName,
      'embeddedLoader: ' + names.embeddedLoaderJs,
      'zip: ' + names.zip,
      '',
      'page display:',
      '- build-log.txt',
      '- output',
      '- ' + names.embeddedLoaderJs,
      '- ZIP download'
    ].join('\n');

    const files = [
      {
        name: names.wasm,
        type: 'application/wasm',
        bytes: wasmBytes
      },
      {
        name: names.loaderJs,
        type: 'text/javascript;charset=utf-8',
        text: loaderJsText
      },
      {
        name: names.embeddedLoaderJs,
        type: 'text/javascript;charset=utf-8',
        text: embeddedLoaderText
      },
      {
        name: names.base64,
        type: 'text/plain;charset=utf-8',
        text: wasmBase64
      },
      {
        name: names.buildLog,
        type: 'text/plain;charset=utf-8',
        text: buildLogText
      },
      {
        name: names.buildRequest,
        type: 'application/json;charset=utf-8',
        text: JSON.stringify(buildRequest, null, 2)
      }
    ];

    return {
      ok: true,
      input,
      names,
      buildRequest,
      files,
      wasmBytes,
      wasmBase64,
      loaderJsText,
      embeddedLoaderText,
      buildLogText,
      outputText
    };
  }

  function makeCrcTable() {
    const table = [];

    for (let n = 0; n < 256; n += 1) {
      let c = n;

      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }

      table[n] = c >>> 0;
    }

    return table;
  }

  const CRC_TABLE = makeCrcTable();

  function crc32(bytes) {
    let crc = 0 ^ -1;

    for (let i = 0; i < bytes.length; i += 1) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
    }

    return (crc ^ -1) >>> 0;
  }

  function textToBytes(text) {
    return new TextEncoder().encode(text);
  }

  function numberToBytesLE(value, byteLength) {
    const bytes = [];

    for (let i = 0; i < byteLength; i += 1) {
      bytes.push((value >>> (8 * i)) & 0xff);
    }

    return bytes;
  }

  function concatUint8Arrays(arrays) {
    let total = 0;

    arrays.forEach(function (array) {
      total += array.length;
    });

    const result = new Uint8Array(total);
    let offset = 0;

    arrays.forEach(function (array) {
      result.set(array, offset);
      offset += array.length;
    });

    return result;
  }

  function createZipBlob(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach(function (file) {
      const nameBytes = textToBytes(file.name);
      const dataBytes = file.bytes || textToBytes(file.text || '');
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      const localHeader = new Uint8Array([
        ...numberToBytesLE(0x04034b50, 4),
        ...numberToBytesLE(20, 2),
        ...numberToBytesLE(0, 2),
        ...numberToBytesLE(0, 2),
        ...numberToBytesLE(0, 2),
        ...numberToBytesLE(0, 2),
        ...numberToBytesLE(crc, 4),
        ...numberToBytesLE(size, 4),
        ...numberToBytesLE(size, 4),
        ...numberToBytesLE(nameBytes.length, 2),
        ...numberToBytesLE(0, 2)
      ]);

      localParts.push(localHeader, nameBytes, dataBytes);

      const centralHeader = new Uint8Array([
        ...numberToBytesLE(0x02014b50, 4),
        ...numberToBytesLE(20, 2),
        ...numberToBytesLE(20, 2),
        ...numberToBytesLE(0, 2),
        ...numberToBytesLE(0, 2),
        ...numberToBytesLE(0, 2),
        ...numberToBytesLE(0, 2),
        ...numberToBytesLE(crc, 4),
        ...numberToBytesLE(size, 4),
        ...numberToBytesLE(size, 4),
        ...numberToBytesLE(nameBytes.length, 2),
        ...numberToBytesLE(0, 2),
        ...numberToBytesLE(0, 2),
        ...numberToBytesLE(0, 2),
        ...numberToBytesLE(0, 2),
        ...numberToBytesLE(0, 4),
        ...numberToBytesLE(offset, 4)
      ]);

      centralParts.push(centralHeader, nameBytes);

      offset += localHeader.length + nameBytes.length + dataBytes.length;
    });

    const centralStart = offset;
    const centralData = concatUint8Arrays(centralParts);
    const centralSize = centralData.length;

    const endRecord = new Uint8Array([
      ...numberToBytesLE(0x06054b50, 4),
      ...numberToBytesLE(0, 2),
      ...numberToBytesLE(0, 2),
      ...numberToBytesLE(files.length, 2),
      ...numberToBytesLE(files.length, 2),
      ...numberToBytesLE(centralSize, 4),
      ...numberToBytesLE(centralStart, 4),
      ...numberToBytesLE(0, 2)
    ]);

    const zipBytes = concatUint8Arrays([
      ...localParts,
      centralData,
      endRecord
    ]);

    return new Blob([zipBytes], { type: 'application/zip' });
  }

  function downloadByAnchor(filename, content, mimeType) {
    const blob = content instanceof Blob
      ? content
      : new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function renderBuildResult(result) {
    state.lastBuildResult = result;
    state.zipBlob = createZipBlob(result.files);
    state.zipName = result.names.zip;

    setLabelTextByFor('embeddedLoaderOutput', result.names.embeddedLoaderJs);

    showLog(result.buildLogText);
    showOutput(result.outputText);
    showEmbeddedLoader(result.embeddedLoaderText);

    const zipNotice = getEl('zipNotice');
    if (zipNotice) {
      zipNotice.textContent = result.names.zip + ' をダウンロードできます。';
    }

    setHtml('buildSummary', [
      '<div class="rust-real-compile-summary">',
      '<p><strong>状態:</strong> 成功</p>',
      '<p><strong>project:</strong> ' + escapeHtml(result.input.projectName) + '</p>',
      '<p><strong>表示:</strong> ' + escapeHtml(result.names.embeddedLoaderJs) + '</p>',
      '<p><strong>ZIP:</strong> ' + escapeHtml(result.names.zip) + '</p>',
      '</div>'
    ].join(''));

    updateProgress(100, '成果物生成完了');
  }

  function renderBuildError(input, error) {
    const names = getExpectedArtifactNames(input ? input.projectName : '');

    state.lastBuildResult = null;
    state.zipBlob = null;
    state.zipName = '';

    const log = [
      '=== Rust Wasm Build ===',
      'status: error',
      '',
      String(error && error.stack ? error.stack : error)
    ].join('\n');

    setLabelTextByFor('embeddedLoaderOutput', names.embeddedLoaderJs);
    showLog(log);
    showOutput('変換に失敗しました。ビルドログを確認してください。');
    showEmbeddedLoader('生成されていません。');

    const zipNotice = getEl('zipNotice');
    if (zipNotice) {
      zipNotice.textContent = 'ZIPは生成されていません。';
    }

    setHtml('buildSummary', [
      '<div class="rust-real-compile-summary">',
      '<p><strong>状態:</strong> 失敗</p>',
      '<p><strong>原因:</strong> ' + escapeHtml(String(error && error.message ? error.message : error)) + '</p>',
      '</div>'
    ].join(''));

    updateProgress(0, '変換失敗');
  }

  function lockUi(locked) {
    setDisabled('runBuildButton', locked);
    setDisabled('addSubFileButton', locked);
    setDisabled('clearAllButton', locked);
    setDisabled('downloadOutputButton', locked);
    setDisabled('downloadLogButton', locked);
    setDisabled('copyOutputButton', locked);
    setDisabled('downloadZipButton', locked);
    setDisabled('copyEmbeddedLoaderButton', locked);
  }

  async function runBuild() {
    if (state.isRunning) {
      showStatus('変換処理中です');
      return;
    }

    state.isRunning = true;
    lockUi(true);

    let input = null;

    try {
      clearGeneratedOutputs();

      updateProgress(5, '入力を確認しています');

      input = collectInput();
      const validation = validateInput(input);

      if (!validation.ok) {
        throw new Error('入力エラーがあります。\n- ' + validation.errors.join('\n- '));
      }

      updateProgress(10, 'buildRequestJson を生成しています');

      const result = await buildArtifacts(input);

      renderBuildResult(result);
    } catch (error) {
      renderBuildError(input, error);
    } finally {
      state.isRunning = false;
      lockUi(false);
    }
  }

  function clearAll() {
    state.subFiles = [];
    state.lastBuildResult = null;
    state.zipBlob = null;
    state.zipName = '';

    setValue('projectName', 'sample-rust-project');
    setValue('entryType', 'lib.rs');
    setValue('outputMode', 'wasm-js');
    setValue('buildMode', 'release');
    setValue('crateType', 'cdylib');
    setValue('version', '0.1.0');
    setValue('edition', '2021');

    setValue('dependenciesText', 'wasm-bindgen = "0.2"');
    setValue('featuresText', '');

    setValue('cargoToml', [
      '[package]',
      'name = "sample-rust-project"',
      'version = "0.1.0"',
      'edition = "2021"',
      '',
      '[lib]',
      'crate-type = ["cdylib"]',
      '',
      '[dependencies]',
      'wasm-bindgen = "0.2"'
    ].join('\n'));

    setValue('mainRustCode', [
      'use wasm_bindgen::prelude::*;',
      '',
      '#[wasm_bindgen]',
      'pub fn greet(name: &str) -> String {',
      '    format!("hello {}", name)',
      '}'
    ].join('\n'));

    setValue('subFileName', '');
    setValue('subFileCode', '');

    showLog('');
    clearGeneratedOutputs();
    renderSubFiles();
    showStatus('初期化しました');
  }

  function downloadOutput() {
    if (!state.lastBuildResult || !state.lastBuildResult.outputText) {
      showStatus('出力内容はまだ生成されていません');
      return;
    }

    downloadByAnchor(
      'output.txt',
      state.lastBuildResult.outputText,
      'text/plain;charset=utf-8'
    );

    showStatus('出力内容を保存しました');
  }

  function downloadLog() {
    if (!state.lastBuildResult || !state.lastBuildResult.buildLogText) {
      showStatus('ビルドログはまだ生成されていません');
      return;
    }

    downloadByAnchor(
      'build-log.txt',
      state.lastBuildResult.buildLogText,
      'text/plain;charset=utf-8'
    );

    showStatus('ビルドログを保存しました');
  }

  function downloadZip() {
    if (!state.zipBlob || !state.zipName) {
      showStatus('ZIPはまだ生成されていません');
      return;
    }

    downloadByAnchor(state.zipName, state.zipBlob, 'application/zip');
    showStatus('ZIPをダウンロードしました');
  }

  async function copyOutput() {
    if (!state.lastBuildResult || !state.lastBuildResult.outputText) {
      showStatus('コピーする出力内容がありません');
      return;
    }

    try {
      await navigator.clipboard.writeText(state.lastBuildResult.outputText);
      showStatus('出力内容をコピーしました');
    } catch (error) {
      showStatus('出力内容のコピーに失敗しました');
      showLog(String(error && error.stack ? error.stack : error));
    }
  }

  async function copyEmbeddedLoader() {
    if (!state.lastBuildResult || !state.lastBuildResult.embeddedLoaderText) {
      showStatus('コピーする embedded-loader.js がありません');
      return;
    }

    try {
      await navigator.clipboard.writeText(state.lastBuildResult.embeddedLoaderText);
      showStatus('embedded-loader.js をコピーしました');
    } catch (error) {
      showStatus('embedded-loader.js のコピーに失敗しました');
      showLog(String(error && error.stack ? error.stack : error));
    }
  }

  function bindButtons() {
    const addSubFileButton = getEl('addSubFileButton');
    const runBuildButton = getEl('runBuildButton');
    const clearAllButton = getEl('clearAllButton');
    const downloadOutputButton = getEl('downloadOutputButton');
    const downloadLogButton = getEl('downloadLogButton');
    const copyOutputButton = getEl('copyOutputButton');
    const downloadZipButton = getEl('downloadZipButton');
    const copyEmbeddedLoaderButton = getEl('copyEmbeddedLoaderButton');

    if (addSubFileButton) addSubFileButton.addEventListener('click', addSubFile);
    if (runBuildButton) runBuildButton.addEventListener('click', runBuild);
    if (clearAllButton) clearAllButton.addEventListener('click', clearAll);
    if (downloadOutputButton) downloadOutputButton.addEventListener('click', downloadOutput);
    if (downloadLogButton) downloadLogButton.addEventListener('click', downloadLog);
    if (copyOutputButton) copyOutputButton.addEventListener('click', copyOutput);
    if (downloadZipButton) downloadZipButton.addEventListener('click', downloadZip);
    if (copyEmbeddedLoaderButton) copyEmbeddedLoaderButton.addEventListener('click', copyEmbeddedLoader);
  }

  function bindSubFileActions() {
    const list = getEl('subFilesList');
    if (!list) return;

    list.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const action = target.getAttribute('data-action');
      const index = Number(target.getAttribute('data-index'));

      if (!action || Number.isNaN(index)) return;

      if (action === 'remove-sub-file') {
        removeSubFile(index);
        return;
      }

      if (action === 'view-sub-file') {
        viewSubFile(index);
      }
    });
  }

  function bindNavigation() {
    const goHome = getEl('goHome');
    const goTsPage = getEl('goTsPage');

    if (goHome) {
      goHome.addEventListener('click', function () {
        location.href = './index.html';
      });
    }

    if (goTsPage) {
      goTsPage.addEventListener('click', function () {
        location.href = './ts-build.html';
      });
    }
  }

  function bindProjectNamePreview() {
    const projectName = getEl('projectName');
    if (!projectName) return;

    projectName.addEventListener('input', function () {
      if (state.lastBuildResult) return;

      const names = getExpectedArtifactNames(projectName.value);
      setLabelTextByFor('embeddedLoaderOutput', names.embeddedLoaderJs);
    });
  }

  function ensureFields() {
    if (!getEl('buildProgressBar')) console.warn('buildProgressBar が見つかりません');
    if (!getEl('buildProgressText')) console.warn('buildProgressText が見つかりません');
    if (!getEl('buildLog')) console.warn('buildLog が見つかりません');
    if (!getEl('buildOutput')) console.warn('buildOutput が見つかりません');
    if (!getEl('embeddedLoaderOutput')) console.warn('embeddedLoaderOutput が見つかりません');
    if (!getEl('downloadZipButton')) console.warn('downloadZipButton が見つかりません');
    if (!getEl('copyEmbeddedLoaderButton')) console.warn('copyEmbeddedLoaderButton が見つかりません');
  }

  function init() {
    ensureFields();
    bindButtons();
    bindSubFileActions();
    bindNavigation();
    bindProjectNamePreview();
    renderSubFiles();
    clearGeneratedOutputs();
    showStatus('準備完了');
  }

  init();
})(window);