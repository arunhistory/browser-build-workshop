(function (global) {
  'use strict';

  function safeString(value, fallback) {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return fallback || '';
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

  function escapeHtml(text) {
    return safeString(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeProjectName(name) {
    const value = trimOrEmpty(name || 'sample-rust-project') || 'sample-rust-project';

    return value
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'sample-rust-project';
  }

  function normalizeVersion(version) {
    const value = trimOrEmpty(version || '0.1.0');
    return value || '0.1.0';
  }

  function normalizeEdition(edition) {
    const value = trimOrEmpty(edition || '2021');
    if (['2015', '2018', '2021', '2024'].includes(value)) return value;
    return '2021';
  }

  function normalizeBuildMode(buildMode) {
    const value = trimOrEmpty(buildMode || 'release');
    if (value === 'debug') return 'debug';
    return 'release';
  }

  function normalizeOutputMode(outputMode) {
    const value = trimOrEmpty(outputMode || 'wasm-js');
    if (value === 'wasm-only') return 'wasm-only';
    if (value === 'js-only') return 'js-only';
    return 'wasm-js';
  }

  function normalizeEntryPoint(entryPoint) {
    const value = trimOrEmpty(entryPoint || 'lib.rs') || 'lib.rs';
    const fixed = value.replace(/\\/g, '/').replace(/^\/+/, '');

    if (fixed === 'lib.rs') return 'src/lib.rs';
    if (fixed === 'main.rs') return 'src/main.rs';
    if (fixed.startsWith('src/')) return fixed;

    return 'src/' + fixed;
  }

  function inferEntryTarget(entryPoint) {
    const value = trimOrEmpty(entryPoint).toLowerCase();
    if (value.endsWith('main.rs')) return 'main';
    return 'lib';
  }

  function normalizeCrateType(crateType, entryPoint) {
    const entryTarget = inferEntryTarget(entryPoint);

    if (entryTarget === 'main') {
      return 'bin';
    }

    const value = trimOrEmpty(crateType || 'cdylib').toLowerCase();

    if (['cdylib', 'rlib', 'staticlib', 'dylib'].includes(value)) {
      return value;
    }

    return 'cdylib';
  }

  function normalizeSubFilePath(path) {
    const value = trimOrEmpty(path).replace(/\\/g, '/').replace(/^\/+/, '');

    if (!value) return '';
    if (value.includes('..')) return '';
    if (!value.endsWith('.rs')) return '';

    if (value.startsWith('src/')) return value;
    return 'src/' + value;
  }

  function normalizeSubFiles(subFiles) {
    if (!Array.isArray(subFiles)) return [];

    const result = [];
    const used = new Set();

    subFiles.forEach(function (file) {
      if (!file || typeof file !== 'object') return;

      const name = normalizeSubFilePath(file.name || file.path || '');
      const content = normalizeLineBreaks(file.content || '');

      if (!name) return;
      if (!content.trim()) return;
      if (used.has(name)) return;

      used.add(name);

      result.push({
        name: name,
        content: content
      });
    });

    return result;
  }

  function validateProjectName(name) {
    const value = trimOrEmpty(name);

    if (!value) return 'プロジェクト名が空です。';

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(value)) {
      return 'プロジェクト名は英小文字・数字・ハイフンのみで指定してください。';
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
    const allowed = ['cdylib', 'rlib', 'staticlib', 'dylib', 'bin'];

    if (!value) return 'crate-type が空です。';

    if (!allowed.includes(value)) {
      return 'crate-type は cdylib / rlib / staticlib / dylib / bin のいずれかにしてください。';
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

  function validateDependenciesText(text, warnings) {
    const lines = normalizeLineBreaks(text)
      .split('\n')
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);

    lines.forEach(function (line) {
      if (line.startsWith('#')) return;

      if (!line.includes('=')) {
        warnings.push('dependencies の形式を確認してください: ' + line);
      }
    });
  }

  function validateFeaturesText(text, warnings) {
    const lines = normalizeLineBreaks(text)
      .split('\n')
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);

    lines.forEach(function (line) {
      if (line.startsWith('#')) return;

      if (!line.includes('=')) {
        warnings.push('features の形式を確認してください: ' + line);
      }
    });
  }

  function validateWithDependencyManager(config, errors, warnings) {
    if (!global.RustDependencyManager || typeof global.RustDependencyManager.validateDependencies !== 'function') {
      warnings.push('RustDependencyManager が見つからないため、依存関係検証をスキップしました。');
      return;
    }

    try {
      const result = global.RustDependencyManager.validateDependencies(config.dependenciesText);

      if (result && Array.isArray(result.errors)) {
        Array.prototype.push.apply(errors, result.errors);
      }

      if (result && Array.isArray(result.warnings)) {
        Array.prototype.push.apply(warnings, result.warnings);
      }
    } catch (error) {
      warnings.push('RustDependencyManager の検証中に例外が発生しました: ' + safeString(error && error.message ? error.message : error));
    }
  }

  function collectConfig(input) {
    const source = input || {};
    const entryPoint = normalizeEntryPoint(source.entryPoint || 'lib.rs');

    return {
      buildId: source.buildId || makeId('rust-build'),
      timestamp: nowIso(),
      projectName: normalizeProjectName(source.projectName || 'sample-rust-project'),
      version: normalizeVersion(source.version || '0.1.0'),
      edition: normalizeEdition(source.edition || '2021'),
      entryPoint: entryPoint,
      entryTarget: inferEntryTarget(entryPoint),
      outputMode: normalizeOutputMode(source.outputMode || 'wasm-js'),
      buildMode: normalizeBuildMode(source.buildMode || 'release'),
      crateType: normalizeCrateType(source.crateType || 'cdylib', entryPoint),
      dependenciesText: normalizeLineBreaks(source.dependenciesText || 'wasm-bindgen = "0.2"'),
      featuresText: normalizeLineBreaks(source.featuresText || ''),
      cargoTomlText: normalizeLineBreaks(source.cargoTomlText || source.cargoToml || ''),
      mainRustCode: normalizeLineBreaks(source.mainRustCode || ''),
      subFiles: normalizeSubFiles(source.subFiles || []),
      flags: {
        enableWasmBindgen: source.flags && typeof source.flags.enableWasmBindgen === 'boolean'
          ? source.flags.enableWasmBindgen
          : true,
        enableOptimize: source.flags && typeof source.flags.enableOptimize === 'boolean'
          ? source.flags.enableOptimize
          : true,
        enableJsLoader: source.flags && typeof source.flags.enableJsLoader === 'boolean'
          ? source.flags.enableJsLoader
          : true
      }
    };
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

    if (!config.entryPoint) {
      errors.push('エントリーポイントが空です。');
    }

    if (!config.entryPoint.endsWith('.rs')) {
      errors.push('エントリーポイントは .rs ファイルにしてください。');
    }

    if (config.entryPoint.includes('..')) {
      errors.push('エントリーポイントに危険なパスが含まれています。');
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

    if (config.entryTarget === 'main' && config.crateType !== 'bin') {
      warnings.push('main.rs のため crate-type は bin として扱われます。');
    }

    if (config.outputMode === 'js-only') {
      warnings.push('js-only は .wasm の確認には向きません。本物のwasm生成確認には wasm-js または wasm-only を使ってください。');
    }

    validateDependenciesText(config.dependenciesText, warnings);
    validateFeaturesText(config.featuresText, warnings);
    validateWithDependencyManager(config, errors, warnings);

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }

  function createBuildRequest(config) {
    return {
      build: {
        buildId: config.buildId,
        timestamp: config.timestamp,
        projectName: config.projectName,
        version: config.version,
        edition: config.edition,
        entryPoint: config.entryPoint,
        entryTarget: config.entryTarget,
        outputMode: config.outputMode,
        buildMode: config.buildMode,
        crateType: config.crateType,
        dependenciesText: config.dependenciesText,
        featuresText: config.featuresText,
        cargoTomlText: config.cargoTomlText,
        mainRustCode: config.mainRustCode,
        subFiles: config.subFiles,
        flags: config.flags
      }
    };
  }

  function makeLogText(config, validation) {
    const lines = [];

    lines.push('Rust本物ビルド用の buildRequestJson を生成しました。');
    lines.push('');
    lines.push('build id: ' + config.buildId);
    lines.push('timestamp: ' + config.timestamp);
    lines.push('project: ' + config.projectName);
    lines.push('version: ' + config.version);
    lines.push('edition: ' + config.edition);
    lines.push('entry: ' + config.entryPoint);
    lines.push('entry target: ' + config.entryTarget);
    lines.push('build mode: ' + config.buildMode);
    lines.push('crate type: ' + config.crateType);
    lines.push('output mode: ' + config.outputMode);
    lines.push('sub files: ' + String(config.subFiles.length));
    lines.push('');

    lines.push('errors:');
    if (validation.errors.length) {
      validation.errors.forEach(function (item) {
        lines.push('- ' + item);
      });
    } else {
      lines.push('- なし');
    }

    lines.push('');

    lines.push('warnings:');
    if (validation.warnings.length) {
      validation.warnings.forEach(function (item) {
        lines.push('- ' + item);
      });
    } else {
      lines.push('- なし');
    }

    lines.push('');
    lines.push('result: ' + (validation.ok ? 'GitHub Actions投入準備完了' : '入力エラーあり'));

    return lines.join('\n');
  }

  function makeHowToRunText(buildRequest) {
    return [
      'GitHub Actions 手動実行手順',
      '',
      '1. GitHub の対象リポジトリを開く',
      '2. Actions を開く',
      '3. Rust Wasm Build を選ぶ',
      '4. Run workflow を押す',
      '5. buildRequestJson に、このJSONをそのまま貼り付ける',
      '6. 実行後、Artifacts から rust-wasm-build をダウンロードする',
      '',
      '重要:',
      '- このページは .wasm を偽生成しません。',
      '- 本物の Rust コンパイルは GitHub Actions 側で行います。',
      '- GitHub Pages に個人アクセストークンを埋め込む方式は危険なので採用しません。',
      '',
      'buildRequestJson:',
      JSON.stringify(buildRequest, null, 2)
    ].join('\n');
  }

  function makeSummaryHtml(config, validation) {
    function makeList(items) {
      if (!items.length) return '<p>なし</p>';

      return '<ul>' + items.map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join('') + '</ul>';
    }

    return [
      '<div class="rust-build-summary">',
      '<p><strong>状態:</strong> ' + escapeHtml(validation.ok ? 'GitHub Actions投入準備完了' : '入力エラーあり') + '</p>',
      '<p><strong>ビルドID:</strong> ' + escapeHtml(config.buildId) + '</p>',
      '<p><strong>プロジェクト:</strong> ' + escapeHtml(config.projectName) + '</p>',
      '<p><strong>version:</strong> ' + escapeHtml(config.version) + '</p>',
      '<p><strong>edition:</strong> ' + escapeHtml(config.edition) + '</p>',
      '<p><strong>entry:</strong> ' + escapeHtml(config.entryPoint) + '</p>',
      '<p><strong>crate-type:</strong> ' + escapeHtml(config.crateType) + '</p>',
      '<p><strong>build-mode:</strong> ' + escapeHtml(config.buildMode) + '</p>',
      '<p><strong>output-mode:</strong> ' + escapeHtml(config.outputMode) + '</p>',
      '<h4>エラー</h4>',
      makeList(validation.errors),
      '<h4>警告</h4>',
      makeList(validation.warnings),
      '<h4>次の操作</h4>',
      '<p>生成された JSON を GitHub Actions の buildRequestJson に貼り付けて実行してください。</p>',
      '</div>'
    ].join('');
  }

  function makeOutputFiles(config, validation, buildRequest, logText) {
    const jsonText = JSON.stringify(buildRequest, null, 2);
    const howToRunText = makeHowToRunText(buildRequest);

    return [
      {
        name: 'build-request.json',
        type: 'application/json;charset=utf-8',
        content: jsonText
      },
      {
        name: 'github-actions-input.txt',
        type: 'text/plain;charset=utf-8',
        content: jsonText
      },
      {
        name: 'how-to-run.txt',
        type: 'text/plain;charset=utf-8',
        content: howToRunText
      },
      {
        name: 'build-log.txt',
        type: 'text/plain;charset=utf-8',
        content: logText
      }
    ];
  }

  function buildOutputFileMap(outputFiles) {
    const map = {
      wasm: {
        name: 'build-request.json',
        content: 'まだ生成されていません。'
      },
      loaderJs: {
        name: 'github-actions-input.txt',
        content: 'まだ生成されていません。'
      },
      exampleJs: {
        name: 'how-to-run.txt',
        content: 'まだ生成されていません。'
      },
      buildLog: {
        name: 'build-log.txt',
        content: 'まだ生成されていません。'
      }
    };

    outputFiles.forEach(function (file) {
      if (!file || !file.name) return;

      if (file.name === 'build-request.json') {
        map.wasm = {
          name: file.name,
          content: safeString(file.content)
        };
        return;
      }

      if (file.name === 'github-actions-input.txt') {
        map.loaderJs = {
          name: file.name,
          content: safeString(file.content)
        };
        return;
      }

      if (file.name === 'how-to-run.txt') {
        map.exampleJs = {
          name: file.name,
          content: safeString(file.content)
        };
        return;
      }

      if (file.name === 'build-log.txt') {
        map.buildLog = {
          name: file.name,
          content: safeString(file.content)
        };
      }
    });

    return map;
  }

  function runBuild(input) {
    const config = collectConfig(input);
    const validation = validateConfig(config);
    const buildRequest = createBuildRequest(config);
    const logText = makeLogText(config, validation);
    const outputText = JSON.stringify(buildRequest, null, 2);
    const outputFiles = makeOutputFiles(config, validation, buildRequest, logText);
    const outputFileMap = buildOutputFileMap(outputFiles);
    const summaryHtml = makeSummaryHtml(config, validation);

    return {
      ok: validation.ok,
      buildId: config.buildId,
      timestamp: config.timestamp,
      status: validation.ok ? 'ready' : 'error',
      mode: 'github-actions-request',
      compileKind: 'github-actions-request',
      config: clone(config),
      buildRequest: clone(buildRequest),
      errors: clone(validation.errors),
      warnings: clone(validation.warnings),
      outputFiles: clone(outputFiles),
      outputFileMap: clone(outputFileMap),
      logText: logText,
      outputText: outputText,
      summaryHtml: summaryHtml
    };
  }

  global.RustBuildController = {
    collectConfig: collectConfig,
    validateConfig: validateConfig,
    createBuildRequest: createBuildRequest,
    runBuild: runBuild,
    buildOutputFileMap: buildOutputFileMap
  };
})(window);