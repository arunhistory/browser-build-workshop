(function (global) {
  'use strict';

  const COMPILER_NAME = 'RustWasmCompiler';

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

  function normalizeEntryPoint(raw) {
    const value = trimOrEmpty(raw || 'src/lib.rs') || 'src/lib.rs';

    if (value === 'lib.rs') return 'src/lib.rs';
    if (value === 'main.rs') return 'src/main.rs';
    if (value.startsWith('/')) return value.slice(1);
    if (value.startsWith('src/')) return value;

    return 'src/' + value;
  }

  function normalizeOutputMode(raw) {
    const value = trimOrEmpty(raw || 'wasm-js').toLowerCase();

    if (value === 'wasm-only') return 'wasm-only';
    if (value === 'js-only') return 'js-only';

    return 'wasm-js';
  }

  function normalizeBuildMode(raw) {
    const value = trimOrEmpty(raw || 'release').toLowerCase();

    if (value === 'debug') return 'debug';

    return 'release';
  }

  function normalizeEdition(raw) {
    const value = trimOrEmpty(raw || '2021');

    if (value === '2015') return '2015';
    if (value === '2018') return '2018';
    if (value === '2021') return '2021';
    if (value === '2024') return '2024';

    return '2021';
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

    if (value === 'cdylib') return 'cdylib';
    if (value === 'rlib') return 'rlib';
    if (value === 'staticlib') return 'staticlib';
    if (value === 'dylib') return 'dylib';

    return 'cdylib';
  }

  function normalizeSubFilePath(raw) {
    const value = trimOrEmpty(raw).replace(/\\/g, '/').replace(/^\/+/, '');

    if (!value) return '';
    if (value.includes('..')) return '';

    if (value.startsWith('src/')) return value;

    return 'src/' + value;
  }

  function normalizeSubFiles(rawSubFiles) {
    if (!rawSubFiles) return [];

    if (Array.isArray(rawSubFiles)) {
      return rawSubFiles
        .filter(function (file) {
          return file && typeof file === 'object';
        })
        .map(function (file, index) {
          return {
            name: normalizeSubFilePath(file.name || file.path || 'sub-' + String(index) + '.rs'),
            content: normalizeLineBreaks(file.content || '')
          };
        })
        .filter(function (file) {
          return !!file.name;
        });
    }

    if (typeof rawSubFiles === 'object') {
      return Object.keys(rawSubFiles)
        .map(function (name) {
          return {
            name: normalizeSubFilePath(name),
            content: normalizeLineBreaks(rawSubFiles[name] || '')
          };
        })
        .filter(function (file) {
          return !!file.name;
        });
    }

    return [];
  }

  function collectCompilerInput(input) {
    const source = input && typeof input === 'object' ? input : {};
    const projectName = normalizeProjectName(source.projectName || 'sample-rust-project');
    const entryPoint = normalizeEntryPoint(source.entryPoint || source.entryType || 'src/lib.rs');

    return {
      buildId: trimOrEmpty(source.buildId || 'rust-build-' + Date.now()),
      projectName: projectName,
      version: trimOrEmpty(source.version || '0.1.0') || '0.1.0',
      edition: normalizeEdition(source.edition || '2021'),
      entryPoint: entryPoint,
      entryTarget: inferEntryTarget(entryPoint),
      outputMode: normalizeOutputMode(source.outputMode || 'wasm-js'),
      buildMode: normalizeBuildMode(source.buildMode || 'release'),
      crateType: normalizeCrateType(source.crateType || 'cdylib', entryPoint),
      dependenciesText: normalizeLineBreaks(source.dependenciesText || ''),
      featuresText: normalizeLineBreaks(source.featuresText || ''),
      cargoTomlText: normalizeLineBreaks(source.cargoTomlText || source.cargoToml || ''),
      mainRustCode: normalizeLineBreaks(source.mainRustCode || ''),
      subFiles: normalizeSubFiles(source.subFiles),
      flags: source.flags && typeof source.flags === 'object' ? source.flags : {}
    };
  }

  function validateCompilerInput(input) {
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

    if (!trimOrEmpty(input.mainRustCode)) {
      errors.push('メインRustコードが空です。');
    }

    if (input.entryTarget === 'main') {
      warnings.push('main.rs は bin 扱いです。wasmライブラリ化したい場合は lib.rs を使ってください。');
    }

    if (input.outputMode === 'js-only') {
      warnings.push('js-only は .wasm を出力しません。wasm生成には wasm-js または wasm-only を使ってください。');
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }

  function uint8ArrayToBase64(bytes) {
    if (!bytes) return '';

    let uint8;

    if (bytes instanceof Uint8Array) {
      uint8 = bytes;
    } else if (bytes instanceof ArrayBuffer) {
      uint8 = new Uint8Array(bytes);
    } else if (Array.isArray(bytes)) {
      uint8 = new Uint8Array(bytes);
    } else {
      return '';
    }

    let binary = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < uint8.length; i += chunkSize) {
      const chunk = uint8.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }

    return btoa(binary);
  }

  function base64ToUint8Array(base64) {
    const clean = trimOrEmpty(base64);

    if (!clean) return new Uint8Array();

    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
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

  function makeCargoToml(input) {
    if (trimOrEmpty(input.cargoTomlText)) {
      return normalizeLineBreaks(input.cargoTomlText);
    }

    const lines = [];

    lines.push('[package]');
    lines.push('name = "' + input.projectName + '"');
    lines.push('version = "' + input.version + '"');
    lines.push('edition = "' + input.edition + '"');
    lines.push('');

    if (input.entryTarget === 'lib') {
      lines.push('[lib]');
      lines.push('crate-type = ["' + input.crateType + '"]');
      lines.push('');
    }

    lines.push('[dependencies]');

    if (trimOrEmpty(input.dependenciesText)) {
      lines.push(trimOrEmpty(input.dependenciesText));
    }

    lines.push('');

    if (trimOrEmpty(input.featuresText)) {
      lines.push('[features]');
      lines.push(trimOrEmpty(input.featuresText));
      lines.push('');
    }

    return lines.join('\n').trim() + '\n';
  }

  function createVirtualProject(input) {
    const files = {};

    files['Cargo.toml'] = makeCargoToml(input);
    files[input.entryPoint] = input.mainRustCode;

    input.subFiles.forEach(function (file) {
      if (!file.name || file.name === input.entryPoint) return;

      files[file.name] = file.content;
    });

    return {
      buildId: input.buildId,
      projectName: input.projectName,
      entryPoint: input.entryPoint,
      files: files
    };
  }

  function findAvailableCompiler() {
    const candidates = [
      global.OrikuroRustVirtualCompiler,
      global.OrikuroRustCompiler,
      global.RustVirtualCompiler,
      global.RustBrowserCompiler,
      global.RustBuildEngine,
      global.RustBuildModuleManager,
      global.RustRealCompiler
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];

      if (!candidate || typeof candidate !== 'object') continue;

      if (typeof candidate.compile === 'function') {
        return {
          name: candidate.name || 'compile',
          target: candidate,
          method: 'compile'
        };
      }

      if (typeof candidate.build === 'function') {
        return {
          name: candidate.name || 'build',
          target: candidate,
          method: 'build'
        };
      }

      if (typeof candidate.run === 'function') {
        return {
          name: candidate.name || 'run',
          target: candidate,
          method: 'run'
        };
      }

      if (typeof candidate.runBuild === 'function') {
        return {
          name: candidate.name || 'runBuild',
          target: candidate,
          method: 'runBuild'
        };
      }
    }

    return null;
  }

  async function callCompiler(compiler, payload) {
    const result = compiler.target[compiler.method](payload);

    if (result && typeof result.then === 'function') {
      return await result;
    }

    return result;
  }

  function extractFileFromResult(result, matcher) {
    if (!result || typeof result !== 'object') return null;

    const files = [];

    if (Array.isArray(result.files)) {
      files.push.apply(files, result.files);
    }

    if (Array.isArray(result.outputFiles)) {
      files.push.apply(files, result.outputFiles);
    }

    if (Array.isArray(result.artifacts)) {
      files.push.apply(files, result.artifacts);
    }

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];

      if (!file || typeof file !== 'object') continue;

      const name = safeString(file.name || file.path || file.fileName, '');

      if (matcher(name, file)) {
        return file;
      }
    }

    return null;
  }

  function normalizeCompilerResult(input, validation, rawResult) {
    if (!rawResult || typeof rawResult !== 'object') {
      throw new Error('仮想Rustコンパイラの戻り値が不正です。結果オブジェクトが必要です。');
    }

    if (rawResult.ok === false) {
      const message =
        rawResult.message ||
        rawResult.error ||
        rawResult.logText ||
        '仮想Rustコンパイルに失敗しました。';

      return {
        ok: false,
        input: input,
        buildRequest: createBuildRequest(input),
        errors: validation.errors.concat([safeString(message)]),
        warnings: validation.warnings,
        logText: safeString(rawResult.logText || message),
        outputText: safeString(rawResult.outputText || ''),
        rawResult: rawResult
      };
    }

    let wasmBytes = null;
    let wasmBase64 = '';

    if (rawResult.wasmBytes instanceof Uint8Array) {
      wasmBytes = rawResult.wasmBytes;
      wasmBase64 = uint8ArrayToBase64(wasmBytes);
    } else if (rawResult.wasmBytes instanceof ArrayBuffer) {
      wasmBytes = new Uint8Array(rawResult.wasmBytes);
      wasmBase64 = uint8ArrayToBase64(wasmBytes);
    } else if (Array.isArray(rawResult.wasmBytes)) {
      wasmBytes = new Uint8Array(rawResult.wasmBytes);
      wasmBase64 = uint8ArrayToBase64(wasmBytes);
    } else if (rawResult.wasmBinary instanceof Uint8Array) {
      wasmBytes = rawResult.wasmBinary;
      wasmBase64 = uint8ArrayToBase64(wasmBytes);
    } else if (typeof rawResult.wasmBase64 === 'string') {
      wasmBase64 = trimOrEmpty(rawResult.wasmBase64);
      wasmBytes = base64ToUint8Array(wasmBase64);
    }

    if (!wasmBytes || !wasmBytes.length) {
      const wasmFile = extractFileFromResult(rawResult, function (name) {
        return name.endsWith('.wasm') || name.endsWith('.wasm-base64.txt') || name.endsWith('.base64');
      });

      if (wasmFile) {
        if (wasmFile.content instanceof Uint8Array) {
          wasmBytes = wasmFile.content;
          wasmBase64 = uint8ArrayToBase64(wasmBytes);
        } else if (wasmFile.content instanceof ArrayBuffer) {
          wasmBytes = new Uint8Array(wasmFile.content);
          wasmBase64 = uint8ArrayToBase64(wasmBytes);
        } else if (Array.isArray(wasmFile.content)) {
          wasmBytes = new Uint8Array(wasmFile.content);
          wasmBase64 = uint8ArrayToBase64(wasmBytes);
        } else if (typeof wasmFile.content === 'string') {
          wasmBase64 = trimOrEmpty(wasmFile.content);
          wasmBytes = base64ToUint8Array(wasmBase64);
        }
      }
    }

    if (!wasmBytes || !wasmBytes.length) {
      throw new Error(
        [
          '仮想Rustコンパイラから .wasm が返りませんでした。',
          '必要な戻り値は wasmBytes または wasmBase64 です。',
          'このファイルは接続口なので、実際のRust→Wasm変換エンジン側が .wasm を返す必要があります。'
        ].join('\n')
      );
    }

    const bindgenJsFile = extractFileFromResult(rawResult, function (name) {
      return name.endsWith('.bindgen.js') || name.endsWith('_bg.js') || name.endsWith('.js');
    });

    const bindgenJsText =
      typeof rawResult.bindgenJsText === 'string'
        ? rawResult.bindgenJsText
        : bindgenJsFile && typeof bindgenJsFile.content === 'string'
          ? bindgenJsFile.content
          : '';

    return {
      ok: true,
      input: input,
      buildRequest: createBuildRequest(input),
      wasmBytes: wasmBytes,
      wasmBase64: wasmBase64,
      bindgenJsText: bindgenJsText,
      rawResult: rawResult,
      errors: validation.errors,
      warnings: validation.warnings,
      logText: safeString(rawResult.logText || rawResult.buildLog || '仮想Rustコンパイルが完了しました。'),
      outputText: safeString(rawResult.outputText || rawResult.summaryText || 'Wasm生成完了')
    };
  }

  async function compile(input) {
    const normalizedInput = collectCompilerInput(input);
    const validation = validateCompilerInput(normalizedInput);

    if (!validation.ok) {
      return {
        ok: false,
        input: normalizedInput,
        buildRequest: createBuildRequest(normalizedInput),
        errors: validation.errors,
        warnings: validation.warnings,
        logText: [
          'Rust Wasm コンパイル前の入力検証で停止しました。',
          '',
          'errors:',
          validation.errors.length ? '- ' + validation.errors.join('\n- ') : '- なし',
          '',
          'warnings:',
          validation.warnings.length ? '- ' + validation.warnings.join('\n- ') : '- なし'
        ].join('\n'),
        outputText: ''
      };
    }

    const compiler = findAvailableCompiler();

    if (!compiler) {
      throw new Error(
        [
          'Rust → Wasm の仮想コンパイラが見つかりません。',
          '',
          '必要:',
          '- global.OrikuroRustVirtualCompiler.compile(payload)',
          'または',
          '- global.RustVirtualCompiler.compile(payload)',
          'または',
          '- global.RustBuildEngine.build(payload)',
          '',
          'このファイルはページと仮想ビルド空間を繋ぐ接続口です。',
          '実際の .wasm 生成エンジンを先に読み込ませてください。'
        ].join('\n')
      );
    }

    const virtualProject = createVirtualProject(normalizedInput);

    const payload = {
      input: normalizedInput,
      config: normalizedInput,
      project: virtualProject,
      files: virtualProject.files,
      buildRequest: createBuildRequest(normalizedInput)
    };

    const rawResult = await callCompiler(compiler, payload);

    return normalizeCompilerResult(normalizedInput, validation, rawResult);
  }

  global[COMPILER_NAME] = {
    compile: compile,
    createBuildRequest: createBuildRequest,
    createVirtualProject: createVirtualProject,
    normalizeProjectName: normalizeProjectName,
    uint8ArrayToBase64: uint8ArrayToBase64,
    base64ToUint8Array: base64ToUint8Array
  };
})(window);