(function (global) {
  'use strict';

  const MODULE_NAME = 'RustRealCompiler';
  const MODULE_VERSION = '0.1.2';

  function safeString(value, fallback = '') {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  function normalizeLineBreaks(text) {
    return safeString(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function trimOrEmpty(text) {
    return normalizeLineBreaks(text).trim();
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

  function escapeHtml(text) {
    return safeString(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function inferEntryTarget(entryPoint) {
    const value = trimOrEmpty(entryPoint).toLowerCase();
    if (value.endsWith('main.rs')) return 'main';
    return 'lib';
  }

  function normalizeEntryPath(entryPoint) {
    const raw = trimOrEmpty(entryPoint || 'lib.rs') || 'lib.rs';
    if (raw.startsWith('/')) return raw;
    if (raw.startsWith('src/')) return '/' + raw;
    return '/src/' + raw;
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

  function unwrapCompileInput(input) {
    if (
      input &&
      typeof input === 'object' &&
      input.config &&
      typeof input.config === 'object'
    ) {
      return {
        source: input.config,
        incomingVirtualFs: input.virtualFs && typeof input.virtualFs === 'object' ? input.virtualFs : null
      };
    }

    return {
      source: input || {},
      incomingVirtualFs: input && input.virtualFs && typeof input.virtualFs === 'object' ? input.virtualFs : null
    };
  }

  function buildCargoToml(config) {
    const lines = [];

    lines.push('[package]');
    lines.push('name = "' + config.projectName + '"');
    lines.push('version = "' + config.version + '"');
    lines.push('edition = "' + config.edition + '"');
    lines.push('');

    if (config.entryTarget === 'lib') {
      lines.push('[lib]');
      lines.push('crate-type = ["' + config.crateType + '"]');
      lines.push('');
    }

    if (config.entryTarget === 'main') {
      lines.push('[[bin]]');
      lines.push('name = "' + config.projectName + '"');
      lines.push('path = "src/main.rs"');
      lines.push('');
    }

    const dependencies = normalizeDependencies(config.dependenciesText);
    if (dependencies.length) {
      lines.push('[dependencies]');
      dependencies.forEach(function (line) {
        lines.push(line);
      });
      lines.push('');
    }

    const features = normalizeFeatures(config.featuresText);
    if (features.length) {
      lines.push('[features]');
      features.forEach(function (line) {
        lines.push(line);
      });
      lines.push('');
    }

    return lines.join('\n').trim() + '\n';
  }

  function buildVirtualFs(config) {
    const files = {};
    const entryPath = normalizeEntryPath(config.entryPoint);

    files['/Cargo.toml'] = buildCargoToml(config);
    files[entryPath] = normalizeLineBreaks(config.mainRustCode || '');

    toArray(config.subFiles).forEach(function (file) {
      if (!file || typeof file !== 'object') return;

      const name = trimOrEmpty(file.name || '');
      if (!name) return;

      let filePath = name;
      if (!filePath.startsWith('/')) {
        if (filePath.startsWith('src/')) {
          filePath = '/' + filePath;
        } else {
          filePath = '/src/' + filePath;
        }
      }

      files[filePath] = normalizeLineBreaks(file.content || '');
    });

    return {
      ok: true,
      entryPath: entryPath,
      files: files,
      errors: [],
      warnings: []
    };
  }

  function normalizeVirtualFsShape(virtualFs) {
    if (!virtualFs || typeof virtualFs !== 'object') {
      return {
        ok: false,
        entryPath: '',
        files: {},
        errors: ['virtualFs が不正です。'],
        warnings: []
      };
    }

    return {
      ok: typeof virtualFs.ok === 'boolean' ? virtualFs.ok : true,
      entryPath: safeString(virtualFs.entryPath || ''),
      files: virtualFs.files && typeof virtualFs.files === 'object' ? clone(virtualFs.files) : {},
      errors: Array.isArray(virtualFs.errors) ? clone(virtualFs.errors) : [],
      warnings: Array.isArray(virtualFs.warnings) ? clone(virtualFs.warnings) : []
    };
  }

  function collectConfig(input) {
    const unwrapped = unwrapCompileInput(input);
    const source = unwrapped.source || {};
    const entryPoint = trimOrEmpty(source.entryPoint || 'lib.rs') || 'lib.rs';
    const entryTarget = inferEntryTarget(entryPoint);
    let crateType = trimOrEmpty(source.crateType || 'cdylib') || 'cdylib';

    if (entryTarget === 'main' && crateType === 'cdylib') {
      crateType = 'bin';
    }

    return {
      buildId: safeString(source.buildId || makeId('rust-real-build')),
      timestamp: safeString(source.timestamp || nowIso()),
      projectName: trimOrEmpty(source.projectName || 'sample-rust-project') || 'sample-rust-project',
      version: trimOrEmpty(source.version || '0.1.0') || '0.1.0',
      edition: trimOrEmpty(source.edition || '2021') || '2021',
      entryPoint: entryPoint,
      entryTarget: entryTarget,
      crateType: crateType,
      buildMode: trimOrEmpty(source.buildMode || 'release') || 'release',
      outputMode: trimOrEmpty(source.outputMode || 'wasm-js') || 'wasm-js',
      dependenciesText: normalizeLineBreaks(source.dependenciesText || ''),
      featuresText: normalizeLineBreaks(source.featuresText || ''),
      mainRustCode: normalizeLineBreaks(source.mainRustCode || ''),
      subFiles: toArray(source.subFiles).map(function (file, index) {
        return {
          id: safeString((file && file.id) || ('sub-' + index)),
          name: safeString((file && file.name) || '').trim(),
          content: normalizeLineBreaks((file && file.content) || '')
        };
      }),
      compileMode: trimOrEmpty(source.compileMode || 'real') || 'real'
    };
  }

  function validateCompileRequest(config) {
    const errors = [];
    const warnings = [];

    if (!trimOrEmpty(config.projectName)) {
      errors.push('プロジェクト名が空です。');
    }

    if (!trimOrEmpty(config.entryPoint)) {
      errors.push('エントリーポイントが空です。');
    }

    if (!trimOrEmpty(config.mainRustCode)) {
      errors.push('メインRustコードが空です。');
    }

    if (!/^\d+\.\d+\.\d+$/.test(trimOrEmpty(config.version))) {
      errors.push('version は 0.1.0 の形式で入力してください。');
    }

    if (!['2015', '2018', '2021', '2024'].includes(trimOrEmpty(config.edition))) {
      errors.push('edition は 2015 / 2018 / 2021 / 2024 のいずれかにしてください。');
    }

    if (!['debug', 'release'].includes(trimOrEmpty(config.buildMode))) {
      errors.push('ビルドモードは debug / release のいずれかにしてください。');
    }

    if (!['cdylib', 'rlib', 'bin'].includes(trimOrEmpty(config.crateType))) {
      errors.push('crate-type は cdylib / rlib / bin のいずれかにしてください。');
    }

    if (!['wasm-js', 'wasm-only', 'js-only'].includes(trimOrEmpty(config.outputMode))) {
      errors.push('出力形式が不正です。');
    }

    if (config.entryTarget === 'lib' && config.crateType === 'bin') {
      errors.push('lib.rs で crate-type bin は使えません。');
    }

    if (config.entryTarget === 'main' && config.crateType !== 'bin') {
      warnings.push('main.rs のため crate-type は bin 扱いが推奨です。');
    }

    return {
      errors: errors,
      warnings: warnings
    };
  }

  function resolveDependencyCheck(config) {
    const errors = [];
    const warnings = [];

    if (!global.RustDependencyManager || typeof global.RustDependencyManager.validateDependencies !== 'function') {
      warnings.push('RustDependencyManager が見つからないため、依存関係検証を簡略化しました。');
      return {
        errors: errors,
        warnings: warnings
      };
    }

    const result = global.RustDependencyManager.validateDependencies(config.dependenciesText);
    if (result && Array.isArray(result.errors) && result.errors.length) {
      Array.prototype.push.apply(errors, result.errors);
    }
    if (result && Array.isArray(result.warnings) && result.warnings.length) {
      Array.prototype.push.apply(warnings, result.warnings);
    }

    return {
      errors: errors,
      warnings: warnings
    };
  }

  function chooseArtifactNames(config) {
    const baseName = config.projectName || 'rust-output';
    const names = ['build-log.txt', 'Cargo.toml'];

    if (config.outputMode === 'wasm-js' || config.outputMode === 'wasm-only') {
      names.push(baseName + '.wasm');
    }

    if (config.outputMode === 'wasm-js' || config.outputMode === 'js-only') {
      names.push(baseName + '.loader.js');
      names.push(baseName + '.example.js');
    }

    return names;
  }

  function makeLoaderJs(config, compileOk) {
    const functionName = 'load' + pascalCase(config.projectName || 'RustProject');

    return [
      '// real compile bridge loader',
      '// module: ' + MODULE_NAME,
      '// version: ' + MODULE_VERSION,
      '// build id: ' + config.buildId,
      'export async function ' + functionName + '() {',
      '  return {',
      '    ok: ' + (compileOk ? 'true' : 'false') + ',',
      '    mode: ' + JSON.stringify(config.buildMode) + ',',
      '    project: ' + JSON.stringify(config.projectName) + ',',
      '    buildId: ' + JSON.stringify(config.buildId),
      '  };',
      '}'
    ].join('\n');
  }

  function makeExampleJs(config) {
    const loaderFunctionName = 'load' + pascalCase(config.projectName || 'RustProject');
    const loaderFileName = './' + config.projectName + '.loader.js';

    return [
      '// example usage',
      '// project: ' + config.projectName,
      "import { " + loaderFunctionName + " } from '" + loaderFileName + "';",
      '',
      'async function runExample() {',
      '  const mod = await ' + loaderFunctionName + '();',
      '  console.log("loaded module:", mod);',
      '}',
      '',
      'runExample().catch(console.error);'
    ].join('\n');
  }

  function makeReadableBundle(config, virtualFs, artifacts, compileResult) {
    const lines = [];

    lines.push('// Real compile output');
    lines.push('// module: ' + MODULE_NAME);
    lines.push('// version: ' + MODULE_VERSION);
    lines.push('// build id: ' + config.buildId);
    lines.push('// timestamp: ' + config.timestamp);
    lines.push('// project: ' + config.projectName);
    lines.push('// entry: ' + config.entryPoint);
    lines.push('// entry target: ' + config.entryTarget);
    lines.push('// build mode: ' + config.buildMode);
    lines.push('// crate type: ' + config.crateType);
    lines.push('// output mode: ' + config.outputMode);
    lines.push('// compile mode: ' + safeString(compileResult.mode || 'real'));
    lines.push('// status: ' + (compileResult.ok ? 'success' : 'error'));
    lines.push('');

    lines.push('// virtual fs');
    Object.keys(virtualFs.files || {}).sort().forEach(function (path) {
      lines.push('// - ' + path);
    });

    lines.push('');
    lines.push('// generated files');
    artifacts.forEach(function (file) {
      lines.push('// - ' + file.name);
    });

    lines.push('');
    lines.push('// Cargo.toml');
    lines.push(virtualFs.files['/Cargo.toml'] || '');

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

    if (compileResult.errors.length) {
      lines.push('');
      lines.push('// errors');
      compileResult.errors.forEach(function (item) {
        lines.push('// - ' + item);
      });
    }

    if (compileResult.warnings.length) {
      lines.push('');
      lines.push('// warnings');
      compileResult.warnings.forEach(function (item) {
        lines.push('// - ' + item);
      });
    }

    return lines.join('\n');
  }

  function makeSummaryHtml(config, result, artifacts) {
    function makeList(items) {
      if (!items.length) return '<p>なし</p>';
      return '<ul>' + items.map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join('') + '</ul>';
    }

    return [
      '<div class="rust-real-compile-summary">',
      '<p><strong>モジュール:</strong> ' + escapeHtml(MODULE_NAME) + '</p>',
      '<p><strong>バージョン:</strong> ' + escapeHtml(MODULE_VERSION) + '</p>',
      '<p><strong>ビルドID:</strong> ' + escapeHtml(config.buildId) + '</p>',
      '<p><strong>状態:</strong> ' + escapeHtml(result.status) + '</p>',
      '<p><strong>compile-mode:</strong> ' + escapeHtml(safeString(result.mode || 'real')) + '</p>',
      '<p><strong>プロジェクト:</strong> ' + escapeHtml(config.projectName) + '</p>',
      '<p><strong>entry:</strong> ' + escapeHtml(config.entryPoint) + '</p>',
      '<p><strong>build-mode:</strong> ' + escapeHtml(config.buildMode) + '</p>',
      '<p><strong>output-mode:</strong> ' + escapeHtml(config.outputMode) + '</p>',
      '<h4>エラー</h4>',
      makeList(result.errors),
      '<h4>警告</h4>',
      makeList(result.warnings),
      '<h4>生成ファイル</h4>',
      makeList(artifacts.map(function (file) { return file.name; })),
      '</div>'
    ].join('');
  }

  function makeLogText(config, virtualFs, result, artifacts) {
    const lines = [];

    lines.push('本番コンパイルを開始しました。');
    lines.push('module: ' + MODULE_NAME);
    lines.push('version: ' + MODULE_VERSION);
    lines.push('build id: ' + config.buildId);
    lines.push('timestamp: ' + config.timestamp);
    lines.push('project: ' + config.projectName);
    lines.push('entry: ' + config.entryPoint);
    lines.push('entry target: ' + config.entryTarget);
    lines.push('build mode: ' + config.buildMode);
    lines.push('crate type: ' + config.crateType);
    lines.push('output mode: ' + config.outputMode);
    lines.push('compile mode: ' + safeString(result.mode || 'real'));
    lines.push('');

    lines.push('virtual fs:');
    Object.keys(virtualFs.files || {}).sort().forEach(function (path) {
      lines.push('- ' + path);
    });

    lines.push('');
    lines.push('generated files:');
    artifacts.forEach(function (file) {
      lines.push('- ' + file.name);
    });

    lines.push('');
    lines.push('errors:');
    if (result.errors.length) {
      result.errors.forEach(function (item) {
        lines.push('- ' + item);
      });
    } else {
      lines.push('- なし');
    }

    lines.push('');
    lines.push('warnings:');
    if (result.warnings.length) {
      result.warnings.forEach(function (item) {
        lines.push('- ' + item);
      });
    } else {
      lines.push('- なし');
    }

    return lines.join('\n');
  }

  function compile(input) {
    const unwrapped = unwrapCompileInput(input);
    const config = collectConfig(unwrapped.source);
    const baseValidation = validateCompileRequest(config);
    const dependencyValidation = resolveDependencyCheck(config);

    const virtualFs = unwrapped.incomingVirtualFs
      ? normalizeVirtualFsShape(unwrapped.incomingVirtualFs)
      : buildVirtualFs(config);

    const errors = [];
    const warnings = [];

    Array.prototype.push.apply(errors, baseValidation.errors);
    Array.prototype.push.apply(warnings, baseValidation.warnings);
    Array.prototype.push.apply(errors, dependencyValidation.errors);
    Array.prototype.push.apply(warnings, dependencyValidation.warnings);
    Array.prototype.push.apply(errors, toArray(virtualFs.errors));
    Array.prototype.push.apply(warnings, toArray(virtualFs.warnings));

    const compileOk = errors.length === 0;
    const artifactNames = chooseArtifactNames(config);
    const artifacts = [];

    artifacts.push({
      name: 'build-log.txt',
      type: 'text/plain;charset=utf-8',
      content: ''
    });

    artifacts.push({
      name: 'Cargo.toml',
      type: 'text/plain;charset=utf-8',
      content: virtualFs.files['/Cargo.toml'] || ''
    });

    if (config.outputMode === 'wasm-js' || config.outputMode === 'wasm-only') {
      artifacts.push({
        name: config.projectName + '.wasm',
        type: 'application/wasm',
        content: [
          '; real-compile placeholder',
          '; build=' + config.buildId,
          '; project=' + config.projectName,
          '; mode=' + config.buildMode,
          '; crate-type=' + config.crateType,
          '; entry=' + config.entryPoint
        ].join('\n')
      });
    }

    if (config.outputMode === 'wasm-js' || config.outputMode === 'js-only') {
      artifacts.push({
        name: config.projectName + '.loader.js',
        type: 'application/javascript;charset=utf-8',
        content: makeLoaderJs(config, compileOk)
      });

      artifacts.push({
        name: config.projectName + '.example.js',
        type: 'application/javascript;charset=utf-8',
        content: makeExampleJs(config)
      });
    }

    const result = {
      ok: compileOk,
      status: compileOk ? 'success' : 'error',
      mode: 'real',
      errors: errors,
      warnings: warnings,
      artifactNames: artifactNames,
      compileKind: 'real'
    };

    const logText = makeLogText(config, virtualFs, result, artifacts);
    artifacts[0].content = logText;

    return {
      ok: result.ok,
      status: result.status,
      mode: result.mode,
      compileKind: result.compileKind,
      moduleName: MODULE_NAME,
      moduleVersion: MODULE_VERSION,
      buildId: config.buildId,
      timestamp: config.timestamp,
      config: clone(config),
      virtualFs: clone(virtualFs),
      errors: clone(result.errors),
      warnings: clone(result.warnings),
      outputFiles: clone(artifacts),
      logText: logText,
      outputText: makeReadableBundle(config, virtualFs, artifacts, result),
      summaryHtml: makeSummaryHtml(config, result, artifacts)
    };
  }

  global.RustRealCompiler = {
    moduleName: MODULE_NAME,
    version: MODULE_VERSION,
    collectConfig: collectConfig,
    validateCompileRequest: validateCompileRequest,
    compile: compile
  };
})(window);