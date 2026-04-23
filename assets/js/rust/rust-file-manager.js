(function (global) {
  'use strict';

  function createStore() {
    return {
      files: []
    };
  }

  function normalizeName(name) {
    return String(name || '').trim();
  }

  function normalizeContent(content) {
    return String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function isValidRustFileName(name) {
    return /^[a-zA-Z0-9_.-]+\.rs$/.test(name);
  }

  function addFile(store, name, content) {
    const fileName = normalizeName(name);
    const fileContent = normalizeContent(content);

    if (!fileName) {
      return { ok: false, message: '補助ファイル名が空です。' };
    }

    if (!isValidRustFileName(fileName)) {
      return { ok: false, message: '補助ファイル名は .rs で終わる必要があります。' };
    }

    if (!fileContent.trim()) {
      return { ok: false, message: '補助ファイルの内容が空です。' };
    }

    const exists = store.files.some(function (file) {
      return file.name === fileName;
    });

    if (exists) {
      return { ok: false, message: '同じ名前の補助ファイルは追加できません。' };
    }

    const item = {
      id: 'rust-file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      name: fileName,
      content: fileContent
    };

    store.files.push(item);

    return {
      ok: true,
      message: '補助ファイルを追加しました。',
      file: item
    };
  }

  function removeFile(store, index) {
    if (!Array.isArray(store.files)) {
      return { ok: false, message: 'ファイル一覧が壊れています。' };
    }

    if (index < 0 || index >= store.files.length) {
      return { ok: false, message: '削除対象が見つかりません。' };
    }

    const removed = store.files.splice(index, 1)[0];

    return {
      ok: true,
      message: '補助ファイルを削除しました。',
      file: removed
    };
  }

  function getFile(store, index) {
    if (!Array.isArray(store.files)) {
      return { ok: false, message: 'ファイル一覧が壊れています。' };
    }

    if (index < 0 || index >= store.files.length) {
      return { ok: false, message: '対象ファイルが見つかりません。' };
    }

    return {
      ok: true,
      file: store.files[index]
    };
  }

  function listFiles(store) {
    if (!Array.isArray(store.files)) {
      return [];
    }

    return store.files.slice();
  }

  function clearFiles(store) {
    store.files = [];
    return {
      ok: true,
      message: '補助ファイル一覧を初期化しました。'
    };
  }

  global.RustFileManager = {
    createStore,
    addFile,
    removeFile,
    getFile,
    listFiles,
    clearFiles
  };
})(window);