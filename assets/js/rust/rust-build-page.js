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

  function normalizeOutputMode(raw) {
    if (raw === 'wasm-only') return 'wasm-only';
    if (raw === 'js-only') return 'js-only';
    return 'wasm-js';
  }

  function escapeHtml(text) {
    return String(text)
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
    const logEl = getEl('buildLog');
    if (!logEl) return;

    if ('value' in logEl) {
      logEl.value = text || '';
      return;
    }

    logEl.textContent = text || '';
  }

  function showOutput(text) {
    const outputEl = getEl('buildOutput');
    if (!outputEl) return;

    if ('value' in outputEl) {
      outputEl.value = text || '';
      return;
    }

    outputEl.textContent = text || '';
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

  function setLabelTextByFor(forId, text) {
    const label = document.querySelector('label[for="' + forId + '"]');
    if (label) {
      label.textContent = text;
    }
  }

  function clearSeparatedOutputs() {
    setLabelTextByFor('outputFileBuildLog', 'build-log.txt');
    setLabelTextByFor('outputFileBundle', 'bundle / outputText');
    setLabelTextByFor('outputFileWasm', '.wasm');
    setLabelTextByFor('outputFileLoaderJs', '.loader.js');
    setLabelTextByFor('outputFileExampleJs', '.example.js');

    setTextareaOrText('outputFileBuildLog', 'まだ生成されていません。');
    setTextareaOrText('outputFileBundle', 'まだ生成されていません。');
    setTextareaOrText('outputFileWasm', 'まだ生成されていません。');
    setTextareaOrText('outputFileLoaderJs', 'まだ生成されていません。');
    setTextareaOrText('outputFileExampleJs', 'まだ生成されていません。');
  }

  function findOutputFileByName(outputFiles, exactName) {
    if (!Array.isArray(outputFiles)) return null;
    for (const file of outputFiles) {
      if (file && file.name === exactName) {
        return file;
      }
    }
    return null;
  }

  function findOutputFileByExt(outputFiles, ext) {
    if (!Array.isArray(outputFiles)) return null;
    for (const file of outputFiles) {
      if (file && typeof file.name === 'string' && file.name.endsWith(ext)) {
        return file;
      }
    }
    return null;
  }

  function splitOutputFiles(result) {
    const outputFileMap = result && result.outputFileMap && typeof result.outputFileMap === 'object'
      ? result.outputFileMap
      : null;

    if (outputFileMap) {
      setLabelTextByFor(
        'outputFileBuildLog',
        outputFileMap.buildLog && outputFileMap.buildLog.name ? outputFileMap.buildLog.name : 'build-log.txt'
      );
      setLabelTextByFor('outputFileBundle', 'bundle / outputText');
      setLabelTextByFor(
        'outputFileWasm',
        outputFileMap.wasm && outputFileMap.wasm.name ? outputFileMap.wasm.name : '.wasm'
      );
      setLabelTextByFor(
        'outputFileLoaderJs',
        outputFileMap.loaderJs && outputFileMap.loaderJs.name ? outputFileMap.loaderJs.name : '.loader.js'
      );
      setLabelTextByFor(
        'outputFileExampleJs',
        outputFileMap.exampleJs && outputFileMap.exampleJs.name ? outputFileMap.exampleJs.name : '.example.js'
      );

      setTextareaOrText(
        'outputFileBuildLog',
        outputFileMap.buildLog && typeof outputFileMap.buildLog.content === 'string'
          ? outputFileMap.buildLog.content
          : 'まだ生成されていません。'
      );

      setTextareaOrText(
        'outputFileBundle',
        typeof (result && result.outputText) === 'string' && result.outputText
          ? result.outputText
          : 'まだ生成されていません。'
      );

      setTextareaOrText(
        'outputFileWasm',
        outputFileMap.wasm && typeof outputFileMap.wasm.content === 'string'
          ? outputFileMap.wasm.content
          : 'まだ生成されていません。'
      );
      setTextareaOrText(
        'outputFileLoaderJs',
        outputFileMap.loaderJs && typeof outputFileMap.loaderJs.content === 'string'
          ? outputFileMap.loaderJs.content
          : 'まだ生成されていません。'
      );
      setTextareaOrText(
        'outputFileExampleJs',
        outputFileMap.exampleJs && typeof outputFileMap.exampleJs.content === 'string'
          ? outputFileMap.exampleJs.content
          : 'まだ生成されていません。'
      );
      return;
    }

    const outputFiles = Array.isArray(result && result.outputFiles) ? result.outputFiles : [];
    const buildLogFile = findOutputFileByName(outputFiles, 'build-log.txt');
    const wasmFile = findOutputFileByExt(outputFiles, '.wasm');
    const loaderJsFile = findOutputFileByExt(outputFiles, '.loader.js');
    const exampleJsFile = findOutputFileByExt(outputFiles, '.example.js');

    setLabelTextByFor('outputFileBuildLog', buildLogFile ? buildLogFile.name : 'build-log.txt');
    setLabelTextByFor('outputFileBundle', 'bundle / outputText');
    setLabelTextByFor('outputFileWasm', wasmFile ? wasmFile.name : '.wasm');
    setLabelTextByFor('outputFileLoaderJs', loaderJsFile ? loaderJsFile.name : '.loader.js');
    setLabelTextByFor('outputFileExampleJs', exampleJsFile ? exampleJsFile.name : '.example.js');

    setTextareaOrText(
      'outputFileBuildLog',
      buildLogFile ? (buildLogFile.content || '') : 'まだ生成されていません。'
    );
    setTextareaOrText(
      'outputFileBundle',
      result && typeof result.outputText === 'string' && result.outputText
        ? result.outputText
        : 'まだ生成されていません。'
    );
    setTextareaOrText('outputFileWasm', wasmFile ? (wasmFile.content || '') : 'まだ生成されていません。');
    setTextareaOrText('outputFileLoaderJs', loaderJsFile ? (loaderJsFile.content || '') : 'まだ生成されていません。');
    setTextareaOrText('outputFileExampleJs', exampleJsFile ? (exampleJsFile.content || '') : 'まだ生成されていません。');
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
    const name = readSubFileName();
    const content = readSubFileCode();

    if (!name) {
      showStatus('補助ファイル名を入れてください');
      return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
      showStatus('補助ファイル名に使えない文字があります');
      return;
    }

    if (!name.endsWith('.rs')) {
      showStatus('補助ファイル名は .rs で終わる必要があります');
      return;
    }

    if (!content.trim()) {
      showStatus('補助ファイルの中身が空です');
      return;
    }

    const exists = state.subFiles.some(function (file) {
      return file.name === name;
    });

    if (exists) {
      showStatus('同じ名前の補助ファイルは追加できません');
      return;
    }

    state.subFiles.push({
      id: 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      name: name,
      content: content
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
    return {
      projectName: safeValue('projectName', 'sample-rust-project').trim() || 'sample-rust-project',
      entryPoint: safeValue('entryType', 'lib.rs').trim() || 'lib.rs',
      outputMode: normalizeOutputMode(safeValue('outputMode', 'wasm-js').trim()),
      buildMode: safeValue('buildMode', 'release').trim() || 'release',
      crateType: safeValue('crateType', 'cdylib').trim() || 'cdylib',
      version: safeValue('version', '0.1.0').trim() || '0.1.0',
      edition: safeValue('edition', '2021').trim() || '2021',
      dependenciesText: safeValue('dependenciesText', ''),
      featuresText: safeValue('featuresText', ''),
      cargoTomlText: safeValue('cargoToml', ''),
      mainRustCode: safeValue('mainRustCode', ''),
      subFiles: state.subFiles.slice(),
      flags: {
        enableWasmBindgen: !!getEl('enableWasmBindgen') ? !!getEl('enableWasmBindgen').checked : true,
        enableOptimize: !!getEl('enableOptimize') ? !!getEl('enableOptimize').checked : true,
        enableJsLoader: !!getEl('enableJsLoader') ? !!getEl('enableJsLoader').checked : true
      }
    };
  }

  function lockUi(locked) {
    setDisabled('runBuildButton', locked);
    setDisabled('addSubFileButton', locked);
    setDisabled('clearAllButton', locked);
    setDisabled('downloadOutputButton', locked);
    setDisabled('downloadLogButton', locked);
    setDisabled('copyOutputButton', locked);
  }

  function getBuildRunner() {
    if (global.RustBuildController && typeof global.RustBuildController.runBuild === 'function') {
      return global.RustBuildController;
    }

    if (global.RustBuildEngine && typeof global.RustBuildEngine.runBuild === 'function') {
      return global.RustBuildEngine;
    }

    return null;
  }

  function runBuild() {
    if (state.isRunning) {
      showStatus('ビルド実行中です');
      return;
    }

    const runner = getBuildRunner();

    if (!runner) {
      showStatus('Rustビルド本体が見つかりません');
      showLog('RustBuildController.runBuild または RustBuildEngine.runBuild が未定義です。');
      clearSeparatedOutputs();
      return;
    }

    state.isRunning = true;
    lockUi(true);
    showStatus('ビルド中...');
    showLog('Rustビルドを開始します...');
    showOutput('');
    clearSeparatedOutputs();
    setHtml('buildSummary', '');

    try {
      const input = collectInput();
      const result = runner.runBuild(input);

      state.lastBuildResult = result;

      showLog(result.logText || '');
      showOutput(result.outputText || '');
      splitOutputFiles(result);
      setHtml('buildSummary', result.summaryHtml || '');

      if (result.ok) {
        showStatus('ビルド成功');
      } else {
        showStatus('ビルド失敗');
      }
    } catch (error) {
      state.lastBuildResult = null;
      showStatus('ビルド中に例外が発生しました');
      showLog(String(error && error.stack ? error.stack : error));
      showOutput('');
      clearSeparatedOutputs();
      setHtml('buildSummary', '');
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

    if (getEl('enableWasmBindgen')) getEl('enableWasmBindgen').checked = true;
    if (getEl('enableOptimize')) getEl('enableOptimize').checked = true;
    if (getEl('enableJsLoader')) getEl('enableJsLoader').checked = true;

    showLog('');
    showOutput('');
    clearSeparatedOutputs();
    setHtml('buildSummary', '');
    renderSubFiles();
    showStatus('初期化しました');
  }

  function downloadByAnchor(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
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

  function downloadOutput() {
    if (!state.lastBuildResult) {
      showStatus('保存する出力がありません');
      return;
    }

    const outputFiles = Array.isArray(state.lastBuildResult.outputFiles)
      ? state.lastBuildResult.outputFiles
      : [];

    if (!outputFiles.length) {
      showStatus('保存する出力がありません');
      return;
    }

    if (outputFiles.length === 1) {
      downloadByAnchor(
        outputFiles[0].name,
        outputFiles[0].content || '',
        outputFiles[0].type || 'text/plain;charset=utf-8'
      );
      showStatus('出力を保存しました');
      return;
    }

    const text = outputFiles.map(function (file) {
      return [
        '===== ' + file.name + ' =====',
        file.content || ''
      ].join('\n');
    }).join('\n\n');

    const projectName = (state.lastBuildResult.config && state.lastBuildResult.config.projectName) || 'rust-output';
    downloadByAnchor(projectName + '-bundle.txt', text, 'text/plain;charset=utf-8');
    showStatus('複数出力をまとめて保存しました');
  }

  function downloadLog() {
    if (!state.lastBuildResult || !state.lastBuildResult.logText) {
      showStatus('保存するログがありません');
      return;
    }

    const projectName = (state.lastBuildResult.config && state.lastBuildResult.config.projectName) || 'rust-build';
    downloadByAnchor(projectName + '-build-log.txt', state.lastBuildResult.logText, 'text/plain;charset=utf-8');
    showStatus('ログを保存しました');
  }

  async function copyOutput() {
    if (!state.lastBuildResult || !state.lastBuildResult.outputText) {
      showStatus('コピーする出力がありません');
      return;
    }

    try {
      await navigator.clipboard.writeText(state.lastBuildResult.outputText);
      showStatus('出力をコピーしました');
    } catch (error) {
      showStatus('コピーに失敗しました');
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

    if (addSubFileButton) addSubFileButton.addEventListener('click', addSubFile);
    if (runBuildButton) runBuildButton.addEventListener('click', runBuild);
    if (clearAllButton) clearAllButton.addEventListener('click', clearAll);
    if (downloadOutputButton) downloadOutputButton.addEventListener('click', downloadOutput);
    if (downloadLogButton) downloadLogButton.addEventListener('click', downloadLog);
    if (copyOutputButton) copyOutputButton.addEventListener('click', copyOutput);
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
        location.href = '../index.html';
      });
    }

    if (goTsPage) {
      goTsPage.addEventListener('click', function () {
        location.href = './ts-build.html';
      });
    }
  }

  function ensureOptionalFields() {
    if (!getEl('version')) {
      console.warn('version フィールドが見つかりません');
    }
    if (!getEl('edition')) {
      console.warn('edition フィールドが見つかりません');
    }
    if (!getEl('dependenciesText')) {
      console.warn('dependenciesText フィールドが見つかりません');
    }
    if (!getEl('featuresText')) {
      console.warn('featuresText フィールドが見つかりません');
    }
    if (!getEl('buildSummary')) {
      console.warn('buildSummary フィールドが見つかりません');
    }
    if (!getEl('downloadLogButton')) {
      console.warn('downloadLogButton が見つかりません');
    }
    if (!getEl('outputFileBuildLog')) {
      console.warn('outputFileBuildLog フィールドが見つかりません');
    }
    if (!getEl('outputFileBundle')) {
      console.warn('outputFileBundle フィールドが見つかりません');
    }
    if (!getEl('outputFileWasm')) {
      console.warn('outputFileWasm フィールドが見つかりません');
    }
    if (!getEl('outputFileLoaderJs')) {
      console.warn('outputFileLoaderJs フィールドが見つかりません');
    }
    if (!getEl('outputFileExampleJs')) {
      console.warn('outputFileExampleJs フィールドが見つかりません');
    }
  }

  function init() {
    ensureOptionalFields();
    bindButtons();
    bindSubFileActions();
    bindNavigation();
    renderSubFiles();
    clearSeparatedOutputs();
    showStatus('準備完了');
  }

  init();
})(window);