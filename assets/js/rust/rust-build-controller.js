(function (global) {
  'use strict';

  function safeString(value, fallback = '') {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function makeId(prefix) {
    const rand = Math.random().toString(36).slice(2, 10);
    return prefix + '-' + Date.now() + '-' + rand;
  }

  function normalizeLineBreaks(text) {
    return safeString(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function trimOrEmpty(text) {
    return normalizeLineBreaks(text).trim();
  }

  function validateProjectName(name) {
    const value = trimOrEmpty(name);
    if (!value) return 'プロジェクト名が空です。';
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      return 'プロジェクト名は英数字・ハイフン・アンダースコアのみ使用できます。';
    }
    return '';
  }

  function validateVersion(version) {
    const value = trimOrEmpty(version);
    if (!value) return 'version が空です。';
    if (!/^\d+\.\d+\.\d+$/.test(value)) {
      return 'version は 0.1.0 の形式で入力してください。';
    }
    return '';
  }

  function validateEdition(edition) {
    const value = trimOrEmpty(edition);
    const allowed = ['2015', '2018', '2021', '2024'];
    if (!value) return 'edition が空です。';
    if (!allowed.includes(value)) {
      return 'edition は 2015 / 2018 / 2021 / 2024 のいずれかにしてください。';
    }
    return '';
  }

  function validateCrateType(crateType) {
    const value = trimOrEmpty(crateType);
    const allowed = ['cdylib', 'rlib', 'bin'];
    if (!value) return 'crate-type が空です。';
    if (!allowed.includes(value)) {
      return 'crate-type は cdylib / rlib / bin のいずれかにしてください。';
    }
    return '';
  }

  function validateBuildMode(buildMode) {
    const value = trimOrEmpty(buildMode);
    const allowed = ['debug', 'release'];
    if (!value) return 'ビルドモードが空です。';
    if (!allowed.includes(value)) {
      return 'ビルドモードは debug / release のいずれかにしてください。';
    }
    return '';
  }

  function validateOutputMode(outputMode) {
    const value = trimOrEmpty(outputMode);
    const allowed = ['wasm-js', 'wasm-only', 'js-only'];
    if (!value) return '出力形式が空です。';
    if (!allowed.includes(value)) {
      return '出力形式が不正です。';
    }
    return '';
  }

  function inferEntryTarget(entryPoint) {
    const value = trimOrEmpty(entryPoint).toLowerCase();
    if (value.endsWith('main.rs')) return 'main';
    return 'lib';
  }

  function normalizeDependencies(text) {
    return normalizeLineBreaks(text)
      .split('\n')
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  function normalizeFeatures(text) {
    return normalizeLineBreaks(text)
      .split('\n')
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  function pascalCase(value) {
    return safeString(value)
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join('') || 'RustProject';
  }

  function escapeHtml(text) {
    return safeString(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function collectConfig(input) {
    const source = input || {};

    return {
      buildId: makeId('rust-build'),
      timestamp: nowIso(),
      projectName: trimOrEmpty(source.projectName || 'sample-rust-project'),
      entryPoint: trimOrEmpty(source.entryPoint || 'lib.rs'),
      entryTarget: inferEntryTarget(source.entryPoint || 'lib.rs'),
      outputMode: trimOrEmpty(source.outputMode || 'wasm-js'),
      buildMode: trimOrEmpty(source.buildMode || 'release'),
      crateType: trimOrEmpty(source.crateType || 'cdylib'),
      version: trimOrEmpty(source.version || '0.1.0'),
      edition: trimOrEmpty(source.edition || '2021'),
      dependenciesText: normalizeLineBreaks(source.dependenciesText || 'wasm-bindgen = "0.2"'),
      featuresText: normalizeLineBreaks(source.featuresText || ''),
      mainRustCode: normalizeLineBreaks(source.mainRustCode || ''),
      subFiles: Array.isArray(source.subFiles) ? clone(source.subFiles) : []
    };
  }

  function validateDependenciesWithManager(config, errors, warnings) {
    if (!global.RustDependencyManager || typeof global.RustDependencyManager.validateDependencies !== 'function') {
      warnings.push('RustDependencyManager が見つからないため、依存関係検証をスキップしました。');
      return;
    }

    const dependencyResult = global.RustDependencyManager.validateDependencies(config.dependenciesText);

    if (dependencyResult && Array.isArray(dependencyResult.errors) && dependencyResult.errors.length) {
      Array.prototype.push.apply(errors, dependencyResult.errors);
    }

    if (dependencyResult && Array.isArray(dependencyResult.warnings) && dependencyResult.warnings.length) {
      Array.prototype.push.apply(warnings, dependencyResult.warnings);
    }
  }

  function validateConfig(config) {
    const errors = [];
    const warnings = [];

    const projectError = validateProjectName(config.projectName);
    if (projectError) errors.push(projectError);

    const versionError = validateVersion(config.version);
    if (versionError) errors.push(versionError);

    const editionError = validateEdition(config.edition);
    if (editionError) errors.push(editionError);

    const crateTypeError = validateCrateType(config.crateType);
    if (crateTypeError) errors.push(crateTypeError);

    const buildModeError = validateBuildMode(config.buildMode);
    if (buildModeError) errors.push(buildModeError);

    const outputModeError = validateOutputMode(config.outputMode);
    if (outputModeError) errors.push(outputModeError);

    if (!trimOrEmpty(config.entryPoint)) {
      errors.push('エントリーポイントが空です。');
    }

    if (!trimOrEmpty(config.mainRustCode)) {
      errors.push('メインRustコードが空です。');
    }

    if (trimOrEmpty(config.mainRustCode) && !config.mainRustCode.includes('fn ')) {
      warnings.push('Rustコードに関数定義が見当たりません。');
    }

    if (config.entryTarget === 'lib' && trimOrEmpty(config.mainRustCode) && !config.mainRustCode.includes('wasm_bindgen')) {
      warnings.push('lib.rs ですが wasm_bindgen の記述が見当たりません。');
    }

    normalizeDependencies(config.dependenciesText).forEach(function (line) {
      if (!line.includes('=')) {
        warnings.push('dependencies の形式を確認してください: ' + line);
      }
    });

    normalizeFeatures(config.featuresText).forEach(function (line) {
      if (!line.includes('=')) {
        warnings.push('features の形式を確認してください: ' + line);
      }
    });

    validateDependenciesWithManager(config, errors, warnings);

    return {
      errors: errors,
      warnings: warnings
    };
  }

  function buildVirtualFs(config) {
    if (!global.RustVirtualFs || typeof global.RustVirtualFs.createVirtualFs !== 'function') {
      return {
        ok: false,
        entryPath: '',
        files: {},
        errors: ['RustVirtualFs.createVirtualFs が見つかりません。'],
        warnings: []
      };
    }

    return global.RustVirtualFs.createVirtualFs(config);
  }

  function makeLoaderJs(config, ok) {
    const functionName = 'load' + pascalCase(config.projectName || 'rust-project');

    return [
      '// mock loader generated by browser-build-workshop',
      'export async function ' + functionName + '() {',
      '  return {',
      '    ok: ' + (ok ? 'true' : 'false') + ',',
      '    project: ' + JSON.stringify(config.projectName) + ',',
      '    buildId: ' + JSON.stringify(config.buildId) + ',',
      '    mode: ' + JSON.stringify(config.buildMode),
      '  };',
      '}'
    ].join('\n');
  }

  function makeMockWasm(config) {
    return [
      '; mock wasm placeholder',
      '; project=' + config.projectName,
      '; build=' + config.buildId,
      '; mode=' + config.buildMode,
      '; crate-type=' + config.crateType
    ].join('\n');
  }

  function makeMockOutputFiles(config, virtualFs, validation) {
    const files = [];
    const baseName = config.projectName || 'rust-output';
    const ok = validation.errors.length === 0;

    files.push({
      name: 'build-log.txt',
      type: 'text/plain;charset=utf-8',
      content: ''
    });

    files.push({
      name: 'Cargo.toml',
      type: 'text/plain;charset=utf-8',
      content: (virtualFs.files && virtualFs.files['/Cargo.toml']) || ''
    });

    if (config.outputMode === 'wasm-js' || config.outputMode === 'wasm-only') {
      files.push({
        name: baseName + '.wasm',
        type: 'application/wasm',
        content: makeMockWasm(config)
      });
    }

    if (config.outputMode === 'wasm-js' || config.outputMode === 'js-only') {
      files.push({
        name: baseName + '.loader.js',
        type: 'application/javascript;charset=utf-8',
        content: makeLoaderJs(config, ok)
      });
    }

    return files;
  }

  function mergeCompileResult(config, virtualFs, compileResult, validation) {
    const normalized = compileResult && typeof compileResult === 'object' ? compileResult : {};
    const files = Array.isArray(normalized.outputFiles) ? clone(normalized.outputFiles) : [];
    const errors = Array.isArray(normalized.errors) ? clone(normalized.errors) : [];
    const warnings = Array.isArray(normalized.warnings) ? clone(normalized.warnings) : [];

    if (errors.length) {
      Array.prototype.push.apply(validation.errors, errors);
    }

    if (warnings.length) {
      Array.prototype.push.apply(validation.warnings, warnings);
    }

    if (!files.length) {
      return makeMockOutputFiles(config, virtualFs, validation);
    }

    const hasBuildLog = files.some(function (file) {
      return file && file.name === 'build-log.txt';
    });

    const hasCargoToml = files.some(function (file) {
      return file && file.name === 'Cargo.toml';
    });

    if (!hasBuildLog) {
      files.unshift({
        name: 'build-log.txt',
        type: 'text/plain;charset=utf-8',
        content: ''
      });
    }

    if (!hasCargoToml) {
      files.push({
        name: 'Cargo.toml',
        type: 'text/plain;charset=utf-8',
        content: (virtualFs.files && virtualFs.files['/Cargo.toml']) || ''
      });
    }

    return files;
  }

  function runCompiler(config, virtualFs) {
    if (!global.RustRealCompiler || typeof global.RustRealCompiler.compile !== 'function') {
      return {
        ok: false,
        mode: 'mock-fallback',
        errors: [],
        warnings: ['RustRealCompiler.compile が見つからないため、疑似出力にフォールバックしました。'],
        outputFiles: []
      };
    }

    try {
      return global.RustRealCompiler.compile({
        config: clone(config),
        virtualFs: clone(virtualFs)
      });
    } catch (error) {
      return {
        ok: false,
        mode: 'compiler-exception',
        errors: [
          '本番コンパイル処理で例外が発生しました: ' + safeString(error && error.message ? error.message : error)
        ],
        warnings: [],
        outputFiles: []
      };
    }
  }

  function makeLogText(config, virtualFs, validation, compileMeta) {
    const lines = [];

    lines.push('Rustビルドを開始しました。');
    lines.push('build id: ' + config.buildId);
    lines.push('timestamp: ' + config.timestamp);
    lines.push('project: ' + config.projectName);
    lines.push('entry: ' + config.entryPoint);
    lines.push('entry target: ' + config.entryTarget);
    lines.push('build mode: ' + config.buildMode);
    lines.push('crate type: ' + config.crateType);
    lines.push('output mode: ' + config.outputMode);
    lines.push('');

    lines.push('compile mode: ' + safeString(compileMeta.mode || 'unknown'));
    lines.push('compiler connected: ' + String(!!compileMeta.connected));
    lines.push('');

    lines.push('virtual fs:');
    Object.keys(virtualFs.files || {}).sort().forEach(function (path) {
      lines.push('- ' + path);
    });

    lines.push('');

    if (validation.errors.length) {
      lines.push('errors:');
      validation.errors.forEach(function (item) {
        lines.push('- ' + item);
      });
    } else {
      lines.push('errors:');
      lines.push('- なし');
    }

    lines.push('');

    if (validation.warnings.length) {
      lines.push('warnings:');
      validation.warnings.forEach(function (item) {
        lines.push('- ' + item);
      });
    } else {
      lines.push('warnings:');
      lines.push('- なし');
    }

    return lines.join('\n');
  }

  function makeReadableOutput(config, virtualFs, validation, outputFiles, compileMeta) {
    const lines = [];

    lines.push('// Rust build result');
    lines.push('// build id: ' + config.buildId);
    lines.push('// project: ' + config.projectName);
    lines.push('// entry: ' + config.entryPoint);
    lines.push('// build mode: ' + config.buildMode);
    lines.push('// crate type: ' + config.crateType);
    lines.push('// output mode: ' + config.outputMode);
    lines.push('// compile mode: ' + safeString(compileMeta.mode || 'unknown'));
    lines.push('// compiler connected: ' + String(!!compileMeta.connected));
    lines.push('// status: ' + (validation.errors.length ? 'error' : 'success'));
    lines.push('');

    lines.push('// generated files');
    outputFiles.forEach(function (file) {
      lines.push('// - ' + file.name);
    });

    lines.push('');
    lines.push('// Cargo.toml');
    lines.push((virtualFs.files && virtualFs.files['/Cargo.toml']) || '');

    Object.keys(virtualFs.files || {})
      .sort()
      .filter(function (path) {
        return path !== '/Cargo.toml';
      })
      .forEach(function (path) {
        lines.push('');
        lines.push('// file: ' + path);
        lines.push(virtualFs.files[path]);
      });

    if (validation.errors.length) {
      lines.push('');
      lines.push('// errors');
      validation.errors.forEach(function (item) {
        lines.push('// - ' + item);
      });
    }

    if (validation.warnings.length) {
      lines.push('');
      lines.push('// warnings');
      validation.warnings.forEach(function (item) {
        lines.push('// - ' + item);
      });
    }

    return lines.join('\n');
  }

  function buildSummaryHtml(config, validation, outputFiles, virtualFs, compileMeta) {
    function makeList(items) {
      if (!items.length) return '<p>なし</p>';
      return '<ul>' + items.map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join('') + '</ul>';
    }

    const paths = Object.keys(virtualFs.files || {}).sort();

    return [
      '<div class="rust-build-summary">',
      '<p><strong>ビルドID:</strong> ' + escapeHtml(config.buildId) + '</p>',
      '<p><strong>状態:</strong> ' + escapeHtml(validation.errors.length ? 'error' : 'success') + '</p>',
      '<p><strong>プロジェクト:</strong> ' + escapeHtml(config.projectName) + '</p>',
      '<p><strong>entry:</strong> ' + escapeHtml(config.entryPoint) + '</p>',
      '<p><strong>crate-type:</strong> ' + escapeHtml(config.crateType) + '</p>',
      '<p><strong>build-mode:</strong> ' + escapeHtml(config.buildMode) + '</p>',
      '<p><strong>output-mode:</strong> ' + escapeHtml(config.outputMode) + '</p>',
      '<p><strong>compile-mode:</strong> ' + escapeHtml(safeString(compileMeta.mode || 'unknown')) + '</p>',
      '<p><strong>compiler-connected:</strong> ' + escapeHtml(String(!!compileMeta.connected)) + '</p>',
      '<h4>仮想FS</h4>',
      makeList(paths),
      '<h4>エラー</h4>',
      makeList(validation.errors),
      '<h4>警告</h4>',
      makeList(validation.warnings),
      '<h4>生成ファイル</h4>',
      makeList(outputFiles.map(function (file) { return file.name; })),
      '</div>'
    ].join('');
  }

  function runBuild(input) {
    const config = collectConfig(input);
    const validation = validateConfig(config);
    const virtualFs = buildVirtualFs(config);

    Array.prototype.push.apply(validation.errors, virtualFs.errors || []);
    Array.prototype.push.apply(validation.warnings, virtualFs.warnings || []);

    const compileResult = runCompiler(config, virtualFs);
    const compileMeta = {
      connected: !!(global.RustRealCompiler && typeof global.RustRealCompiler.compile === 'function'),
      mode: safeString(compileResult.mode || 'unknown')
    };

    const outputFiles = mergeCompileResult(config, virtualFs, compileResult, validation);
    const logText = makeLogText(config, virtualFs, validation, compileMeta);

    for (var i = 0; i < outputFiles.length; i += 1) {
      if (outputFiles[i] && outputFiles[i].name === 'build-log.txt') {
        outputFiles[i].content = logText;
      }
    }

    const outputText = makeReadableOutput(config, virtualFs, validation, outputFiles, compileMeta);
    const summaryHtml = buildSummaryHtml(config, validation, outputFiles, virtualFs, compileMeta);

    return {
      ok: validation.errors.length === 0,
      buildId: config.buildId,
      timestamp: config.timestamp,
      status: validation.errors.length === 0 ? 'success' : 'error',
      config: clone(config),
      virtualFs: clone(virtualFs),
      errors: clone(validation.errors),
      warnings: clone(validation.warnings),
      outputFiles: clone(outputFiles),
      logText: logText,
      outputText: outputText,
      summaryHtml: summaryHtml,
      compileMeta: clone(compileMeta)
    };
  }

  global.RustBuildController = {
    collectConfig: collectConfig,
    validateConfig: validateConfig,
    runBuild: runBuild,
    runCompiler: runCompiler
  };
})(window);