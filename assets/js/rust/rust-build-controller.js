(function (global) {
  'use strict';

  const CONTROLLER_VERSION = '0.1.0';

  function safeString(value, fallback = '') {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  function trim(value) {
    return safeString(value).trim();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeLineBreaks(text) {
    return safeString(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function inferEntryTarget(entryPoint) {
    const value = trim(entryPoint).toLowerCase();
    if (value.endsWith('main.rs')) return 'main';
    return 'lib';
  }

  function collectConfig(input) {
    const source = input || {};
    const subFiles = Array.isArray(source.subFiles)
      ? source.subFiles.map(function (file) {
          return {
            id: safeString(file && file.id ? file.id : makeId('sub')),
            name: trim(file && file.name ? file.name : ''),
            content: normalizeLineBreaks(file && file.content ? file.content : '')
          };
        }).filter(function (file) {
          return !!file.name;
        })
      : [];

    return {
      buildId: makeId('rust-build'),
      timestamp: nowIso(),
      projectName: trim(source.projectName || 'sample-rust-project'),
      entryPoint: trim(source.entryPoint || 'lib.rs'),
      entryTarget: inferEntryTarget(source.entryPoint || 'lib.rs'),
      outputMode: trim(source.outputMode || 'wasm-js'),
      buildMode: trim(source.buildMode || 'release'),
      crateType: trim(source.crateType || 'cdylib'),
      version: trim(source.version || '0.1.0'),
      edition: trim(source.edition || '2021'),
      dependenciesText: normalizeLineBreaks(source.dependenciesText || 'wasm-bindgen = "0.2"'),
      featuresText: normalizeLineBreaks(source.featuresText || ''),
      cargoTomlText: normalizeLineBreaks(source.cargoTomlText || ''),
      mainRustCode: normalizeLineBreaks(
        source.mainRustCode ||
        [
          'use wasm_bindgen::prelude::*;',
          '',
          '#[wasm_bindgen]',
          'pub fn greet() -> String {',
          '    "hello wasm".to_string()',
          '}'
        ].join('\n')
      ),
      subFiles: subFiles
    };
  }

  function buildVirtualFilesMap(config) {
    if (!global.RustBuildEngine || typeof global.RustBuildEngine.buildVirtualFs !== 'function') {
      throw new Error('RustBuildEngine.buildVirtualFs が見つかりません');
    }

    return global.RustBuildEngine.buildVirtualFs(config);
  }

  function mapVirtualFilesToList(virtualFs) {
    return Object.keys(virtualFs).sort().map(function (path) {
      return {
        path: path,
        content: safeString(virtualFs[path] || '')
      };
    });
  }

  function makeBaseValidation(config, virtualFs) {
    const errors = [];
    const warnings = [];

    if (!config.projectName) {
      errors.push('プロジェクト名が空です');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(config.projectName || '')) {
      errors.push('プロジェクト名は英数字・ハイフン・アンダースコアのみ使用できます');
    }

    if (!config.entryPoint) {
      errors.push('エントリーポイントが空です');
    }

    if (!config.mainRustCode.trim()) {
      errors.push('メインRustコードが空です');
    }

    if (!/^\d+\.\d+\.\d+$/.test(config.version || '')) {
      errors.push('version は 0.1.0 形式で入力してください');
    }

    if (!['2015', '2018', '2021', '2024'].includes(config.edition)) {
      errors.push('edition は 2015 / 2018 / 2021 / 2024 のいずれかです');
    }

    if (!['cdylib', 'rlib', 'bin'].includes(config.crateType)) {
      errors.push('crate-type は cdylib / rlib / bin のいずれかです');
    }

    if (!['debug', 'release'].includes(config.buildMode)) {
      errors.push('build mode は debug / release のいずれかです');
    }

    if (!['wasm-js', 'wasm-only', 'js-only', 'zip'].includes(config.outputMode)) {
      errors.push('output mode が不正です');
    }

    const entryExists = Object.keys(virtualFs).some(function (path) {
      return path.endsWith('/' + config.entryPoint.replace(/^src\//, ''));
    });

    if (!entryExists) {
      errors.push('エントリーファイルが仮想FSに存在しません');
    }

    if (config.entryTarget === 'lib' && config.mainRustCode.indexOf('wasm_bindgen') === -1) {
      warnings.push('lib.rs想定ですが wasm_bindgen 記述が見当たりません');
    }

    if (config.mainRustCode.indexOf('fn ') === -1) {
      warnings.push('関数定義が見当たりません');
    }

    return {
      errors: errors,
      warnings: warnings
    };
  }

  function mergeMessages(baseMessages, dependencyResult) {
    const errors = []
      .concat(baseMessages.errors || [])
      .concat(dependencyResult && dependencyResult.errors ? dependencyResult.errors : []);

    const warnings = []
      .concat(baseMessages.warnings || [])
      .concat(dependencyResult && dependencyResult.warnings ? dependencyResult.warnings : []);

    return {
      errors: errors,
      warnings: warnings
    };
  }

  function evaluateDependencies(config) {
    if (!global.RustDependencyManager || typeof global.RustDependencyManager.evaluateDependencies !== 'function') {
      return {
        ok: false,
        errors: ['RustDependencyManager.evaluateDependencies が見つかりません'],
        warnings: [],
        accepted: [],
        rejected: [],
        features: []
      };
    }

    return global.RustDependencyManager.evaluateDependencies(
      config.dependenciesText,
      config.featuresText
    );
  }

  function buildResult(config) {
    const virtualFs = buildVirtualFilesMap(config);
    const virtualFiles = mapVirtualFilesToList(virtualFs);
    const baseMessages = makeBaseValidation(config, virtualFs);
    const dependencyResult = evaluateDependencies(config);
    const merged = mergeMessages(baseMessages, dependencyResult);

    return {
      ok: merged.errors.length === 0,
      controllerVersion: CONTROLLER_VERSION,
      buildId: config.buildId,
      timestamp: config.timestamp,
      config: clone(config),
      virtualFs: clone(virtualFs),
      virtualFiles: virtualFiles,
      dependencyResult: clone(dependencyResult),
      errors: merged.errors,
      warnings: merged.warnings
    };
  }

  function run(input) {
    const config = collectConfig(input);
    const buildCoreResult = buildResult(config);

    if (!global.RustOutputManager || typeof global.RustOutputManager.makeOutputFiles !== 'function') {
      throw new Error('RustOutputManager.makeOutputFiles が見つかりません');
    }

    const outputFiles = global.RustOutputManager.makeOutputFiles(config, buildCoreResult);
    const outputText = global.RustOutputManager.makeReadableOutput(config, buildCoreResult);
    const summaryHtml = global.RustOutputManager.makeSummaryHtml(config, buildCoreResult, outputFiles);
    const logText = global.RustOutputManager.makeBuildLogContent(config, buildCoreResult);

    return {
      ok: buildCoreResult.ok,
      controllerVersion: CONTROLLER_VERSION,
      buildId: buildCoreResult.buildId,
      timestamp: buildCoreResult.timestamp,
      status: buildCoreResult.ok ? 'success' : 'error',
      config: buildCoreResult.config,
      virtualFs: buildCoreResult.virtualFs,
      virtualFiles: buildCoreResult.virtualFiles,
      dependencyResult: buildCoreResult.dependencyResult,
      errors: buildCoreResult.errors,
      warnings: buildCoreResult.warnings,
      logText: logText,
      outputText: outputText,
      outputFiles: outputFiles,
      summaryHtml: summaryHtml
    };
  }

  global.RustBuildController = {
    version: CONTROLLER_VERSION,
    collectConfig: collectConfig,
    buildResult: buildResult,
    run: run
  };
})(window);