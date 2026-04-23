(function (global) {
  'use strict';

  const fileStore = global.RustFileManager
    ? global.RustFileManager.createStore()
    : { files: [] };

  const state = {
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
    if (!el) return;
    el.value = value;
  }

  function setText(id, text) {
    const el = getEl(id);
    if (!el) return;
    el.textContent = text;
  }

  function setHtml(id, html) {
    const el = getEl(id);
    if (!el) return;
    el.innerHTML = html;
  }

  function setDisabled(id, disabled) {
    const el = getEl(id);
    if (!el) return;
    el.disabled = !!disabled;
  }

  function setChecked(id, checked) {
    const el = getEl(id);
    if (!el) return;
    el.checked = !!checked;
  }

  function getChecked(id) {
    const el = getEl(id);
    return !!(el && el.checked);
  }

  function showStatus(message) {
    setText('buildStatus', '状態: ' + message);
  }

  function showLog(text) {
    const el = getEl('buildLog');
    if (!el) return;
    el.textContent = text || '';
  }

  function showOutput(text) {
    const el = getEl('buildOutput');
    if (!el) return;
    el.textContent = text || '';
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getSubFiles() {
    if (global.RustFileManager && typeof global.RustFileManager.listFiles === 'function') {
      return global.RustFileManager.listFiles(fileStore);
    }
    return Array.isArray(fileStore.files) ? fileStore.files.slice() : [];
  }

  function renderSubFiles() {
    const target = getEl('subFilesList');
    if (!target) return;

    const files = getSubFiles();

    if (!files.length) {
      target.innerHTML = [
        '<div class="file-item">',
        '  <span>補助Rustファイルはまだ追加されていません</span>',
        '  <span>-</span>',
        '</div>'
      ].join('');
      return;
    }

    const html = files.map(function (file, index) {
      return [
        '<div class="file-item">',
        `  <span>${escapeHtml(file.name)}</span>`,
        '  <div class="file-item-actions">',
        `    <button type="button" class="btn btn-muted" data-action="view" data-index="${index}">表示</button>`,
        `    <button type="button" class="btn btn-danger" data-action="remove" data-index="${index}">削除</button>`,
        '  </div>',
        '</div>'
      ].join('');
    }).join('');

    target.innerHTML = html;
  }

  function addSubFile() {
    const name = safeValue('subFileName', '').trim();
    const content = safeValue('subFileCode', '');

    if (!global.RustFileManager || typeof global.RustFileManager.addFile !== 'function') {
      showStatus('補助ファイル管理モジュールが見つかりません');
      return;
    }

    const result = global.RustFileManager.addFile(fileStore, name, content);

    if (!result.ok) {
      showStatus(result.message || '補助ファイル追加に失敗しました');
      return;
    }

    setValue('subFileName', '');
    setValue('subFileCode', '');
    renderSubFiles();
    showStatus(result.message || '補助ファイルを追加しました');
  }

  function removeSubFile(index) {
    if (!global.RustFileManager || typeof global.RustFileManager.removeFile !== 'function') {
      showStatus('補助ファイル管理モジュールが見つかりません');
      return;
    }

    const result = global.RustFileManager.removeFile(fileStore, index);

    if (!result.ok) {
      showStatus(result.message || '補助ファイル削除に失敗しました');
      return;
    }

    renderSubFiles();
    showStatus(result.message || '補助ファイルを削除しました');
  }

  function viewSubFile(index) {
    if (!global.RustFileManager || typeof global.RustFileManager.getFile !== 'function') {
      showStatus('補助ファイル管理モジュールが見つかりません');
      return;
    }

    const result = global.RustFileManager.getFile(fileStore, index);

    if (!result.ok || !result.file) {
      showStatus(result.message || '補助ファイル取得に失敗しました');
      return;
    }

    setValue('subFileName', result.file.name || '');
    setValue('subFileCode', result.file.content || '');
    showStatus('補助ファイルを入力欄へ表示しました');
  }

  function collectInput() {
    return {
      projectName: safeValue('projectName', 'sample-rust-project').trim() || 'sample-rust-project',
      entryPoint: safeValue('entryType', 'lib.rs'),
      outputMode: safeValue('outputMode', 'wasm-js'),
      buildMode: safeValue('buildMode', 'release'),
      crateType: safeValue('crateType', 'cdylib'),
      version: '0.1.0',
      edition: '2021',
      cargoTomlText: safeValue('cargoToml', ''),
      dependenciesText: extractDependenciesText(safeValue('cargoToml', '')),
      featuresText: '',
      mainRustCode: safeValue('mainRustCode', ''),
      useWasmBindgen: getChecked('enableWasmBindgen'),
      optimize: getChecked('enableOptimize'),
      useJsLoader: getChecked('enableJsLoader'),
      subFiles: getSubFiles()
    };
  }

  function extractDependenciesText(cargoTomlText) {
    const text = String(cargoTomlText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n');

    let inDependencies = false;
    const collected = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        if (inDependencies) {
          collected.push('');
        }
        continue;
      }

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        if (trimmed === '[dependencies]') {
          inDependencies = true;
          continue;
        }

        if (inDependencies) {
          break;
        }
      }

      if (inDependencies) {
        collected.push(line);
      }
    }

    const normalized = collected.join('\n').trim();
    return normalized || 'wasm-bindgen = "0.2"';
  }

  function lockUi(locked) {
    setDisabled('addSubFileButton', locked);
    setDisabled('runBuildButton', locked);
    setDisabled('clearAllButton', locked);
    setDisabled('downloadOutputButton', locked);
    setDisabled('copyOutputButton', locked);
  }

  function runBuild() {
    if (state.isRunning) {
      showStatus('ビルド実行中です');
      return;
    }

    if (!global.RustBuildEngine || typeof global.RustBuildEngine.runBuild !== 'function') {
      showStatus('Rustビルドエンジンが見つかりません');
      return;
    }

    state.isRunning = true;
    lockUi(true);
    showStatus('ビルド実行中');

    try {
      const input = collectInput();
      const result = global.RustBuildEngine.runBuild(input);

      state.lastBuildResult = result;

      showLog(result.logText || '');
      showOutput(result.outputText || '');

      if (result.summaryHtml) {
        setHtml('buildSummary', result.summaryHtml);
      }

      if (result.ok) {
        showStatus('ビルド成功');
      } else {
        showStatus('ビルド失敗');
      }
    } catch (error) {
      state.lastBuildResult = null;
      showLog(String(error && error.stack ? error.stack : error));
      showOutput('');
      setHtml('buildSummary', '');
      showStatus('ビルド中に例外が発生');
    } finally {
      state.isRunning = false;
      lockUi(false);
    }
  }

  function clearAll() {
    if (global.RustFileManager && typeof global.RustFileManager.clearFiles === 'function') {
      global.RustFileManager.clearFiles(fileStore);
    } else {
      fileStore.files = [];
    }

    state.lastBuildResult = null;

    setValue('projectName', 'sample-rust-project');
    setValue('entryType', 'lib.rs');
    setValue('outputMode', 'wasm-js');
    setValue('buildMode', 'release');
    setValue('crateType', 'cdylib');
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

    setChecked('enableWasmBindgen', true);
    setChecked('enableOptimize', true);
    setChecked('enableJsLoader', true);

    showLog('まだ実行されていません。');
    showOutput('まだ出力はありません。');
    setHtml('buildSummary', '');
    renderSubFiles();
    showStatus('入力を初期化しました');
  }

  function downloadOutput() {
    if (!state.lastBuildResult || !state.lastBuildResult.outputText) {
      showStatus('保存できる出力がありません');
      return;
    }

    if (!global.RustBuildEngine || typeof global.RustBuildEngine.downloadTextFile !== 'function') {
      showStatus('保存機能が見つかりません');
      return;
    }

    const projectName = state.lastBuildResult.config && state.lastBuildResult.config.projectName
      ? state.lastBuildResult.config.projectName
      : 'rust-build-output';

    global.RustBuildEngine.downloadTextFile(projectName + '.txt', state.lastBuildResult.outputText);
    showStatus('出力を保存しました');
  }

  async function copyOutput() {
    if (!state.lastBuildResult || !state.lastBuildResult.outputText) {
      showStatus('コピーできる出力がありません');
      return;
    }

    try {
      await navigator.clipboard.writeText(state.lastBuildResult.outputText);
      showStatus('出力をコピーしました');
    } catch (error) {
      showStatus('コピーに失敗しました');
    }
  }

  function bindButtons() {
    const addSubFileButton = getEl('addSubFileButton');
    const runBuildButton = getEl('runBuildButton');
    const clearAllButton = getEl('clearAllButton');
    const downloadOutputButton = getEl('downloadOutputButton');
    const copyOutputButton = getEl('copyOutputButton');

    if (addSubFileButton) {
      addSubFileButton.addEventListener('click', addSubFile);
    }

    if (runBuildButton) {
      runBuildButton.addEventListener('click', runBuild);
    }

    if (clearAllButton) {
      clearAllButton.addEventListener('click', clearAll);
    }

    if (downloadOutputButton) {
      downloadOutputButton.addEventListener('click', downloadOutput);
    }

    if (copyOutputButton) {
      copyOutputButton.addEventListener('click', copyOutput);
    }
  }

  function bindSubFileActions() {
    const list = getEl('subFilesList');
    if (!list) return;

    list.addEventListener('click', function (event) {
      const target = event.target;
      if (!target) return;

      const button = target.closest('[data-action]');
      if (!button) return;

      const action = button.getAttribute('data-action');
      const index = Number(button.getAttribute('data-index'));

      if (Number.isNaN(index)) return;

      if (action === 'view') {
        viewSubFile(index);
        return;
      }

      if (action === 'remove') {
        removeSubFile(index);
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

  function init() {
    bindButtons();
    bindSubFileActions();
    bindNavigation();
    renderSubFiles();
    showStatus('準備完了');
  }

  init();
})(window);