(function (global) {
  'use strict';

  function getEngine() {
    return global.RustBuildEngine || null;
  }

  function getVirtualFs() {
    return global.RustVirtualFs || null;
  }

  function getOutputManager() {
    return global.RustOutputManager || null;
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

  function buildFallbackConfig(input) {
    const source = input || {};

    return {
      buildId: 'rust-build-fallback-' + Date.now(),
      timestamp: new Date().toISOString(),
      projectName: trimOrEmpty(source.projectName || 'sample-rust-project'),
      entryPoint: trimOrEmpty(source.entryPoint || 'lib.rs'),
      entryTarget: trimOrEmpty(source.entryPoint || 'lib.rs').endsWith('main.rs') ? 'main' : 'lib',
      outputMode: trimOrEmpty(source.outputMode || 'wasm-js'),
      buildMode: trimOrEmpty(source.buildMode || 'release'),
      crateType: trimOrEmpty(source.crateType || 'cdylib'),
      version: trimOrEmpty(source.version || '0.1.0'),
      edition: trimOrEmpty(source.edition || '2021'),
      dependenciesText: normalizeLineBreaks(source.dependenciesText || 'wasm-bindgen = "0.2"'),
      featuresText: normalizeLineBreaks(source.featuresText || ''),
      cargoTomlText: normalizeLineBreaks(source.cargoTomlText || ''),
      mainRustCode: normalizeLineBreaks(source.mainRustCode || ''),
      subFiles: Array.isArray(source.subFiles) ? clone(source.subFiles) : []
    };
  }

  function validateConfig(config) {
    const errors = [];
    const warnings = [];

    if (!trimOrEmpty(config.projectName)) {
      errors.push('プロジェクト名が空です。');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(config.projectName)) {
      errors.push('プロジェクト名は英数字・ハイフン・アンダースコアのみ使用できます。');
    }

    if (!trimOrEmpty(config.entryPoint)) {
      errors.push('エントリーポイントが空です。');
    }

    if (!trimOrEmpty(config.mainRustCode)) {
      errors.push('メインRustコードが空です。');
    }

    if (!trimOrEmpty(config.version)) {
      errors.push('version が空です。');
    }

    if (!trimOrEmpty(config.edition)) {
      errors.push('edition が空です。');
    }

    if (!trimOrEmpty(config.crateType)) {
      errors.push('crate-type が空です。');
    }

    if (!trimOrEmpty(config.buildMode)) {
      errors.push('buildMode が空です。');
    }

    if (!trimOrEmpty(config.outputMode)) {
      errors.push('outputMode が空です。');
    }

    if (config.entryTarget === 'lib' && !config.mainRustCode.includes('wasm_bindgen')) {
      warnings.push('lib.rs ですが wasm_bindgen の記述が見当たりません。');
    }

    if (!config.mainRustCode.includes('fn ')) {
      warnings.push('関数定義が見当たりません。');
    }

    return { errors, warnings };
  }

  function buildVirtualFsFromModules(config) {
    const virtualFsModule = getVirtualFs();

    if (virtualFsModule && typeof virtualFsModule.createVirtualFs === 'function') {
      return virtualFsModule.createVirtualFs(config);
    }

    const files = {};
    const entryPath = config.entryPoint === 'main.rs' ? '/src/main.rs' : '/src/lib.rs';

    files['/Cargo.toml'] = [
      '[package]',
      `name = "${config.projectName}"`,
      `version = "${config.version}"`,
      `edition = "${config.edition}"`,
      '',
      config.entryTarget === 'lib'
        ? '[lib]\ncrate-type = ["' + config.crateType + '"]'
        : '',
      '',
      '[dependencies]',
      config.dependenciesText || 'wasm-bindgen = "0.2"'
    ].join('\n').replace(/\n{3,}/g, '\n\n');

    files[entryPath] = config.mainRustCode;

    const subFiles = Array.isArray(config.subFiles) ? config.subFiles : [];
    for (const file of subFiles) {
      if (!file || !file.name) continue;
      files['/src/' + String(file.name).replace(/^src\//, '').replace(/^\/+/, '')] = normalizeLineBreaks(file.content || '');
    }

    return {
      ok: true,
      entryPath,
      files,
      errors: [],
      warnings: []
    };
  }

  function buildOutputFiles(config, virtualFsResult, validation) {
    const outputManager = getOutputManager();

    if (outputManager && typeof outputManager.createOutputFiles === 'function') {
      return outputManager.createOutputFiles(config, virtualFsResult, validation);
    }

    const projectName = config.projectName || 'rust-output';
    const outputFiles = [];

    outputFiles.push({
      name: 'build-log.txt',
      type: 'text/plain',
      content: [
        'Rust Build Log',
        `project: ${projectName}`,
        `status: ${validation.errors.length === 0 ? 'success' : 'error'}`
      ].join('\n')
    });

    if (config.outputMode === 'wasm-js' || config.outputMode === 'wasm-only') {
      outputFiles.push({
        name: `${projectName}.wasm`,
        type: 'application/wasm',
        content: `mock wasm output for ${projectName}`
      });
    }

    if (config.outputMode === 'wasm-js' || config.outputMode === 'js-only') {
      outputFiles.push({
        name: `${projectName}.loader.js`,
        type: 'application/javascript',
        content: `export function load(){ return "${projectName}"; }`
      });
    }

    outputFiles.push({
      name: 'Cargo.toml',
      type: 'text/plain',
      content: (virtualFsResult.files && virtualFsResult.files['/Cargo.toml']) || ''
    });

    return outputFiles;
  }

  function buildLogText(config, validation, virtualFsResult, outputFiles) {
    const lines = [];

    lines.push('Rustビルドを開始しました。');
    lines.push(`project: ${config.projectName}`);
    lines.push(`entry: ${config.entryPoint}`);
    lines.push(`entry target: ${config.entryTarget}`);
    lines.push(`build mode: ${config.buildMode}`);
    lines.push(`crate type: ${config.crateType}`);
    lines.push(`output mode: ${config.outputMode}`);
    lines.push(`sub files: ${Array.isArray(config.subFiles) ? config.subFiles.length : 0}`);
    lines.push('');

    if (validation.errors.length === 0 && virtualFsResult.errors.length === 0) {
      lines.push('入力検証を通過しました。');
      lines.push('仮想FS構築に成功しました。');
    } else {
      lines.push('入力または仮想FS構築に失敗しました。');
    }

    if (validation.warnings.length || virtualFsResult.warnings.length) {
      lines.push('');
      lines.push('警告:');
      for (const item of validation.warnings.concat(virtualFsResult.warnings)) {
        lines.push(`- ${item}`);
      }
    }

    if (validation.errors.length || virtualFsResult.errors.length) {
      lines.push('');
      lines.push('エラー:');
      for (const item of validation.errors.concat(virtualFsResult.errors)) {
        lines.push(`- ${item}`);
      }
    }

    lines.push('');
    lines.push('仮想FS:');
    for (const path of Object.keys(virtualFsResult.files || {}).sort()) {
      lines.push(`- ${path}`);
    }

    lines.push('');
    lines.push('生成ファイル:');
    for (const file of outputFiles) {
      lines.push(`- ${file.name}`);
    }

    return lines.join('\n');
  }

  function buildOutputText(config, virtualFsResult, validation) {
    const outputManager = getOutputManager();

    if (outputManager && typeof outputManager.buildReadableOutput === 'function') {
      return outputManager.buildReadableOutput(config, virtualFsResult, validation);
    }

    const lines = [];

    lines.push('// Rust build result');
    lines.push(`// project: ${config.projectName}`);
    lines.push(`// status: ${validation.errors.length === 0 && virtualFsResult.errors.length === 0 ? 'success' : 'error'}`);
    lines.push('');
    lines.push('// files');

    for (const path of Object.keys(virtualFsResult.files || {}).sort()) {
      lines.push('');
      lines.push(`// ${path}`);
      lines.push(virtualFsResult.files[path]);
    }

    return lines.join('\n');
  }

  function buildSummaryHtml(config, validation, virtualFsResult, outputFiles) {
    const outputManager = getOutputManager();

    if (outputManager && typeof outputManager.buildSummaryHtml === 'function') {
      return outputManager.buildSummaryHtml(config, validation, virtualFsResult, outputFiles);
    }

    const errors = validation.errors.concat(virtualFsResult.errors);
    const warnings = validation.warnings.concat(virtualFsResult.warnings);

    const errorHtml = errors.length
      ? `<ul>${errors.map(function (item) { return `<li>${escapeHtml(item)}</li>`; }).join('')}</ul>`
      : '<p>なし</p>';

    const warningHtml = warnings.length
      ? `<ul>${warnings.map(function (item) { return `<li>${escapeHtml(item)}</li>`; }).join('')}</ul>`
      : '<p>なし</p>';

    const fileHtml = outputFiles.length
      ? `<ul>${outputFiles.map(function (file) { return `<li>${escapeHtml(file.name)}</li>`; }).join('')}</ul>`
      : '<p>なし</p>';

    return [
      '<div class="rust-build-summary">',
      `<p><strong>プロジェクト:</strong> ${escapeHtml(config.projectName)}</p>`,
      `<p><strong>entry:</strong> ${escapeHtml(config.entryPoint)}</p>`,
      `<p><strong>build-mode:</strong> ${escapeHtml(config.buildMode)}</p>`,
      `<p><strong>crate-type:</strong> ${escapeHtml(config.crateType)}</p>`,
      `<p><strong>output-mode:</strong> ${escapeHtml(config.outputMode)}</p>`,
      '<h4>エラー</h4>',
      errorHtml,
      '<h4>警告</h4>',
      warningHtml,
      '<h4>生成ファイル</h4>',
      fileHtml,
      '</div>'
    ].join('');
  }

  function escapeHtml(text) {
    return safeString(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function runBuild(input) {
    const engine = getEngine();

    if (engine && typeof engine.runBuild === 'function') {
      return engine.runBuild(input);
    }

    const config = buildFallbackConfig(input);
    const validation = validateConfig(config);
    const virtualFsResult = buildVirtualFsFromModules(config);
    const outputFiles = buildOutputFiles(config, virtualFsResult, validation);
    const logText = buildLogText(config, validation, virtualFsResult, outputFiles);
    const outputText = buildOutputText(config, virtualFsResult, validation);
    const summaryHtml = buildSummaryHtml(config, validation, virtualFsResult, outputFiles);

    return {
      ok: validation.errors.length === 0 && virtualFsResult.errors.length === 0,
      engineVersion: 'controller-fallback-1.0.0',
      buildId: config.buildId,
      timestamp: config.timestamp,
      status: validation.errors.length === 0 && virtualFsResult.errors.length === 0 ? 'success' : 'error',
      config: clone(config),
      virtualFs: clone(virtualFsResult.files || {}),
      errors: validation.errors.concat(virtualFsResult.errors),
      warnings: validation.warnings.concat(virtualFsResult.warnings),
      logText,
      outputText,
      outputFiles,
      summaryHtml
    };
  }

  global.RustBuildController = {
    runBuild
  };
})(window);