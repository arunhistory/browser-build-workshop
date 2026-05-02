(function (global) {
  'use strict';

  const state = {
    subFiles: [],
    lastBuildResult: null,
    isRunning: false
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
    if (el) {
      el.value = value;
    }
  }

  function setText(id, value) {
    const el = getEl(id);
    if (el) {
      el.textContent = value;
    }
  }

  function setHtml(id, value) {
    const el = getEl(id);
    if (el) {
      el.innerHTML = value;
    }
  }

  function setDisabled(id, disabled) {
    const el = getEl(id);
    if (el) {
      el.disabled = !!disabled;
    }
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
    if (label) {
      label.textContent = text;
    }
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

  function normalizeCrateType(raw, entryPoint) {
    const entryTarget = inferEntryTarget(entryPoint);

    if (entryTarget === 'main') {
      return 'bin';
    }

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

  function getNames(projectName) {
    const base = normalizeProjectName(projectName || safeValue('projectName', 'sample-rust-project'));

    return {
      base: base,
      wasm: base + '.wasm',
      loaderJs: base + '.loader.js',
      embeddedLoaderJs: base + '.embedded-loader.js',
      base64: base + '.base64',
      buildLog: 'build-log.txt',
      buildRequest: 'build-request.json',
      zip: base + '-wasm-build.zip'
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

  function textToBytes(text) {
    return new TextEncoder().encode(String(text || ''));
  }

  function normalizeWasmBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (Array.isArray(value)) return new Uint8Array(value);
    if (typeof value === 'string') return base64ToBytes(value);

    throw new Error('wasm本体が取得できません。コンパイラ結果に wasmBytes / wasm / wasmBase64 が必要です。');
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

  function makeEmbeddedLoaderJs(input, names, wasmBase64) {
    const functionName = makeLoadFunctionName(input.projectName);

    return [
      '// Rust Wasm embedded loader',
      '// build id: ' + input.buildId,
      '// project: ' + input.projectName,
      '// wasm file: ' + names.wasm,
      '// this file embeds wasm as base64',
      '',
      'const __orikuroEmbeddedWasmBase64 = ' + JSON.stringify(wasmBase64) + ';',
      '',
      'function __orikuroBase64ToBytes(base64) {',
      '  const binary = atob(base64);',
      '  const bytes = new Uint8Array(binary.length);',
      '  for (let i = 0; i < binary.length; i += 1) {',
      '    bytes[i] = binary.charCodeAt(i);',
      '  }',
      '  return bytes;',
      '}',
      '',
      'export async function ' + functionName + '(imports = {}) {',
      '  const bytes = __orikuroBase64ToBytes(__orikuroEmbeddedWasmBase64);',
      '  const result = await WebAssembly.instantiate(bytes, imports);',
      '  return result.instance;',
      '}',
      '',
      'export function getEmbeddedWasmBytes() {',
      '  return __orikuroBase64ToBytes(__orikuroEmbeddedWasmBase64);',
      '}',
      '',
      'export function getEmbeddedWasmBase64() {',
      '  return __orikuroEmbeddedWasmBase64;',
      '}',
      '',
      'export default ' + functionName + ';',
      ''
    ].join('\n');
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
        enableWasmBindgen: getEl('enableWasmBindgen') ? !!getEl('enableWasmBindgen').checked : true,
        enableOptimize: getEl('enableOptimize') ? !!getEl('enableOptimize').checked : true,
        enableJsLoader: getEl('enableJsLoader') ? !!getEl('enableJsLoader').checked : true
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

    if (input.outputMode === 'js-only') {
      warnings.push('js-only は .wasm を出力しません。本物のwasm生成確認には wasm-js または wasm-only を使ってください。');
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
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

  function makeCrc32Table() {
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

  const CRC32_TABLE = makeCrc32Table();

  function crc32(bytes) {
    let crc = 0xffffffff;

    for (let i = 0; i < bytes.length; i += 1) {
      crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  function pushUint16(list, value) {
    list.push(value & 0xff, (value >>> 8) & 0xff);
  }

  function pushUint32(list, value) {
    list.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff
    );
  }

  function concatUint8Arrays(parts) {
    let total = 0;

    for (const part of parts) {
      total += part.length;
    }

    const output = new Uint8Array(total);
    let offset = 0;

    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }

    return output;
  }

  function makeZip(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = textToBytes(file.name);
      const dataBytes = file.bytes instanceof Uint8Array ? file.bytes : textToBytes(file.content || '');
      const crc = crc32(dataBytes);

      const local = [];

      pushUint32(local, 0x04034b50);
      pushUint16(local, 20);
      pushUint16(local, 0);
      pushUint16(local, 0);
      pushUint16(local, 0);
      pushUint16(local, 0);
      pushUint32(local, crc);
      pushUint32(local, dataBytes.length);
      pushUint32(local, dataBytes.length);
      pushUint16(local, nameBytes.length);
      pushUint16(local, 0);

      const localHeader = new Uint8Array(local);
      localParts.push(localHeader, nameBytes, dataBytes);

      const central = [];

      pushUint32(central, 0x02014b50);
      pushUint16(central, 20);
      pushUint16(central, 20);
      pushUint16(central, 0);
      pushUint16(central, 0);
      pushUint16(central, 0);
      pushUint16(central, 0);
      pushUint32(central, crc);
      pushUint32(central, dataBytes.length);
      pushUint32(central, dataBytes.length);
      pushUint16(central, nameBytes.length);
      pushUint16(central, 0);
      pushUint16(central, 0);
      pushUint16(central, 0);
      pushUint16(central, 0);
      pushUint32(central, 0);
      pushUint32(central, offset);

      const centralHeader = new Uint8Array(central);
      centralParts.push(centralHeader, nameBytes);

      offset += localHeader.length + nameBytes.length + dataBytes.length;
    }

    const centralDir = concatUint8Arrays(centralParts);
    const end = [];

    pushUint32(end, 0x06054b50);
    pushUint16(end, 0);
    pushUint16(end, 0);
    pushUint16(end, files.length);
    pushUint16(end, files.length);
    pushUint32(end, centralDir.length);
    pushUint32(end, offset);
    pushUint16(end, 0);

    return concatUint8Arrays([
      concatUint8Arrays(localParts),
      centralDir,
      new Uint8Array(end)
    ]);
  }

  function downloadBlob(filename, bytes, mimeType) {
    const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
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

  function downloadText(filename, content, mimeType) {
    downloadBlob(filename, textToBytes(content || ''), mimeType || 'text/plain;charset=utf-8');
  }

  function makeSummaryHtml(result) {
    return [
      '<div class="rust-real-compile-summary">',
      '<p><strong>状態:</strong> 生成完了</p>',
      '<p><strong>buildId:</strong> ' + escapeHtml(result.input.buildId) + '</p>',
      '<p><strong>project:</strong> ' + escapeHtml(result.input.projectName) + '</p>',
      '<p><strong>wasm:</strong> ' + escapeHtml(result.names.wasm) + '</p>',
      '<p><strong>loader:</strong> ' + escapeHtml(result.names.loaderJs) + '</p>',
      '<p><strong>embedded:</strong> ' + escapeHtml(result.names.embeddedLoaderJs) + '</p>',
      '<p><strong>zip:</strong> ' + escapeHtml(result.names.zip) + '</p>',
      '</div>'
    ].join('');
  }

  async function runBuild() {
    if (state.isRunning) {
      showStatus('変換中です');
      return;
    }

    state.isRunning = true;
    lockUi(true);

    showStatus('入力確認中...');
    showLog('入力を確認しています...');
    showOutput('');
    showEmbeddedLoader('');
    setHtml('buildSummary', '');

    try {
      const input = collectInput();
      const validation = validateInput(input);

      if (!validation.ok) {
        const text = [
          '入力エラーがあります。',
          '',
          'errors:',
          validation.errors.map(function (item) { return '- ' + item; }).join('\n')
        ].join('\n');

        throw new Error(text);
      }

      const names = getNames(input.projectName);
      const buildRequest = createBuildRequest(input);
      const buildRequestText = JSON.stringify(buildRequest, null, 2);

      setLabelTextByFor('embeddedLoaderOutput', names.embeddedLoaderJs);

      showStatus('Rust→Wasm変換中...');
      showLog('RustWasmCompiler.compile(input) を実行しています...');

      if (!global.RustWasmCompiler || typeof global.RustWasmCompiler.compile !== 'function') {
        throw new Error('RustWasmCompiler が読み込まれていません。rust-wasm-compiler.js を rust-build-page.js より前に読み込んでください。');
      }

      const compilerResult = await global.RustWasmCompiler.compile(input);

      const wasmBytes = normalizeWasmBytes(
        compilerResult.wasmBytes ||
        compilerResult.wasm ||
        compilerResult.wasmBase64
      );

      const wasmBase64 = compilerResult.wasmBase64 || bytesToBase64(wasmBytes);
      const loaderJsText = compilerResult.loaderJsText || compilerResult.loaderJs || makeDefaultLoaderJs(input, names);
      const embeddedLoaderText = makeEmbeddedLoaderJs(input, names, wasmBase64);

      const buildLogText = [
        '=== Rust Wasm Build ===',
        'status: success',
        'buildId: ' + input.buildId,
        'projectName: ' + input.projectName,
        'wasmFile: ' + names.wasm,
        'loaderFile: ' + names.loaderJs,
        'embeddedLoaderFile: ' + names.embeddedLoaderJs,
        'zipFile: ' + names.zip,
        '',
        'warnings:',
        validation.warnings.length ? validation.warnings.map(function (item) { return '- ' + item; }).join('\n') : '- なし',
        '',
        'compiler log:',
        compilerResult.logText || '(なし)'
      ].join('\n');

      const outputText = [
        '=== Rust Wasm Output ===',
        'status: success',
        'projectName: ' + input.projectName,
        '',
        'page display:',
        '- ' + names.buildLog,
        '- output text',
        '- ' + names.embeddedLoaderJs,
        '- ' + names.zip,
        '',
        'zip contents:',
        '- ' + names.wasm,
        '- ' + names.loaderJs,
        '- ' + names.embeddedLoaderJs,
        '- ' + names.base64,
        '- ' + names.buildLog,
        '- ' + names.buildRequest
      ].join('\n');

      const zipBytes = makeZip([
        {
          name: names.wasm,
          bytes: wasmBytes
        },
        {
          name: names.loaderJs,
          content: loaderJsText
        },
        {
          name: names.embeddedLoaderJs,
          content: embeddedLoaderText
        },
        {
          name: names.base64,
          content: wasmBase64
        },
        {
          name: names.buildLog,
          content: buildLogText
        },
        {
          name: names.buildRequest,
          content: buildRequestText
        }
      ]);

      const result = {
        ok: true,
        input: input,
        names: names,
        buildRequestText: buildRequestText,
        wasmBytes: wasmBytes,
        wasmBase64: wasmBase64,
        loaderJsText: loaderJsText,
        embeddedLoaderText: embeddedLoaderText,
        buildLogText: buildLogText,
        outputText: outputText,
        zipBytes: zipBytes
      };

      state.lastBuildResult = result;

      showLog(buildLogText);
      showOutput(outputText);
      showEmbeddedLoader(embeddedLoaderText);
      setHtml('buildSummary', makeSummaryHtml(result));
      showStatus('生成完了');
    } catch (error) {
      state.lastBuildResult = null;

      const message = String(error && error.stack ? error.stack : error);

      showStatus('生成失敗');
      showLog(message);
      showOutput('生成に失敗しました。ビルドログを確認してください。');
      showEmbeddedLoader('生成されていません。');
      setHtml('buildSummary', '<div class="rust-real-compile-summary"><p><strong>状態:</strong> 生成失敗</p></div>');
    } finally {
      state.isRunning = false;
      lockUi(false);
    }
  }

  function clearAll() {
    state.subFiles = [];
    state.lastBuildResult = null;

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

    const names = getNames('sample-rust-project');
    setLabelTextByFor('embeddedLoaderOutput', names.embeddedLoaderJs);

    showLog('');
    showOutput('まだ出力はありません。');
    showEmbeddedLoader('まだ生成されていません。');
    setHtml('buildSummary', 'まだ要約はありません。');
    renderSubFiles();
    showStatus('初期化しました');
  }

  function downloadOutput() {
    if (!state.lastBuildResult || !state.lastBuildResult.outputText) {
      showStatus('保存する出力がありません');
      return;
    }

    downloadText('output.txt', state.lastBuildResult.outputText, 'text/plain;charset=utf-8');
    showStatus('出力内容を保存しました');
  }

  function downloadLog() {
    if (!state.lastBuildResult || !state.lastBuildResult.buildLogText) {
      showStatus('保存するビルドログがありません');
      return;
    }

    downloadText(state.lastBuildResult.names.buildLog, state.lastBuildResult.buildLogText, 'text/plain;charset=utf-8');
    showStatus('ビルドログを保存しました');
  }

  function downloadZip() {
    if (!state.lastBuildResult || !state.lastBuildResult.zipBytes) {
      showStatus('ZIPはまだ生成されていません');
      return;
    }

    downloadBlob(state.lastBuildResult.names.zip, state.lastBuildResult.zipBytes, 'application/zip');
    showStatus('ZIPをダウンロードしました');
  }

  async function copyTextToClipboard(text, successMessage, emptyMessage) {
    if (!text) {
      showStatus(emptyMessage);
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showStatus(successMessage);
    } catch (error) {
      showStatus('コピーに失敗しました');
      showLog(String(error && error.stack ? error.stack : error));
    }
  }

  function copyOutput() {
    copyTextToClipboard(
      state.lastBuildResult && state.lastBuildResult.outputText,
      '出力内容をコピーしました',
      'コピーする出力がありません'
    );
  }

  function copyEmbeddedLoader() {
    copyTextToClipboard(
      state.lastBuildResult && state.lastBuildResult.embeddedLoaderText,
      'embedded-loader.jsをコピーしました',
      'コピーするembedded-loader.jsがありません'
    );
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
      const names = getNames(projectName.value);
      setLabelTextByFor('embeddedLoaderOutput', names.embeddedLoaderJs);
    });
  }

  function ensureFields() {
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

    const names = getNames();
    setLabelTextByFor('embeddedLoaderOutput', names.embeddedLoaderJs);

    showOutput('まだ出力はありません。');
    showEmbeddedLoader('まだ生成されていません。');
    showStatus('準備完了');
  }

  init();
})(window);