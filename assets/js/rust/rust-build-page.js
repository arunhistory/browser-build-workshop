(function (global) {
  'use strict';

  const OUTPUT_DIR = './rust-output/';
  const MANIFEST_PATH = OUTPUT_DIR + 'page-manifest.json';

  const state = {
    subFiles: [],
    lastBuildResult: null,
    loadedArtifact: null,
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

  function setTextareaOrText(id, value) {
    const el = getEl(id);
    if (!el) return;

    if ('value' in el) {
      el.value = value || '';
      return;
    }

    el.textContent = value || '';
  }

  function normalizeLineBreaks(text) {
    return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function trimOrEmpty(text) {
    return normalizeLineBreaks(text).trim();
  }

  function normalizeOutputMode(raw) {
    if (raw === 'wasm-only') return 'wasm-only';
    if (raw === 'js-only') return 'js-only';
    return 'wasm-js';
  }

  function normalizeBuildMode(raw) {
    if (raw === 'debug') return 'debug';
    return 'release';
  }

  function normalizeEdition(raw) {
    const value = trimOrEmpty(raw || '2021');
    if (['2015', '2018', '2021', '2024'].includes(value)) return value;
    return '2021';
  }

  function normalizeProjectName(raw) {
    const value = trimOrEmpty(raw || 'sample-rust-project') || 'sample-rust-project';

    const normalized = value
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return normalized || 'sample-rust-project';
  }

  function normalizeEntryPoint(raw) {
    const value = trimOrEmpty(raw || 'lib.rs') || 'lib.rs';

    if (value === 'lib.rs') return 'src/lib.rs';
    if (value === 'main.rs') return 'src/main.rs';
    if (value.startsWith('/')) return value.slice(1);
    if (value.startsWith('src/')) return value;

    return 'src/' + value;
  }

  function inferEntryTarget(entryPoint) {
    const value = normalizeEntryPoint(entryPoint).toLowerCase();
    if (value.endsWith('main.rs')) return 'main';
    return 'lib';
  }

  function normalizeCrateType(raw, entryPoint) {
    const entryTarget = inferEntryTarget(entryPoint);

    if (entryTarget === 'main') {
      return 'bin';
    }

    const value = trimOrEmpty(raw || 'cdylib').toLowerCase();

    if (['cdylib', 'rlib', 'staticlib', 'dylib'].includes(value)) {
      return value;
    }

    return 'cdylib';
  }

  function normalizeSubFilePath(raw) {
    const value = trimOrEmpty(raw).replace(/\\/g, '/').replace(/^\/+/, '');

    if (!value) return '';
    if (value.includes('..')) return '';

    if (value.startsWith('src/')) return value;
    return 'src/' + value;
  }

  function escapeHtml(text) {
    return String(text || '')
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
    setTextareaOrText('buildLog', text || '');
  }

  function showOutput(text) {
    setTextareaOrText('buildOutput', text || '');
  }

  function showEmbeddedLoader(text) {
    setTextareaOrText('embeddedLoaderOutput', text || '');
  }

  function setLabelTextByFor(forId, text) {
    const label = document.querySelector('label[for="' + forId + '"]');
    if (label) {
      label.textContent = text;
    }
  }

  function getExpectedArtifactNames(projectName) {
    const baseName = normalizeProjectName(projectName || safeValue('projectName', 'sample-rust-project'));

    return {
      wasm: baseName + '.wasm',
      wasmBase64: baseName + '.base64',
      bindgenJs: baseName + '.bindgen.js',
      loaderJs: baseName + '.loader.js',
      embeddedLoaderJs: baseName + '.embedded-loader.js',
      zip: baseName + '-wasm-build.zip',
      buildLog: 'build-log.txt',
      outputSummary: 'output-summary.txt',
      pageManifest: 'page-manifest.json'
    };
  }

  function clearGeneratedOutputs() {
    const names = getExpectedArtifactNames();

    state.loadedArtifact = null;

    setLabelTextByFor('embeddedLoaderOutput', names.embeddedLoaderJs);

    showOutput('まだ出力はありません。');
    showEmbeddedLoader('GitHub Actions 実行後、成果物を読み込むとここに embedded-loader.js が表示されます。');
    setHtml('buildSummary', 'まだ要約はありません。');

    const zipNotice = getEl('zipNotice');
    if (zipNotice) {
      zipNotice.textContent = 'GitHub Actions 実行後、成果物ZIPをここからダウンロードできます。';
    }
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
    const rawName = readSubFileName();
    const content = readSubFileCode();
    const normalizedPath = normalizeSubFilePath(rawName);

    if (!rawName) {
      showStatus('補助ファイル名を入れてください');
      return;
    }

    if (!normalizedPath) {
      showStatus('補助ファイル名に危険な文字または不正なパスがあります');
      return;
    }

    if (!normalizedPath.endsWith('.rs')) {
      showStatus('補助ファイル名は .rs で終わる必要があります');
      return;
    }

    if (!content.trim()) {
      showStatus('補助ファイルの中身が空です');
      return;
    }

    const exists = state.subFiles.some(function (file) {
      return file.name === normalizedPath;
    });

    if (exists) {
      showStatus('同じ名前の補助ファイルは追加できません');
      return;
    }

    state.subFiles.push({
      id: 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      name: normalizedPath,
      content: normalizeLineBreaks(content)
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
    const entryPoint = normalizeEntryPoint(safeValue('entryType', 'lib.rs'));
    const projectName = normalizeProjectName(safeValue('projectName', 'sample-rust-project'));

    return {
      buildId: 'rust-build-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
      projectName: projectName,
      entryPoint: entryPoint,
      outputMode: normalizeOutputMode(safeValue('outputMode', 'wasm-js').trim()),
      buildMode: normalizeBuildMode(safeValue('buildMode', 'release').trim()),
      crateType: normalizeCrateType(safeValue('crateType', 'cdylib'), entryPoint),
      version: safeValue('version', '0.1.0').trim() || '0.1.0',
      edition: normalizeEdition(safeValue('edition', '2021')),
      dependenciesText: normalizeLineBreaks(safeValue('dependenciesText', '')),
      featuresText: normalizeLineBreaks(safeValue('featuresText', '')),
      cargoTomlText: normalizeLineBreaks(safeValue('cargoToml', '')),
      mainRustCode: normalizeLineBreaks(safeValue('mainRustCode', '')),
      subFiles: state.subFiles.map(function (file) {
        return {
          name: file.name,
          content: normalizeLineBreaks(file.content || '')
        };
      }),
      flags: {
        enableWasmBindgen: !!getEl('enableWasmBindgen') ? !!getEl('enableWasmBindgen').checked : true,
        enableOptimize: !!getEl('enableOptimize') ? !!getEl('enableOptimize').checked : true,
        enableJsLoader: !!getEl('enableJsLoader') ? !!getEl('enableJsLoader').checked : true
      }
    };
  }

  function createBuildRequest(input) {
    return {
      build: {
        buildId: input.buildId,
        projectName: input.projectName,
        version: input.version,
        edition: input.edition,
        entryPoint: input.entryPoint,
        outputMode: input.outputMode,
        buildMode: input.buildMode,
        crateType: input.crateType,
        dependenciesText: input.dependenciesText,
        featuresText: input.featuresText,
        mainRustCode: input.mainRustCode,
        subFiles: input.subFiles,
        flags: input.flags
      }
    };
  }

  function validateBuildRequest(input) {
    const errors = [];
    const warnings = [];

    if (!input.projectName) {
      errors.push('projectName が空です。');
    }

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(input.projectName)) {
      errors.push('projectName は英小文字・数字・ハイフンのみで指定してください。');
    }

    if (!/^\d+\.\d+\.\d+$/.test(input.version)) {
      errors.push('version は 0.1.0 の形式にしてください。');
    }

    if (!input.entryPoint.endsWith('.rs')) {
      errors.push('entryPoint は .rs ファイルにしてください。');
    }

    if (!input.mainRustCode.trim()) {
      errors.push('メインRustコードが空です。');
    }

    if (inferEntryTarget(input.entryPoint) === 'main') {
      warnings.push('main.rs は bin 扱いです。wasmライブラリ化したい場合は lib.rs を使ってください。');
    }

    if (input.outputMode === 'js-only') {
      warnings.push('js-only は .wasm を出力しません。本物のwasm生成確認には wasm-js または wasm-only を使ってください。');
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }

  function makeHowToRunText(buildRequest, names) {
    return [
      'GitHub Actions 手動実行手順',
      '',
      '1. GitHub の対象リポジトリを開く',
      '2. Actions を開く',
      '3. Rust Wasm Build を選ぶ',
      '4. Run workflow を押す',
      '5. buildRequestJson に、このJSONをそのまま貼り付ける',
      '6. 実行後、Artifacts から ' + names.zip + ' を取得する',
      '',
      'ページ側で読む成果物:',
      '- app/rust-output/page-manifest.json',
      '- app/rust-output/build-log.txt',
      '- app/rust-output/output-summary.txt',
      '- app/rust-output/' + names.embeddedLoaderJs,
      '- app/rust-output/' + names.zip,
      '',
      'buildRequestJson:',
      JSON.stringify(buildRequest, null, 2)
    ].join('\n');
  }

  function makeLocalBuildRequestResult(input) {
    const validation = validateBuildRequest(input);
    const buildRequest = createBuildRequest(input);
    const jsonText = JSON.stringify(buildRequest, null, 2);
    const names = getExpectedArtifactNames(input.projectName);
    const howToRunText = makeHowToRunText(buildRequest, names);

    const logLines = [];

    logLines.push('Rust本物ビルド用の buildRequestJson を生成しました。');
    logLines.push('');
    logLines.push('status: ' + (validation.ok ? 'ready' : 'error'));
    logLines.push('buildId: ' + input.buildId);
    logLines.push('projectName: ' + input.projectName);
    logLines.push('entryPoint: ' + input.entryPoint);
    logLines.push('buildMode: ' + input.buildMode);
    logLines.push('crateType: ' + input.crateType);
    logLines.push('outputMode: ' + input.outputMode);
    logLines.push('');
    logLines.push('expectedArtifacts:');
    logLines.push('- ' + names.wasm);
    logLines.push('- ' + names.wasmBase64);
    logLines.push('- ' + names.bindgenJs);
    logLines.push('- ' + names.loaderJs);
    logLines.push('- ' + names.embeddedLoaderJs);
    logLines.push('- ' + names.zip);
    logLines.push('');

    logLines.push('errors:');
    if (validation.errors.length) {
      validation.errors.forEach(function (item) {
        logLines.push('- ' + item);
      });
    } else {
      logLines.push('- なし');
    }

    logLines.push('');
    logLines.push('warnings:');
    if (validation.warnings.length) {
      validation.warnings.forEach(function (item) {
        logLines.push('- ' + item);
      });
    } else {
      logLines.push('- なし');
    }

    const summaryHtml = [
      '<div class="rust-real-compile-summary">',
      '<p><strong>状態:</strong> ' + escapeHtml(validation.ok ? 'GitHub Actions投入準備完了' : '入力エラーあり') + '</p>',
      '<p><strong>buildId:</strong> ' + escapeHtml(input.buildId) + '</p>',
      '<p><strong>project:</strong> ' + escapeHtml(input.projectName) + '</p>',
      '<p><strong>entry:</strong> ' + escapeHtml(input.entryPoint) + '</p>',
      '<p><strong>表示対象:</strong> GitHub Actions 実行後の ' + escapeHtml(names.embeddedLoaderJs) + '</p>',
      '<p><strong>ZIP:</strong> GitHub Actions 実行後の ' + escapeHtml(names.zip) + '</p>',
      '<p><strong>次の操作:</strong> buildRequestJson を GitHub Actions に貼り付けて実行してください。</p>',
      '</div>'
    ].join('');

    return {
      ok: validation.ok,
      status: validation.ok ? 'ready' : 'error',
      mode: 'github-actions-request',
      compileKind: 'github-actions-request',
      buildId: input.buildId,
      config: input,
      names: names,
      buildRequest: buildRequest,
      errors: validation.errors,
      warnings: validation.warnings,
      logText: logLines.join('\n'),
      outputText: jsonText,
      howToRunText: howToRunText,
      embeddedLoaderText: '',
      summaryHtml: summaryHtml
    };
  }

  function lockUi(locked) {
    setDisabled('runBuildButton', locked);
    setDisabled('addSubFileButton', locked);
    setDisabled('clearAllButton', locked);
    setDisabled('downloadOutputButton', locked);
    setDisabled('downloadLogButton', locked);
    setDisabled('copyOutputButton', locked);
    setDisabled('downloadZipButton', locked);
    setDisabled('copyEmbeddedLoaderButton', locked);
  }

  async function runBuild() {
    if (state.isRunning) {
      showStatus('ビルド要求を生成中です');
      return;
    }

    state.isRunning = true;
    lockUi(true);
    showStatus('ビルド要求を生成中...');
    showLog('Rust本物ビルド用の要求を生成します...');
    showOutput('');
    showEmbeddedLoader('');
    setHtml('buildSummary', '');

    try {
      const input = collectInput();
      const result = makeLocalBuildRequestResult(input);

      state.lastBuildResult = result;

      setLabelTextByFor('embeddedLoaderOutput', result.names.embeddedLoaderJs);

      showLog(result.logText || '');
      showOutput(result.outputText || '');
      showEmbeddedLoader('GitHub Actions 実行後、「成果物を読み込み」で本物の embedded-loader.js を表示します。');
      setHtml('buildSummary', result.summaryHtml || '');

      if (result.ok) {
        showStatus('GitHub Actions用JSONを生成しました');
      } else {
        showStatus('入力エラーがあります');
      }
    } catch (error) {
      state.lastBuildResult = null;
      showStatus('ビルド要求生成中に例外が発生しました');
      showLog(String(error && error.stack ? error.stack : error));
      showOutput('');
      showEmbeddedLoader('');
      setHtml('buildSummary', '');
    } finally {
      state.isRunning = false;
      lockUi(false);
    }
  }

  async function fetchTextFile(filePath) {
    const response = await fetch(filePath, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(filePath + ' を読み込めませんでした。HTTP ' + String(response.status));
    }

    return await response.text();
  }

  async function fetchJsonFile(filePath) {
    const text = await fetchTextFile(filePath);

    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(filePath + ' のJSON解析に失敗しました。');
    }
  }

  async function loadGeneratedArtifacts() {
    if (state.isRunning) {
      showStatus('処理中です');
      return;
    }

    state.isRunning = true;
    lockUi(true);
    showStatus('成果物を読み込み中...');

    try {
      const manifest = await fetchJsonFile(MANIFEST_PATH);

      if (!manifest || typeof manifest !== 'object') {
        throw new Error('page-manifest.json の形式が不正です。');
      }

      if (!manifest.ok) {
        const errorLogFile = manifest.buildLogFile || 'build-log.txt';
        const errorLog = await fetchTextFile(OUTPUT_DIR + errorLogFile);
        showLog(errorLog);
        showStatus('GitHub Actions側のビルドが失敗しています');
        return;
      }

      const buildLogFile = manifest.buildLogFile || 'build-log.txt';
      const outputSummaryFile = manifest.outputSummaryFile || 'output-summary.txt';
      const embeddedLoaderFile = manifest.embeddedLoaderFile;
      const zipFile = manifest.zipFile;

      if (!embeddedLoaderFile) {
        throw new Error('page-manifest.json に embeddedLoaderFile がありません。');
      }

      const buildLogText = await fetchTextFile(OUTPUT_DIR + buildLogFile);
      const outputSummaryText = await fetchTextFile(OUTPUT_DIR + outputSummaryFile);
      const embeddedLoaderText = await fetchTextFile(OUTPUT_DIR + embeddedLoaderFile);

      state.loadedArtifact = {
        manifest: manifest,
        buildLogFile: buildLogFile,
        outputSummaryFile: outputSummaryFile,
        embeddedLoaderFile: embeddedLoaderFile,
        zipFile: zipFile,
        buildLogText: buildLogText,
        outputSummaryText: outputSummaryText,
        embeddedLoaderText: embeddedLoaderText,
        zipUrl: zipFile ? OUTPUT_DIR + zipFile : ''
      };

      setLabelTextByFor('embeddedLoaderOutput', embeddedLoaderFile);

      showLog(buildLogText);
      showOutput(outputSummaryText);
      showEmbeddedLoader(embeddedLoaderText);

      const summaryHtml = [
        '<div class="rust-real-compile-summary">',
        '<p><strong>状態:</strong> 成果物読み込み完了</p>',
        '<p><strong>project:</strong> ' + escapeHtml(manifest.projectName || '-') + '</p>',
        '<p><strong>buildId:</strong> ' + escapeHtml(manifest.buildId || '-') + '</p>',
        '<p><strong>embedded-loader:</strong> ' + escapeHtml(embeddedLoaderFile) + '</p>',
        '<p><strong>zip:</strong> ' + escapeHtml(zipFile || '-') + '</p>',
        '</div>'
      ].join('');

      setHtml('buildSummary', summaryHtml);

      const zipNotice = getEl('zipNotice');
      if (zipNotice) {
        zipNotice.textContent = zipFile
          ? zipFile + ' をダウンロードできます。'
          : 'ZIPファイルが見つかりません。';
      }

      showStatus('成果物を読み込みました');
    } catch (error) {
      showStatus('成果物の読み込みに失敗しました');
      showLog(String(error && error.stack ? error.stack : error));
    } finally {
      state.isRunning = false;
      lockUi(false);
    }
  }

  function clearAll() {
    state.subFiles = [];
    state.lastBuildResult = null;
    state.loadedArtifact = null;

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
    clearGeneratedOutputs();
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
    if (state.loadedArtifact && state.loadedArtifact.outputSummaryText) {
      downloadByAnchor(
        state.loadedArtifact.outputSummaryFile || 'output-summary.txt',
        state.loadedArtifact.outputSummaryText,
        'text/plain;charset=utf-8'
      );

      showStatus('出力内容を保存しました');
      return;
    }

    if (state.lastBuildResult && state.lastBuildResult.outputText) {
      downloadByAnchor(
        'build-request.json',
        state.lastBuildResult.outputText,
        'application/json;charset=utf-8'
      );

      showStatus('build-request.json を保存しました');
      return;
    }

    showStatus('保存する出力がありません');
  }

  function downloadLog() {
    if (state.loadedArtifact && state.loadedArtifact.buildLogText) {
      downloadByAnchor(
        state.loadedArtifact.buildLogFile || 'build-log.txt',
        state.loadedArtifact.buildLogText,
        'text/plain;charset=utf-8'
      );

      showStatus('ビルドログを保存しました');
      return;
    }

    if (state.lastBuildResult && state.lastBuildResult.logText) {
      downloadByAnchor(
        'build-request-log.txt',
        state.lastBuildResult.logText,
        'text/plain;charset=utf-8'
      );

      showStatus('ログを保存しました');
      return;
    }

    showStatus('保存するログがありません');
  }

  function downloadZip() {
    if (!state.loadedArtifact || !state.loadedArtifact.zipUrl || !state.loadedArtifact.zipFile) {
      showStatus('ZIPはまだ読み込まれていません。先に成果物を読み込んでください。');
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = state.loadedArtifact.zipUrl;
    anchor.download = state.loadedArtifact.zipFile;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    showStatus('ZIPダウンロードを開始しました');
  }

  async function copyOutput() {
    const text =
      state.loadedArtifact && state.loadedArtifact.outputSummaryText
        ? state.loadedArtifact.outputSummaryText
        : state.lastBuildResult && state.lastBuildResult.outputText
          ? state.lastBuildResult.outputText
          : '';

    if (!text) {
      showStatus('コピーする出力がありません');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showStatus('出力をコピーしました');
    } catch (error) {
      showStatus('コピーに失敗しました');
      showLog(String(error && error.stack ? error.stack : error));
    }
  }

  async function copyEmbeddedLoader() {
    const text = state.loadedArtifact && state.loadedArtifact.embeddedLoaderText
      ? state.loadedArtifact.embeddedLoaderText
      : '';

    if (!text) {
      showStatus('コピーする embedded-loader.js がありません。先に成果物を読み込んでください。');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showStatus('embedded-loader.js をコピーしました');
    } catch (error) {
      showStatus('embedded-loader.js のコピーに失敗しました');
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
    const downloadZipButton = getEl('downloadZipButton');
    const copyEmbeddedLoaderButton = getEl('copyEmbeddedLoaderButton');

    if (addSubFileButton) addSubFileButton.addEventListener('click', addSubFile);
    if (runBuildButton) runBuildButton.addEventListener('click', runBuild);
    if (clearAllButton) clearAllButton.addEventListener('click', clearAll);
    if (downloadOutputButton) downloadOutputButton.addEventListener('click', downloadOutput);
    if (downloadLogButton) downloadLogButton.addEventListener('click', downloadLog);
    if (copyOutputButton) copyOutputButton.addEventListener('click', copyOutput);
    if (downloadZipButton) downloadZipButton.addEventListener('click', downloadZip);
    if (copyEmbeddedLoaderButton) copyEmbeddedLoaderButton.addEventListener('click', copyEmbeddedLoader);
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
        location.href = './index.html';
      });
    }

    if (goTsPage) {
      goTsPage.addEventListener('click', function () {
        location.href = './ts-build.html';
      });
    }
  }

  function bindProjectNamePreview() {
    const projectName = getEl('projectName');
    if (!projectName) return;

    projectName.addEventListener('input', function () {
      if (state.loadedArtifact) return;

      const names = getExpectedArtifactNames(projectName.value);
      setLabelTextByFor('embeddedLoaderOutput', names.embeddedLoaderJs);
    });
  }

  function addLoadArtifactsButtonIfMissing() {
    if (getEl('loadArtifactsButton')) return;

    const downloadZipButton = getEl('downloadZipButton');
    if (!downloadZipButton || !downloadZipButton.parentNode) return;

    const button = document.createElement('button');
    button.className = 'btn btn-secondary';
    button.id = 'loadArtifactsButton';
    button.type = 'button';
    button.textContent = '成果物を読み込み';
    button.addEventListener('click', loadGeneratedArtifacts);

    downloadZipButton.parentNode.insertBefore(button, downloadZipButton);
  }

  function ensureOptionalFields() {
    if (!getEl('version')) console.warn('version フィールドが見つかりません');
    if (!getEl('edition')) console.warn('edition フィールドが見つかりません');
    if (!getEl('dependenciesText')) console.warn('dependenciesText フィールドが見つかりません');
    if (!getEl('featuresText')) console.warn('featuresText フィールドが見つかりません');
    if (!getEl('buildSummary')) console.warn('buildSummary フィールドが見つかりません');
    if (!getEl('downloadLogButton')) console.warn('downloadLogButton が見つかりません');
    if (!getEl('embeddedLoaderOutput')) console.warn('embeddedLoaderOutput フィールドが見つかりません');
    if (!getEl('downloadZipButton')) console.warn('downloadZipButton が見つかりません');
    if (!getEl('copyEmbeddedLoaderButton')) console.warn('copyEmbeddedLoaderButton が見つかりません');
  }

  function init() {
    ensureOptionalFields();
    addLoadArtifactsButtonIfMissing();
    bindButtons();
    bindSubFileActions();
    bindNavigation();
    bindProjectNamePreview();
    renderSubFiles();
    clearGeneratedOutputs();
    showStatus('準備完了');
  }

  init();
})(window);