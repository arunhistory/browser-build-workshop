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

  function hasEl(id) {
    return !!getEl(id);
  }

  function safeValue(id, fallback = '') {
    const el = getEl(id);
    if (!el) return fallback;
    return typeof el.value === 'string' ? el.value : fallback;
  }

  function safeChecked(id, fallback = false) {
    const el = getEl(id);
    if (!el || typeof el.checked !== 'boolean') return fallback;
    return el.checked;
  }

  function setValue(id, value) {
    const el = getEl(id);
    if (el && 'value' in el) {
      el.value = value;
    }
  }

  function setText(id, text) {
    const el = getEl(id);
    if (el) {
      el.textContent = text;
    }
  }

  function setHtml(id, html) {
    const el = getEl(id);
    if (el) {
      el.innerHTML = html;
    }
  }

  function setDisabled(id, disabled) {
    const el = getEl(id);
    if (el) {
      el.disabled = !!disabled;
    }
  }

  function showStatus(message) {
    setText('buildStatus', message);
  }

  function showLog(text) {
    setValue('buildLog', text || '');
  }

  function showOutput(text) {
    setValue('buildOutput', text || '');
  }

  function readSubFileName() {
    return safeValue('subFileName').trim();
  }

  function readSubFileContent() {
    return safeValue('subFileCode');
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

    const html = state.subFiles.map(function (file, index) {
      const safeName = escapeHtml(file.name);
      return [
        '<div class="file-item">',
        `  <div><strong>${safeName}</strong></div>`,
        `  <div>文字数: ${file.content.length}</div>`,
        '  <div class="file-item-actions">',
        `    <button type="button" data-action="view-sub-file" data-index="${index}">表示</button>`,
        `    <button type="button" data-action="remove-sub-file" data-index="${index}">削除</button>`,
        '  </div>',
        '</div>'
      ].join('');
    }).join('');

    target.innerHTML = html;
  }

  function addSubFile() {
    const name = readSubFileName();
    const content = readSubFileContent();

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

  function readDependenciesText() {
    const dependenciesArea = getEl('dependenciesText');
    if (dependenciesArea) {
      return dependenciesArea.value || '';
    }

    const cargoToml = safeValue('cargoToml', '');
    const marker = '[dependencies]';
    const idx = cargoToml.indexOf(marker);

    if (idx === -1) {
      return 'wasm-bindgen = "0.2"';
    }

    const slice = cargoToml.slice(idx + marker.length).trim();
    if (!slice) {
      return 'wasm-bindgen = "0.2"';
    }

    return slice;
  }

  function normalizeOutputMode(raw) {
    if (raw === 'wasm-only') return 'wasm-only';
    if (raw === 'js-only') return 'js-only';
    return 'wasm-js';
  }

  function applyCheckboxesToOutputMode(rawMode) {
    const enableJsLoader = safeChecked('enableJsLoader', true);

    if (!enableJsLoader && rawMode === 'wasm-js') {
      return 'wasm-only';
    }

    return rawMode;
  }

  function collectInput() {
    const rawOutputMode = normalizeOutputMode(safeValue('outputMode', 'wasm-js').trim());

    return {
      projectName: safeValue('projectName', 'sample-rust-project').trim() || 'sample-rust-project',
      entryPoint: safeValue('entryType', 'lib.rs').trim() || 'lib.rs',
      outputMode: applyCheckboxesToOutputMode(rawOutputMode),
      buildMode: safeValue('buildMode', 'release').trim() || 'release',
      crateType: safeValue('crateType', 'cdylib').trim() || 'cdylib',
      version: safeValue('version', '0.1.0').trim() || '0.1.0',
      edition: safeValue('edition', '2021').trim() || '2021',
      dependenciesText: readDependenciesText(),
      featuresText: safeValue('featuresText', ''),
      cargoTomlText: safeValue('cargoToml', ''),
      mainRustCode: safeValue('mainRustCode', ''),
      subFiles: state.subFiles.slice(),
      flags: {
        enableWasmBindgen: safeChecked('enableWasmBindgen', true),
        enableOptimize: safeChecked('enableOptimize', true),
        enableJsLoader: safeChecked('enableJsLoader', true)
      }
    };
  }

  function makeFallbackSummary(result) {
    const projectName = escapeHtml(result && result.config && result.config.projectName ? result.config.projectName : 'unknown');
    const mode = escapeHtml(result && result.config && result.config.buildMode ? result.config.buildMode : '-');
    const outputMode = escapeHtml(result && result.config && result.config.outputMode ? result.config.outputMode : '-');
    const okText = result && result.ok ? '成功' : '失敗';

    return [
      '<div><strong>結果:</strong> ' + okText + '</div>',
      '<div><strong>プロジェクト名:</strong> ' + projectName + '</div>',
      '<div><strong>ビルドモード:</strong> ' + mode + '</div>',
      '<div><strong>出力形式:</strong> ' + outputMode + '</div>'
    ].join('');
  }

  function runBuild() {
    if (state.isRunning) {
      showStatus('ビルド実行中です');
      return;
    }

    if (!global.RustBuildEngine || typeof global.RustBuildEngine.runBuild !== 'function') {
      showStatus('RustBuildEngine が見つかりません');
      showLog('RustBuildEngine.runBuild が未定義です。');
      return;
    }

    state.isRunning = true;
    lockUi(true);
    showStatus('ビルド中...');
    showLog('Rustビルドを開始します...');
    showOutput('');
    setHtml('buildSummary', 'ビルド実行中です...');

    try {
      const input = collectInput();
      const result = global.RustBuildEngine.runBuild(input);

      state.lastBuildResult = result;

      showLog(result.logText || '');
      showOutput(result.outputText || '');

      if (result.summaryHtml) {
        setHtml('buildSummary', result.summaryHtml);
      } else {
        setHtml('buildSummary', makeFallbackSummary(result));
      }

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
      setHtml('buildSummary', 'ビルド結果の表示に失敗しました。');
    } finally {
      state.isRunning = false;
      lockUi(false);
    }
  }

  function lockUi(locked) {
    setDisabled('runBuildButton', locked);
    setDisabled('addSubFileButton', locked);
    setDisabled('clearAllButton', locked);
    setDisabled('downloadOutputButton', locked);
    setDisabled('downloadLogButton', locked);
    setDisabled('copyOutputButton', locked);
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

    const wasmBindgenEl = getEl('enableWasmBindgen');
    const optimizeEl = getEl('enableOptimize');
    const jsLoaderEl = getEl('enableJsLoader');

    if (wasmBindgenEl) wasmBindgenEl.checked = true;
    if (optimizeEl) optimizeEl.checked = true;
    if (jsLoaderEl) jsLoaderEl.checked = true;

    showLog('まだ実行されていません。');
    showOutput('まだ出力はありません。');
    setHtml('buildSummary', 'まだビルド結果はありません。');
    renderSubFiles();
    showStatus('初期化しました');
  }

  function engineDownloadTextFile(filename, text) {
    if (global.RustBuildEngine && typeof global.RustBuildEngine.downloadTextFile === 'function') {
      global.RustBuildEngine.downloadTextFile(filename, text);
      return true;
    }

    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      showLog(String(error && error.stack ? error.stack : error));
      return false;
    }
  }

  function downloadOutput() {
    if (!state.lastBuildResult || !state.lastBuildResult.outputText) {
      showStatus('保存する出力がありません');
      return;
    }

    const projectName = (state.lastBuildResult.config && state.lastBuildResult.config.projectName) || 'rust-output';
    const ok = engineDownloadTextFile(projectName + '-output.txt', state.lastBuildResult.outputText);

    if (ok) {
      showStatus('出力を保存しました');
    } else {
      showStatus('出力の保存に失敗しました');
    }
  }

  function downloadLog() {
    if (!state.lastBuildResult || !state.lastBuildResult.logText) {
      showStatus('保存するログがありません');
      return;
    }

    const projectName = (state.lastBuildResult.config && state.lastBuildResult.config.projectName) || 'rust-build';
    const ok = engineDownloadTextFile(projectName + '-build-log.txt', state.lastBuildResult.logText);

    if (ok) {
      showStatus('ログを保存しました');
    } else {
      showStatus('ログの保存に失敗しました');
    }
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
      const indexText = target.getAttribute('data-index');
      const index = Number(indexText);

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

  function ensureFields() {
    const required = [
      'projectName',
      'entryType',
      'outputMode',
      'buildMode',
      'crateType',
      'version',
      'edition',
      'dependenciesText',
      'featuresText',
      'cargoToml',
      'mainRustCode',
      'subFileName',
      'subFileCode',
      'subFilesList',
      'buildStatus',
      'buildLog',
      'buildOutput',
      'buildSummary',
      'addSubFileButton',
      'runBuildButton',
      'clearAllButton',
      'downloadOutputButton',
      'downloadLogButton',
      'copyOutputButton'
    ];

    required.forEach(function (id) {
      if (!hasEl(id)) {
        console.warn(id + ' が見つかりません');
      }
    });
  }

  function init() {
    ensureFields();
    bindButtons();
    bindSubFileActions();
    bindNavigation();
    renderSubFiles();
    showStatus('準備完了');
  }

  init();
})(window);