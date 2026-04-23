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

  function safeValue(id, fallback = '') {
    const el = getEl(id);
    if (!el) return fallback;
    return typeof el.value === 'string' ? el.value : fallback;
  }

  function setValue(id, value) {
    const el = getEl(id);
    if (el) {
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
    setText('buildStatus', '状態: ' + message);
  }

  function showLog(text) {
    const el = getEl('buildLog');
    if (!el) return;

    if ('value' in el) {
      el.value = text || '';
      return;
    }

    el.textContent = text || '';
  }

  function showOutput(text) {
    const el = getEl('buildOutput');
    if (!el) return;

    if ('value' in el) {
      el.value = text || '';
      return;
    }

    el.textContent = text || '';
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
        `    <button type="button" class="btn btn-muted" data-action="view-sub-file" data-index="${index}">表示</button>`,
        `    <button type="button" class="btn btn-danger" data-action="remove-sub-file" data-index="${index}">削除</button>`,
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

  function collectInput() {
    return {
      projectName: safeValue('projectName', 'sample-rust-project').trim(),
      entryPoint: safeValue('entryType', 'lib.rs').trim(),
      outputMode: normalizeOutputMode(safeValue('outputMode', 'wasm-js').trim()),
      buildMode: safeValue('buildMode', 'release').trim(),
      crateType: safeValue('crateType', 'cdylib').trim(),
      version: safeValue('version', '0.1.0').trim() || '0.1.0',
      edition: safeValue('edition', '2021').trim() || '2021',
      dependenciesText: readDependenciesText(),
      featuresText: safeValue('featuresText', ''),
      cargoTomlText: safeValue('cargoToml', ''),
      mainRustCode: safeValue('mainRustCode', ''),
      subFiles: state.subFiles.slice()
    };
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

  function runBuild() {
    if (state.isRunning) {
      showStatus('ビルド実行中です');
      return;
    }

    if (!global.RustBuildController || typeof global.RustBuildController.runBuild !== 'function') {
      showStatus('RustBuildController が見つかりません');
      showLog('RustBuildController.runBuild が未定義です。');
      return;
    }

    state.isRunning = true;
    lockUi(true);
    showStatus('ビルド中...');
    showLog('Rustビルドを開始します...');
    showOutput('');
    setHtml('buildSummary', '');

    try {
      const input = collectInput();
      const result = global.RustBuildController.runBuild(input);

      state.lastBuildResult = result;

      showLog(result.logText || '');
      showOutput(result.outputText || '');
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
      setHtml('buildSummary', '');
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
    setValue('dependenciesText', 'wasm-bindgen = "0.2"');
    setValue('featuresText', '');
    setValue('mainRustCode', [
      'use wasm_bindgen::prelude::*;',
      '',
      '#[wasm_bindgen]',
      'pub fn greet() -> String {',
      '    "hello wasm".to_string()',
      '}'
    ].join('\n'));
    setValue('subFileName', '');
    setValue('subFileCode', '');
    showLog('');
    showOutput('');
    setHtml('buildSummary', '');
    renderSubFiles();
    showStatus('初期化しました');
  }

  function downloadOutput() {
    if (!state.lastBuildResult || !state.lastBuildResult.outputText) {
      showStatus('保存する出力がありません');
      return;
    }

    if (global.RustBuildEngine && typeof global.RustBuildEngine.downloadTextFile === 'function') {
      const projectName = (state.lastBuildResult.config && state.lastBuildResult.config.projectName) || 'rust-output';
      global.RustBuildEngine.downloadTextFile(projectName + '-output.txt', state.lastBuildResult.outputText);
      showStatus('出力を保存しました');
      return;
    }

    showStatus('保存機能が見つかりません');
  }

  function downloadLog() {
    if (!state.lastBuildResult || !state.lastBuildResult.logText) {
      showStatus('保存するログがありません');
      return;
    }

    if (global.RustBuildEngine && typeof global.RustBuildEngine.downloadTextFile === 'function') {
      const projectName = (state.lastBuildResult.config && state.lastBuildResult.config.projectName) || 'rust-build';
      global.RustBuildEngine.downloadTextFile(projectName + '-build-log.txt', state.lastBuildResult.logText);
      showStatus('ログを保存しました');
      return;
    }

    showStatus('保存機能が見つかりません');
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

  function ensureMissingFields() {
    if (!getEl('version')) {
      console.warn('version フィールドが見つかりません');
    }
    if (!getEl('edition')) {
      console.warn('edition フィールドが見つかりません');
    }
    if (!getEl('buildSummary')) {
      console.warn('buildSummary フィールドが見つかりません');
    }
    if (!getEl('downloadLogButton')) {
      console.warn('downloadLogButton フィールドが見つかりません');
    }
  }

  function init() {
    ensureMissingFields();
    bindButtons();
    bindSubFileActions();
    bindNavigation();
    renderSubFiles();
    showStatus('準備完了');
  }

  init();
})(window);