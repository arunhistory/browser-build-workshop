(function (global) {
  'use strict';

  const RustWasmCompiler = {
    compile: compile
  };

  function safeString(value, fallback) {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return fallback || '';
    return String(value);
  }

  function normalizeLineBreaks(text) {
    return safeString(text, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function trimOrEmpty(text) {
    return normalizeLineBreaks(text).trim();
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

  function normalizeWasmBytes(value) {
    if (value instanceof Uint8Array) {
      return value;
    }

    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }

    if (Array.isArray(value)) {
      return new Uint8Array(value);
    }

    if (typeof value === 'string') {
      return base64ToBytes(value);
    }

    throw new Error('コンパイラ結果に .wasm 本体がありません。wasmBytes / wasm / wasmBase64 のいずれかが必要です。');
  }

  function makeBuildRequest(input) {
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

  function makeDefaultLoaderJs(input, wasmFileName) {
    const functionName = makeLoadFunctionName(input.projectName);

    return [
      '// Rust Wasm loader',
      '// build id: ' + input.buildId,
      '// project: ' + input.projectName,
      '',
      'export async function ' + functionName + '(imports = {}) {',
      '  const wasmUrl = new URL("./' + wasmFileName + '", import.meta.url);',
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

  function normalizeCompilerResult(input, rawResult) {
    if (!rawResult || typeof rawResult !== 'object') {
      throw new Error('Rustコンパイラから結果オブジェクトが返っていません。');
    }

    const projectName = normalizeProjectName(input.projectName);
    const wasmFileName = projectName + '.wasm';

    const wasmBytes = normalizeWasmBytes(
      rawResult.wasmBytes ||
      rawResult.wasm ||
      rawResult.wasmBase64
    );

    const wasmBase64 = rawResult.wasmBase64 || bytesToBase64(wasmBytes);

    const loaderJsText =
      rawResult.loaderJsText ||
      rawResult.loaderJs ||
      makeDefaultLoaderJs(input, wasmFileName);

    const logText = [
      'Rust compiler bridge result',
      '',
      'status: success',
      'buildId: ' + input.buildId,
      'projectName: ' + input.projectName,
      'wasmBytes: ' + String(wasmBytes.length),
      '',
      rawResult.logText || rawResult.buildLog || ''
    ].join('\n');

    return {
      ok: true,
      wasmBytes: wasmBytes,
      wasmBase64: wasmBase64,
      loaderJsText: loaderJsText,
      logText: logText,
      rawResult: rawResult
    };
  }

  async function callConnectedCompiler(input) {
    if (
      global.OrikuroRustCompilerCore &&
      typeof global.OrikuroRustCompilerCore.compileRustToWasm === 'function'
    ) {
      return await global.OrikuroRustCompilerCore.compileRustToWasm({
        input: input,
        buildRequest: makeBuildRequest(input)
      });
    }

    if (
      global.OrikuroRustCompilerCore &&
      typeof global.OrikuroRustCompilerCore.compile === 'function'
    ) {
      return await global.OrikuroRustCompilerCore.compile({
        input: input,
        buildRequest: makeBuildRequest(input)
      });
    }

    if (typeof global.__orikuroRustCompile === 'function') {
      return await global.__orikuroRustCompile({
        input: input,
        buildRequest: makeBuildRequest(input)
      });
    }

    if (
      global.RustCompilerCore &&
      typeof global.RustCompilerCore.compile === 'function'
    ) {
      return await global.RustCompilerCore.compile({
        input: input,
        buildRequest: makeBuildRequest(input)
      });
    }

    throw new Error(
      [
        'Rust→Wasm本物コンパイラが未接続です。',
        '',
        '必要な接続先のどれかを用意してください:',
        '- window.OrikuroRustCompilerCore.compileRustToWasm(payload)',
        '- window.OrikuroRustCompilerCore.compile(payload)',
        '- window.__orikuroRustCompile(payload)',
        '- window.RustCompilerCore.compile(payload)',
        '',
        'このファイルは偽物のWasmを生成しません。',
        '本物のRust→Wasm変換エンジンから wasmBytes / wasm / wasmBase64 を受け取り、',
        'ページ側へ渡すための接続口です。'
      ].join('\n')
    );
  }

  async function compile(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('compile(input) の input が不正です。');
    }

    if (!trimOrEmpty(input.mainRustCode)) {
      throw new Error('mainRustCode が空です。');
    }

    const normalizedInput = {
      buildId: trimOrEmpty(input.buildId || 'rust-build-' + Date.now()),
      projectName: normalizeProjectName(input.projectName),
      version: trimOrEmpty(input.version || '0.1.0') || '0.1.0',
      edition: trimOrEmpty(input.edition || '2021') || '2021',
      entryPoint: trimOrEmpty(input.entryPoint || 'src/lib.rs') || 'src/lib.rs',
      outputMode: trimOrEmpty(input.outputMode || 'wasm-js') || 'wasm-js',
      buildMode: trimOrEmpty(input.buildMode || 'release') || 'release',
      crateType: trimOrEmpty(input.crateType || 'cdylib') || 'cdylib',
      dependenciesText: normalizeLineBreaks(input.dependenciesText || ''),
      featuresText: normalizeLineBreaks(input.featuresText || ''),
      cargoTomlText: normalizeLineBreaks(input.cargoTomlText || ''),
      mainRustCode: normalizeLineBreaks(input.mainRustCode || ''),
      subFiles: Array.isArray(input.subFiles) ? input.subFiles : [],
      flags: input.flags || {}
    };

    const rawResult = await callConnectedCompiler(normalizedInput);
    return normalizeCompilerResult(normalizedInput, rawResult);
  }

  global.RustWasmCompiler = RustWasmCompiler;
})(window);