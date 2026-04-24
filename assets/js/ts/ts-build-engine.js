(function () {
  "use strict";

  const requiredModules = [
    "TSBuildState",
    "TSFileStore",
    "TSLogger",
    "TSCompiler",
    "TSMinifier",
    "TSObfuscator",
    "TSOutputManager",
    "TSStorage",
    "TSDownloader"
  ];

  for (const moduleName of requiredModules) {
    if (!window[moduleName]) {
      throw new Error(`${moduleName} is required before ts-build-engine.js`);
    }
  }

  const State = window.TSBuildState;
  const FileStore = window.TSFileStore;
  const Logger = window.TSLogger;
  const Compiler = window.TSCompiler;
  const Minifier = window.TSMinifier;
  const Obfuscator = window.TSObfuscator;
  const OutputManager = window.TSOutputManager;
  const Storage = window.TSStorage;
  const Downloader = window.TSDownloader;

  const ENGINE_VERSION = "1.0.0";

  function boot() {
    Logger.info("TS Build Engine を起動しました。", {
      version: ENGINE_VERSION
    });

    return getStatus();
  }

  function getStatus() {
    return {
      version: ENGINE_VERSION,
      isRunning: State.isRunning(),
      fileCount: State.getFiles().length,
      activeFileId: State.getActiveFileId(),
      outputCount: State.getOutputs().length,
      hasDraft: Storage.hasDraft(),
      hasBackup: Storage.hasBackup(),
      settings: State.clone(State.getSettings())
    };
  }

  function updateSettings(settings) {
    State.setSettings(settings || {});

    Logger.info("変換設定を更新しました。", {
      settings: State.clone(State.getSettings())
    });

    return State.getSettings();
  }

  function getSettings() {
    return State.getSettings();
  }

  function resetSettings() {
    State.resetSettings();

    Logger.info("変換設定を初期化しました。", {
      settings: State.clone(State.getSettings())
    });

    return State.getSettings();
  }

  function getFiles() {
    return FileStore.getAllFiles();
  }

  function getActiveFile() {
    return FileStore.getActiveFile();
  }

  function addFile(name, code) {
    const file = FileStore.addFile(name, code);

    Logger.info("TSファイルを追加しました。", {
      name: file.name,
      path: file.path
    });

    return file;
  }

  function removeFile(fileId) {
    const removed = FileStore.removeFile(fileId);

    Logger.info("TSファイルを削除しました。", {
      name: removed.name,
      path: removed.path
    });

    return removed;
  }

  function removeActiveFile() {
    const removed = FileStore.removeActiveFile();

    Logger.info("現在のTSファイルを削除しました。", {
      name: removed.name,
      path: removed.path
    });

    return removed;
  }

  function renameFile(fileId, nextName) {
    const file = FileStore.renameFile(fileId, nextName);

    Logger.info("TSファイル名を変更しました。", {
      id: file.id,
      name: file.name,
      path: file.path
    });

    return file;
  }

  function renameActiveFile(nextName) {
    const file = FileStore.renameActiveFile(nextName);

    Logger.info("現在のTSファイル名を変更しました。", {
      id: file.id,
      name: file.name,
      path: file.path
    });

    return file;
  }

  function updateFileCode(fileId, code) {
    return FileStore.updateFileCode(fileId, code);
  }

  function updateActiveFileCode(code) {
    return FileStore.updateActiveFileCode(code);
  }

  function selectFile(fileId) {
    const file = FileStore.selectFile(fileId);

    Logger.info("TSファイルを選択しました。", {
      name: file.name,
      path: file.path
    });

    return file;
  }

  function validateProject() {
    const fileResult = FileStore.validateFiles();
    Logger.validateSummary(fileResult);

    if (!fileResult.ok) {
      return {
        ok: false,
        errors: fileResult.errors
      };
    }

    const files = FileStore.getAllFiles();
    const emptyFiles = files.filter((file) => !String(file.code || "").trim());

    if (emptyFiles.length > 0) {
      const errors = emptyFiles.map((file) => `${file.name}: コードが空です`);

      for (const error of errors) {
        Logger.error(error);
      }

      return {
        ok: false,
        errors
      };
    }

    return {
      ok: true,
      errors: []
    };
  }

  function build(options) {
    const safeOptions = options || {};

    if (State.isRunning()) {
      throw new Error("すでにTS変換を実行中です。");
    }

    State.setRunning(true);
    State.clearLastError();
    State.clearOutputs();

    Logger.buildStart("typescript-build");

    try {
      if (safeOptions.saveBackup !== false) {
        Storage.saveBackup();
      }

      const validation = validateProject();

      if (!validation.ok) {
        throw new Error("入力検証に失敗しました。");
      }

      const files = State.clone(FileStore.getAllFiles());
      const settings = State.clone(State.getSettings());

      Logger.info("変換対象を確定しました。", {
        fileCount: files.length,
        settings
      });

      let outputs = Compiler.compileFiles(files, settings);

      if (settings.enableMinify) {
        outputs = Minifier.minifyOutputs(outputs);
      }

      if (settings.enableObfuscate) {
        outputs = Obfuscator.obfuscateOutputs(outputs);
      }

      outputs = applyOutputNameRule(outputs, settings);

      OutputManager.setOutputs(outputs);

      const summary = OutputManager.summarizeOutputs(outputs);

      State.setLastBuildAt(new Date().toISOString());
      Logger.buildEndSuccess(outputs);

      return {
        ok: true,
        outputs,
        logs: Logger.getLogs(),
        logText: Logger.toText(),
        summary
      };
    } catch (error) {
      State.setLastError(error);
      Logger.buildEndError(error);

      return {
        ok: false,
        outputs: [],
        logs: Logger.getLogs(),
        logText: Logger.toText(),
        error: {
          message: error && error.message ? error.message : String(error)
        }
      };
    } finally {
      State.setRunning(false);
    }
  }

  function applyOutputNameRule(outputs, settings) {
    if (!Array.isArray(outputs)) {
      return [];
    }

    const outputName = settings && settings.outputName
      ? String(settings.outputName).trim()
      : "";

    if (!outputName) {
      return outputs;
    }

    if (outputs.length === 1) {
      return outputs.map((output) => ({
        ...output,
        outputName: normalizeJsFileName(outputName)
      }));
    }

    return outputs.map((output) => {
      const baseName = output.outputName || "output.js";

      return {
        ...output,
        outputName: normalizeJsFileName(baseName)
      };
    });
  }

  function normalizeJsFileName(name) {
    const safe = String(name || "main.js").trim();

    if (!safe) return "main.js";
    if (safe.endsWith(".js")) return safe;

    return `${safe}.js`;
  }

  function clearBuildResult() {
    OutputManager.clearOutputs();
    State.clearLastError();

    Logger.info("変換結果を削除しました。");

    return {
      outputs: State.getOutputs(),
      logs: Logger.getLogs()
    };
  }

  function clearLogs() {
    Logger.clear();

    return {
      logs: Logger.getLogs(),
      logText: Logger.toText()
    };
  }

  function getOutputs() {
    return OutputManager.getOutputs();
  }

  function getPrimaryOutput() {
    return OutputManager.getPrimaryOutput();
  }

  function getLogText() {
    return Logger.toText();
  }

  function saveDraft() {
    return Storage.saveDraft();
  }

  function loadDraft() {
    return Storage.loadDraft();
  }

  function deleteDraft() {
    return Storage.deleteDraft();
  }

  function saveBackup() {
    return Storage.saveBackup();
  }

  function loadBackup() {
    return Storage.loadBackup();
  }

  function deleteBackup() {
    return Storage.deleteBackup();
  }

  function exportDraftText() {
    return Storage.exportDraftText();
  }

  function importDraftText(text) {
    return Storage.importDraftText(text);
  }

  function downloadPrimaryOutput() {
    return Downloader.downloadPrimaryOutput();
  }

  function downloadOutputByName(outputName) {
    return Downloader.downloadOutputByName(outputName);
  }

  function downloadBuildLog() {
    return Downloader.downloadBuildLog();
  }

  function downloadManifest() {
    return Downloader.downloadManifest();
  }

  function downloadCombinedOutput() {
    return Downloader.downloadCombinedOutput();
  }

  function downloadAllAsTextBundle() {
    return Downloader.downloadAllAsTextBundle();
  }

  function downloadEachOutput() {
    return Downloader.downloadEachOutput();
  }

  function resetAll() {
    State.resetState();
    Logger.clear();

    Logger.info("TS Build Engine を初期化しました。");

    return getStatus();
  }

  function getVirtualFileMap() {
    return FileStore.getVirtualFileMap();
  }

  function exportProject() {
    return {
      version: ENGINE_VERSION,
      exportedAt: new Date().toISOString(),
      files: State.clone(State.getFiles()),
      activeFileId: State.getActiveFileId(),
      settings: State.clone(State.getSettings()),
      outputs: State.clone(State.getOutputs()),
      logs: State.clone(State.getLogs())
    };
  }

  function importProject(project) {
    if (!project || typeof project !== "object") {
      throw new Error("読み込むプロジェクトデータが不正です。");
    }

    if (!Array.isArray(project.files)) {
      throw new Error("プロジェクトデータに files がありません。");
    }

    State.setFiles(project.files);

    if (
      project.activeFileId &&
      State.getFiles().some((file) => file.id === project.activeFileId)
    ) {
      State.setActiveFileId(project.activeFileId);
    }

    if (project.settings && typeof project.settings === "object") {
      State.setSettings(project.settings);
    }

    if (Array.isArray(project.outputs)) {
      State.setOutputs(project.outputs);
    }

    if (Array.isArray(project.logs)) {
      State.setLogs(project.logs);
    }

    State.setRunning(false);
    State.clearLastError();

    Logger.info("TSプロジェクトを読み込みました。", {
      fileCount: State.getFiles().length,
      outputCount: State.getOutputs().length
    });

    return getStatus();
  }

  window.TSBuildEngine = {
    version: ENGINE_VERSION,

    boot,
    getStatus,

    updateSettings,
    getSettings,
    resetSettings,

    getFiles,
    getActiveFile,
    addFile,
    removeFile,
    removeActiveFile,
    renameFile,
    renameActiveFile,
    updateFileCode,
    updateActiveFileCode,
    selectFile,

    validateProject,
    build,

    clearBuildResult,
    clearLogs,

    getOutputs,
    getPrimaryOutput,
    getLogText,

    saveDraft,
    loadDraft,
    deleteDraft,

    saveBackup,
    loadBackup,
    deleteBackup,

    exportDraftText,
    importDraftText,

    downloadPrimaryOutput,
    downloadOutputByName,
    downloadBuildLog,
    downloadManifest,
    downloadCombinedOutput,
    downloadAllAsTextBundle,
    downloadEachOutput,

    resetAll,

    getVirtualFileMap,

    exportProject,
    importProject
  };
})();