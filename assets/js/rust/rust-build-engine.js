(function (global) {
  'use strict';

  const ENGINE_VERSION = '0.2.2';

  function nowIso() {
    return new Date().toISOString();
  }

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

  function normalizeDependencies(rawText) {
    const text = normalizeLineBreaks(rawText);
    const lines = text.split('\n');
    const cleaned = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      cleaned.push(trimmed);
    }

    return cleaned;
  }

  function normalizeFeatures(rawText) {
    const text = normalizeLineBreaks(rawText);
    const lines = text.split('\n');
    const cleaned = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      cleaned.push(trimmed);
    }

    return cleaned;
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

  function validateProjectName(name) {
    const value = trimOrEmpty(name);

    if (!value) {
      return 'プロジェクト名が空です。';
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      return 'プロジェクト名は英数字・ハイフン・アンダースコアのみ使用できます。';
    }

    return '';
  }

  function validateEntryPoint(entryPoint) {
    const value = trimOrEmpty(entryPoint);

    if (!value) {
      return 'エントリーポイントが空です。';
    }

    if (!/^[a-zA-Z0-9_.\/-]+$/.test(value)) {
      return 'エントリーポイントに使用できない文字があります。';
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

  function validateSubFiles(subFiles) {
    const errors = [];
    const seen = new Set();

    for (const file of subFiles) {
      if (!file || typeof file !== 'object') {
        errors.push('補助ファイルの形式が不正です。');
        continue;
      }

      const name = trimOrEmpty(file.name || '');
      if (!name) {
        errors.push('補助ファイル名が空です。');
        continue;
      }

      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
        errors.push('補助ファイル名に使用できない文字があります: ' + name);
      }

      if (!name.endsWith('.rs')) {
        errors.push('補助ファイル名は .rs で終わる必要があります: ' + name);
      }

      if (seen.has(name)) {
        errors.push('同名の補助ファイルがあります: ' + name);
      }
      seen.add(name);

      const content = trimOrEmpty(file.content || '');
      if (!content) {
        errors.push('補助ファイルの中身が空です: ' + name);
      }
    }

    return errors;
  }

  function inferEntryTarget(entryPoint) {
    const name = trimOrEmpty(entryPoint).toLowerCase();

    if (name.endsWith('main.rs')) {
      return 'main';
    }

    return 'lib';
  }

  function normalizeEntryPoint(entryPoint) {
    const value = trimOrEmpty(entryPoint || 'lib.rs');
    if (!value) return 'lib.rs';
    return value;
  }

  function normalizeFlags(flags) {
    const source = flags && typeof flags === 'object' ? flags : {};
    return {
      enableWasmBindgen: source.enableWasmBindgen !== false,
      enableOptimize: source.enableOptimize !== false,
      enableJsLoader: source.enableJsLoader !== false
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

    const dependencyLines = normalizeDependencies(config.dependenciesText);
    if (dependencyLines.length > 0) {
      lines.push('[dependencies]');
      lines.push.apply(lines, dependencyLines);
      lines.push('');
    }

    const featureLines = normalizeFeatures(config.featuresText);
    if (featureLines.length > 0) {
      lines.push('[features]');
      lines.push.apply(lines, featureLines);
      lines.push('');
    }

    return lines.join('\n').trim() + '\n';
  }

  function buildVirtualFs(config) {
    const files = {};
    const subFiles = Array.isArray(config.subFiles) ? config.subFiles : [];

    let entryPath = normalizeEntryPoint(config.entryPoint);
    if (!entryPath.startsWith('/')) {
      entryPath = '/src/' + entryPath.replace(/^src\//, '');
    }

    files['/Cargo.toml'] = buildCargoToml(config);
    files[entryPath] = normalizeLineBreaks(config.mainRustCode);

    for (const file of subFiles) {
      if (!file || typeof file !== 'object') continue;

      const rawName = trimOrEmpty(file.name || '');
      if (!rawName) continue;

      let path = rawName;
      if (!path.startsWith('/')) {
        path = '/src/' + path.replace(/^src\//, '');
      }

      files[path] = normalizeLineBreaks(file.content || '');
    }

    return files;
  }

  function validateDependenciesWithManager(config, errors, warnings) {
    if (!global.RustDependencyManager || typeof global.RustDependencyManager.validateDependencies !== 'function') {
      warnings.push('RustDependencyManager が見つからないため、依存関係検証をスキップしました。');
      return;
    }

    const dependencyResult = global.RustDependencyManager.validateDependencies(config.dependenciesText);

    if (dependencyResult && Array.isArray(dependencyResult.errors) && dependencyResult.errors.length) {
      errors.push.apply(errors, dependencyResult.errors);
    }

    if (dependencyResult && Array.isArray(dependencyResult.warnings) && dependencyResult.warnings.length) {
      warnings.push.apply(warnings, dependencyResult.warnings);
    }
  }

  function validateSourceSet(config, virtualFs) {
    const errors = [];
    const warnings = [];

    const projectError = validateProjectName(config.projectName);
    if (projectError) errors.push(projectError);

    const entryError = validateEntryPoint(config.entryPoint);
    if (entryError) errors.push(entryError);

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

    const subFileErrors = validateSubFiles(config.subFiles || []);
    if (subFileErrors.length) {
      errors.push.apply(errors, subFileErrors);
    }

    const mainCode = trimOrEmpty(config.mainRustCode);
    if (!mainCode) {
      errors.push('メインRustコードが空です。');
    }

    const expectedEntryPath = '/src/' + normalizeEntryPoint(config.entryPoint).replace(/^src\//, '');
    if (!virtualFs[expectedEntryPath]) {
      errors.push('エントリーファイルが仮想FSに存在しません。');
    }

    if (mainCode && !mainCode.includes('fn ')) {
      warnings.push('Rustコードに関数定義が見当たりません。');
    }

    if (config.entryTarget === 'lib' && config.flags.enableWasmBindgen && !mainCode.includes('wasm_bindgen')) {
      warnings.push('lib.rs 想定ですが wasm_bindgen の記述が見当たりません。');
    }

    const dependencyLines = normalizeDependencies(config.dependenciesText);
    for (const line of dependencyLines) {
      if (!line.includes('=')) {
        warnings.push('dependencies の形式が単純すぎる可能性があります: ' + line);
      }
    }

    validateDependenciesWithManager(config, errors, warnings);

    if (!config.flags.enableJsLoader && config.outputMode === 'wasm-js') {
      warnings.push('loader.js 出力が無効なので、実際の出力は wasm-only 相当になります。');
    }

    if (config.flags.enableOptimize && config.buildMode === 'debug') {
      warnings.push('debug ビルドで最適化フラグが有効です。');
    }

    return {
      errors: errors,
      warnings: warnings
    };
  }

  function makeOutputFiles(config, virtualFs, evaluation) {
    const outputFiles = [];
    const baseName = config.projectName || 'rust-output';

    const logText = [
      'engine-version: ' + ENGINE_VERSION,
      'build-id: ' + config.buildId,
      'timestamp: ' + config.timestamp,
      'status: ' + evaluation.status,
      'entry: ' + config.entryPoint,
      'entry-target: ' + config.entryTarget,
      'crate-type: ' + config.crateType,
      'build-mode: ' + config.buildMode,
      'output-mode: ' + config.outputMode,
      '',
      'errors:',
      evaluation.errors.length ? evaluation.errors.join('\n') : '(none)',
      '',
      'warnings:',
      evaluation.warnings.length ? evaluation.warnings.join('\n') : '(none)',
      '',
      'virtual-fs:',
      Object.keys(virtualFs).sort().join('\n')
    ].join('\n');

    outputFiles.push({
      name: 'build-log.txt',
      type: 'text/plain',
      content: logText
    });

    if (config.outputMode === 'wasm-js' || config.outputMode === 'wasm-only') {
      outputFiles.push({
        name: baseName + '.wasm',
        type: 'application/wasm',
        content: [
          '; mock wasm binary placeholder',
          '; project=' + baseName,
          '; build=' + config.buildId,
          '; mode=' + config.buildMode,
          '; crate-type=' + config.crateType,
          '; optimize=' + String(config.flags.enableOptimize)
        ].join('\n')
      });
    }

    if ((config.outputMode === 'wasm-js' || config.outputMode === 'js-only') && config.flags.enableJsLoader) {
      outputFiles.push({
        name: baseName + '.loader.js',
        type: 'application/javascript',
        content: [
          '// loader for ' + baseName,
          '// build id: ' + config.buildId,
          'export async function load' + pascalCase(baseName) + '() {',
          '  return {',
          '    ok: ' + String(evaluation.errors.length === 0) + ',',
          '    project: ' + JSON.stringify(baseName) + ',',
          '    buildId: ' + JSON.stringify(config.buildId) + ',',
          '    mode: ' + JSON.stringify(config.buildMode) + ',',
          '    optimized: ' + String(config.flags.enableOptimize),
          '  };',
          '}'
        ].join('\n')
      });
    }

    outputFiles.push({
      name: 'Cargo.toml',
      type: 'text/plain',
      content: virtualFs['/Cargo.toml'] || ''
    });

    return outputFiles;
  }

  function buildReadableOutput(config, virtualFs, evaluation) {
    const lines = [];
    const entryPath = '/src/' + normalizeEntryPoint(config.entryPoint).replace(/^src\//, '');

    lines.push('// browser-build-workshop');
    lines.push('// Rust build result');
    lines.push('// engine version: ' + ENGINE_VERSION);
    lines.push('// build id: ' + config.buildId);
    lines.push('// timestamp: ' + config.timestamp);
    lines.push('// project: ' + config.projectName);
    lines.push('// entry: ' + config.entryPoint);
    lines.push('// entry target: ' + config.entryTarget);
    lines.push('// build mode: ' + config.buildMode);
    lines.push('// crate type: ' + config.crateType);
    lines.push('// output mode: ' + config.outputMode);
    lines.push('// status: ' + evaluation.status);
    lines.push('');

    lines.push('// flags');
    lines.push('// wasm-bindgen: ' + String(config.flags.enableWasmBindgen));
    lines.push('// optimize: ' + String(config.flags.enableOptimize));
    lines.push('// js-loader: ' + String(config.flags.enableJsLoader));
    lines.push('');

    lines.push('// generated files');
    for (const file of makeOutputFiles(config, virtualFs, evaluation)) {
      lines.push('// - ' + file.name);
    }
    lines.push('');

    lines.push('// Cargo.toml');
    lines.push(virtualFs['/Cargo.toml'] || '');
    lines.push('');

    lines.push('// main rust source');
    if (virtualFs[entryPath]) {
      lines.push(virtualFs[entryPath]);
    } else {
      lines.push('// entry file missing');
    }

    const subPaths = Object.keys(virtualFs)
      .filter(function (key) {
        return key !== '/Cargo.toml' && key !== entryPath;
      })
      .sort();

    lines.push('');
    lines.push('// sub files count: ' + subPaths.length);

    for (const path of subPaths) {
      lines.push('');
      lines.push('// file: ' + path);
      lines.push(virtualFs[path]);
    }

    if (evaluation.errors.length) {
      lines.push('');
      lines.push('// errors');
      for (const err of evaluation.errors) {
        lines.push('// - ' + err);
      }
    }

    if (evaluation.warnings.length) {
      lines.push('');
      lines.push('// warnings');
      for (const warn of evaluation.warnings) {
        lines.push('// - ' + warn);
      }
    }

    return lines.join('\n').trim() + '\n';
  }

  function makeLogText(config, evaluation, outputFiles) {
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
    lines.push('sub files: ' + config.subFiles.length);
    lines.push('optimize: ' + String(config.flags.enableOptimize));
    lines.push('js loader: ' + String(config.flags.enableJsLoader));
    lines.push('wasm-bindgen flag: ' + String(config.flags.enableWasmBindgen));

    if (evaluation.errors.length === 0) {
      lines.push('入力検証を通過しました。');
      lines.push('現在は仮想FS構築 + 疑似ビルド出力まで実行しました。');
    } else {
      lines.push('入力エラーがあるため、本ビルド相当処理は停止しました。');
    }

    lines.push('');
    lines.push('virtual fs:');
    Object.keys(virtualFsForLog(config)).sort().forEach(function (path) {
      lines.push('- ' + path);
    });

    lines.push('');
    lines.push('errors:');
    if (evaluation.errors.length) {
      for (const error of evaluation.errors) {
        lines.push('- ' + error);
      }
    } else {
      lines.push('- なし');
    }

    lines.push('');
    lines.push('warnings:');
    if (evaluation.warnings.length) {
      for (const warning of evaluation.warnings) {
        lines.push('- ' + warning);
      }
    } else {
      lines.push('- なし');
    }

    lines.push('');
    lines.push('生成予定ファイル:');
    for (const file of outputFiles) {
      lines.push('- ' + file.name);
    }

    return lines.join('\n');
  }

  function virtualFsForLog(config) {
    return buildVirtualFs(config);
  }

  function collectConfig(input) {
    const source = input || {};

    const subFiles = Array.isArray(source.subFiles)
      ? source.subFiles.map(function (file) {
          return {
            id: safeString((file && file.id) || makeId('sub')),
            name: safeString((file && file.name) || '').trim(),
            content: normalizeLineBreaks((file && file.content) || '')
          };
        })
      : [];

    const flags = normalizeFlags(source.flags);

    const config = {
      buildId: makeId('rust-build'),
      timestamp: nowIso(),
      projectName: trimOrEmpty(source.projectName || 'sample-rust-project'),
      entryPoint: normalizeEntryPoint(source.entryPoint || 'lib.rs'),
      entryTarget: inferEntryTarget(source.entryPoint || 'lib.rs'),
      outputMode: trimOrEmpty(source.outputMode || 'wasm-js'),
      buildMode: trimOrEmpty(source.buildMode || 'release'),
      crateType: trimOrEmpty(source.crateType || 'cdylib'),
      version: trimOrEmpty(source.version || '0.1.0'),
      edition: trimOrEmpty(source.edition || '2021'),
      dependenciesText: normalizeLineBreaks(source.dependenciesText || 'wasm-bindgen = "0.2"'),
      featuresText: normalizeLineBreaks(source.featuresText || ''),
      cargoTomlText: normalizeLineBreaks(source.cargoTomlText || ''),
      mainRustCode: normalizeLineBreaks(
        source.mainRustCode ||
          [
            'use wasm_bindgen::prelude::*;',
            '',
            '#[wasm_bindgen]',
            'pub fn greet(name: &str) -> String {',
            '    format!("hello {}", name)',
            '}'
          ].join('\n')
      ),
      subFiles: subFiles,
      flags: flags
    };

    if (!config.flags.enableJsLoader && config.outputMode === 'wasm-js') {
      config.outputMode = 'wasm-only';
    }

    if (config.entryTarget === 'main' && config.crateType === 'cdylib') {
      config.crateType = 'bin';
    }

    return config;
  }

  function buildSummaryHtml(config, evaluation, outputFiles) {
    const errorHtml = evaluation.errors.length
      ? '<ul>' + evaluation.errors.map(function (item) {
          return '<li>' + escapeHtml(item) + '</li>';
        }).join('') + '</ul>'
      : '<p>なし</p>';

    const warningHtml = evaluation.warnings.length
      ? '<ul>' + evaluation.warnings.map(function (item) {
          return '<li>' + escapeHtml(item) + '</li>';
        }).join('') + '</ul>'
      : '<p>なし</p>';

    const fileHtml = outputFiles.length
      ? '<ul>' + outputFiles.map(function (file) {
          return '<li>' + escapeHtml(file.name) + '</li>';
        }).join('') + '</ul>'
      : '<p>なし</p>';

    return [
      '<div class="rust-build-summary">',
      '<p><strong>ビルドID:</strong> ' + escapeHtml(config.buildId) + '</p>',
      '<p><strong>状態:</strong> ' + escapeHtml(evaluation.status) + '</p>',
      '<p><strong>プロジェクト:</strong> ' + escapeHtml(config.projectName) + '</p>',
      '<p><strong>entry:</strong> ' + escapeHtml(config.entryPoint) + '</p>',
      '<p><strong>entry target:</strong> ' + escapeHtml(config.entryTarget) + '</p>',
      '<p><strong>crate-type:</strong> ' + escapeHtml(config.crateType) + '</p>',
      '<p><strong>build-mode:</strong> ' + escapeHtml(config.buildMode) + '</p>',
      '<p><strong>output-mode:</strong> ' + escapeHtml(config.outputMode) + '</p>',
      '<p><strong>optimize:</strong> ' + escapeHtml(String(config.flags.enableOptimize)) + '</p>',
      '<p><strong>js-loader:</strong> ' + escapeHtml(String(config.flags.enableJsLoader)) + '</p>',
      '<h4>エラー</h4>',
      errorHtml,
      '<h4>警告</h4>',
      warningHtml,
      '<h4>生成ファイル</h4>',
      fileHtml,
      '</div>'
    ].join('');
  }

  function runBuild(input) {
    const config = collectConfig(input);
    const virtualFs = buildVirtualFs(config);
    const validation = validateSourceSet(config, virtualFs);

    const evaluation = {
      status: validation.errors.length === 0 ? 'success' : 'error',
      errors: validation.errors,
      warnings: validation.warnings
    };

    const outputFiles = makeOutputFiles(config, virtualFs, evaluation);
    const outputText = buildReadableOutput(config, virtualFs, evaluation);
    const logText = makeLogText(config, evaluation, outputFiles);

    return {
      ok: evaluation.errors.length === 0,
      engineVersion: ENGINE_VERSION,
      buildId: config.buildId,
      timestamp: config.timestamp,
      status: evaluation.status,
      config: clone(config),
      virtualFs: clone(virtualFs),
      errors: clone(evaluation.errors),
      warnings: clone(evaluation.warnings),
      logText: logText,
      outputText: outputText,
      outputFiles: clone(outputFiles),
      summaryHtml: buildSummaryHtml(config, evaluation, outputFiles)
    };
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([safeString(content)], {
      type: 'text/plain;charset=utf-8'
    });
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

  global.RustBuildEngine = {
    version: ENGINE_VERSION,
    runBuild: runBuild,
    collectConfig: collectConfig,
    buildCargoToml: buildCargoToml,
    buildVirtualFs: buildVirtualFs,
    downloadTextFile: downloadTextFile
  };
})(window);