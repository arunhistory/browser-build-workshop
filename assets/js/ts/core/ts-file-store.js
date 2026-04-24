(function () {
  "use strict";

  if (!window.TSBuildState) {
    throw new Error("TSBuildState is required before ts-file-store.js");
  }

  const State = window.TSBuildState;

  function createFile(name, code) {
    const fileName = State.normalizeFileName(name || createNextFileName());

    return {
      id: State.createId("file"),
      name: fileName,
      path: `/src/${fileName}`,
      code: typeof code === "string" ? code : ""
    };
  }

  function createNextFileName() {
    const files = State.getFiles();
    let index = files.length + 1;

    while (files.some((file) => file.name === `module-${index}.ts`)) {
      index++;
    }

    return `module-${index}.ts`;
  }

  function addFile(name, code) {
    const files = State.getFiles();
    const file = createFile(name, code);

    if (files.some((item) => item.name === file.name)) {
      throw new Error(`同じファイル名が既に存在します: ${file.name}`);
    }

    files.push(file);
    State.setActiveFileId(file.id);

    return file;
  }

  function addOrReplaceFile(name, code) {
    const fileName = State.normalizeFileName(name);
    const existing = findFileByName(fileName);

    if (existing) {
      updateFileCode(existing.id, code || "");
      State.setActiveFileId(existing.id);
      return existing;
    }

    return addFile(fileName, code || "");
  }

  function removeFile(fileId) {
    const files = State.getFiles();

    if (files.length <= 1) {
      throw new Error("最低1つのTSファイルが必要です");
    }

    const index = files.findIndex((file) => file.id === fileId);

    if (index < 0) {
      throw new Error(`削除対象のファイルが見つかりません: ${fileId}`);
    }

    const removed = files.splice(index, 1)[0];

    if (State.getActiveFileId() === fileId) {
      const next = files[index] || files[index - 1] || files[0];
      State.setActiveFileId(next.id);
    }

    return removed;
  }

  function removeActiveFile() {
    const active = State.getActiveFile();

    if (!active) {
      throw new Error("現在のファイルが見つかりません");
    }

    return removeFile(active.id);
  }

  function renameFile(fileId, nextName) {
    const files = State.getFiles();
    const file = findFileById(fileId);

    if (!file) {
      throw new Error(`リネーム対象のファイルが見つかりません: ${fileId}`);
    }

    const normalizedName = State.normalizeFileName(nextName);

    if (
      files.some((item) => item.id !== fileId && item.name === normalizedName)
    ) {
      throw new Error(`同じファイル名が既に存在します: ${normalizedName}`);
    }

    file.name = normalizedName;
    file.path = `/src/${normalizedName}`;

    return file;
  }

  function renameActiveFile(nextName) {
    const active = State.getActiveFile();

    if (!active) {
      throw new Error("現在のファイルが見つかりません");
    }

    return renameFile(active.id, nextName);
  }

  function updateFileCode(fileId, code) {
    const file = findFileById(fileId);

    if (!file) {
      throw new Error(`更新対象のファイルが見つかりません: ${fileId}`);
    }

    file.code = typeof code === "string" ? code : String(code || "");

    return file;
  }

  function updateActiveFileCode(code) {
    const active = State.getActiveFile();

    if (!active) {
      throw new Error("現在のファイルが見つかりません");
    }

    return updateFileCode(active.id, code);
  }

  function selectFile(fileId) {
    const file = findFileById(fileId);

    if (!file) {
      throw new Error(`選択対象のファイルが見つかりません: ${fileId}`);
    }

    State.setActiveFileId(file.id);
    return file;
  }

  function findFileById(fileId) {
    return State.getFiles().find((file) => file.id === fileId) || null;
  }

  function findFileByName(name) {
    const normalizedName = State.normalizeFileName(name);
    return State.getFiles().find((file) => file.name === normalizedName) || null;
  }

  function getActiveFile() {
    return State.getActiveFile();
  }

  function getAllFiles() {
    return State.getFiles();
  }

  function getVirtualFileMap() {
    const map = {};

    for (const file of State.getFiles()) {
      const path = file.path || `/src/${file.name}`;
      map[path] = file.code;
    }

    return map;
  }

  function importFiles(fileList) {
    if (!Array.isArray(fileList)) {
      throw new Error("importFiles requires an array");
    }

    const normalized = [];
    const usedNames = new Set();

    for (const item of fileList) {
      const file = State.normalizeFile(item);
      let name = file.name;

      if (usedNames.has(name)) {
        name = createUniqueName(name, usedNames);
        file.name = name;
        file.path = `/src/${name}`;
      }

      usedNames.add(name);
      normalized.push(file);
    }

    State.setFiles(normalized);

    return State.getFiles();
  }

  function createUniqueName(name, usedNames) {
    const base = name.replace(/\.tsx?$/i, "");
    const ext = name.endsWith(".tsx") ? ".tsx" : ".ts";
    let index = 2;
    let next = `${base}-${index}${ext}`;

    while (usedNames.has(next)) {
      index++;
      next = `${base}-${index}${ext}`;
    }

    return next;
  }

  function exportFiles() {
    return State.clone(State.getFiles());
  }

  function resetFiles() {
    State.setFiles([State.clone(State.DEFAULT_MAIN_FILE)]);
    State.setActiveFileId(State.DEFAULT_MAIN_FILE.id);
    return State.getFiles();
  }

  function validateFiles() {
    const files = State.getFiles();
    const errors = [];
    const names = new Set();

    if (files.length === 0) {
      errors.push("TSファイルがありません");
    }

    for (const file of files) {
      if (!file.name) {
        errors.push("ファイル名が空です");
      }

      if (!file.name.endsWith(".ts") && !file.name.endsWith(".tsx")) {
        errors.push(`${file.name}: 拡張子は .ts または .tsx にしてください`);
      }

      if (names.has(file.name)) {
        errors.push(`${file.name}: ファイル名が重複しています`);
      }

      names.add(file.name);
    }

    return {
      ok: errors.length === 0,
      errors
    };
  }

  window.TSFileStore = {
    createFile,
    createNextFileName,

    addFile,
    addOrReplaceFile,

    removeFile,
    removeActiveFile,

    renameFile,
    renameActiveFile,

    updateFileCode,
    updateActiveFileCode,

    selectFile,

    findFileById,
    findFileByName,

    getActiveFile,
    getAllFiles,
    getVirtualFileMap,

    importFiles,
    exportFiles,
    resetFiles,
    validateFiles
  };
})();