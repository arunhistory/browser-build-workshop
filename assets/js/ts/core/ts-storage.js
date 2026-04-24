(function () {
  "use strict";

  if (!window.TSBuildState) {
    throw new Error("TSBuildState is required before ts-storage.js");
  }

  if (!window.TSLogger) {
    throw new Error("TSLogger is required before ts-storage.js");
  }

  const State = window.TSBuildState;
  const Logger = window.TSLogger;

  const STORAGE_KEY = "browser-build-workshop:ts-build:draft:v1";
  const BACKUP_KEY = "browser-build-workshop:ts-build:backup:v1";

  function createSnapshot() {
    return {
      version: 1,
      type: "typescript-build-draft",
      savedAt: new Date().toISOString(),
      activeFileId: State.getActiveFileId(),
      files: State.clone(State.getFiles()),
      settings: State.clone(State.getSettings()),
      outputs: State.clone(State.getOutputs()),
      logs: State.clone(State.getLogs())
    };
  }

  function saveDraft() {
    const snapshot = createSnapshot();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

    Logger.info("下書きを保存しました。", {
      savedAt: snapshot.savedAt,
      fileCount: snapshot.files.length
    });

    return snapshot;
  }

  function loadDraft() {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      throw new Error("保存済みの下書きがありません。");
    }

    const snapshot = parseSnapshot(raw);
    applySnapshot(snapshot);

    Logger.info("下書きを読み込みました。", {
      savedAt: snapshot.savedAt,
      fileCount: snapshot.files.length
    });

    return snapshot;
  }

  function hasDraft() {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  }

  function deleteDraft() {
    localStorage.removeItem(STORAGE_KEY);

    Logger.info("下書きを削除しました。");
  }

  function saveBackup() {
    const snapshot = createSnapshot();

    localStorage.setItem(BACKUP_KEY, JSON.stringify(snapshot));

    return snapshot;
  }

  function loadBackup() {
    const raw = localStorage.getItem(BACKUP_KEY);

    if (!raw) {
      throw new Error("バックアップがありません。");
    }

    const snapshot = parseSnapshot(raw);
    applySnapshot(snapshot);

    Logger.info("バックアップを読み込みました。", {
      savedAt: snapshot.savedAt,
      fileCount: snapshot.files.length
    });

    return snapshot;
  }

  function hasBackup() {
    return Boolean(localStorage.getItem(BACKUP_KEY));
  }

  function deleteBackup() {
    localStorage.removeItem(BACKUP_KEY);
  }

  function parseSnapshot(raw) {
    let snapshot;

    try {
      snapshot = JSON.parse(raw);
    } catch (error) {
      throw new Error("保存データの解析に失敗しました。");
    }

    validateSnapshot(snapshot);

    return snapshot;
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      throw new Error("保存データが不正です。");
    }

    if (snapshot.type !== "typescript-build-draft") {
      throw new Error("TS変換用の保存データではありません。");
    }

    if (!Array.isArray(snapshot.files)) {
      throw new Error("保存データ内のファイル一覧が不正です。");
    }

    if (snapshot.files.length === 0) {
      throw new Error("保存データ内にTSファイルがありません。");
    }

    if (!snapshot.settings || typeof snapshot.settings !== "object") {
      throw new Error("保存データ内の設定が不正です。");
    }
  }

  function applySnapshot(snapshot) {
    State.setFiles(snapshot.files);
    State.setSettings(snapshot.settings);

    if (
      snapshot.activeFileId &&
      State.getFiles().some((file) => file.id === snapshot.activeFileId)
    ) {
      State.setActiveFileId(snapshot.activeFileId);
    } else {
      State.setActiveFileId(State.getFiles()[0].id);
    }

    State.setOutputs(Array.isArray(snapshot.outputs) ? snapshot.outputs : []);
    State.setLogs(Array.isArray(snapshot.logs) ? snapshot.logs : []);
    State.setRunning(false);
    State.clearLastError();
  }

  function exportDraftText() {
    return JSON.stringify(createSnapshot(), null, 2);
  }

  function importDraftText(text) {
    const snapshot = parseSnapshot(String(text || ""));
    applySnapshot(snapshot);

    Logger.info("外部下書きデータを読み込みました。", {
      savedAt: snapshot.savedAt,
      fileCount: snapshot.files.length
    });

    return snapshot;
  }

  function getStorageInfo() {
    const draft = localStorage.getItem(STORAGE_KEY);
    const backup = localStorage.getItem(BACKUP_KEY);

    return {
      hasDraft: Boolean(draft),
      hasBackup: Boolean(backup),
      draftSize: draft ? new Blob([draft]).size : 0,
      backupSize: backup ? new Blob([backup]).size : 0
    };
  }

  window.TSStorage = {
    STORAGE_KEY,
    BACKUP_KEY,

    createSnapshot,

    saveDraft,
    loadDraft,
    hasDraft,
    deleteDraft,

    saveBackup,
    loadBackup,
    hasBackup,
    deleteBackup,

    parseSnapshot,
    validateSnapshot,
    applySnapshot,

    exportDraftText,
    importDraftText,

    getStorageInfo
  };
})();