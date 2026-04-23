(function (global) {
  'use strict';

  const state = {
    subFiles: []
  };

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

  function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function escapeHtml(text) {
    return safeString(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isValidRustFileName(name) {
    return /^[a-zA-Z0-9_.\-\/]+$/.test(name) && name.endsWith('.rs');
  }

  function normalizeRustFileName(name) {
    let value = trimOrEmpty(name);
    value = value.replace(/\\/g, '/');
    value = value.replace(/^\/+/, '');
    value = value.replace(/^src\//, '');
    value = value.replace(/\/+/g, '/');
    return value;
  }

  function getSubFiles() {
    return state.subFiles.slice().map(function (file) {
      return {
        id: file.id,
        name: file.name,
        content: file.content
      };
    });
  }

  function setSubFiles(files) {
    state.subFiles = Array.isArray(files)
      ? files.map(function (file) {
          return {
            id: safeString(file.id || makeId('rust-sub')),
            name: normalizeRustFileName(file.name || ''),
            content: normalizeLineBreaks(file.content || '')
          };
        }).filter(function (file) {
          return file.name;
        })
      : [];
  }

  function hasFile(name) {
    const normalized = normalizeRustFileName(name);
    return state.subFiles.some(function (file) {
      return file.name === normalized;
    });
  }

  function addFile(name, content) {
    const normalizedName = normalizeRustFileName(name);
    const normalizedContent = normalizeLineBreaks(content || '');

    if (!normalizedName) {
      return {
        ok: false,
        message: '補助ファイル名を入力してください。'
      };
    }

    if (!isValidRustFileName(normalizedName)) {
      return {
        ok: false,
        message: '補助ファイル名は .rs で終わる英数字ベースの名前にしてください。'
      };
    }

    if (!trimOrEmpty(normalizedContent)) {
      return {
        ok: false,
        message: '補助ファイルの中身が空です。'
      };
    }

    if (hasFile(normalizedName)) {
      return {
        ok: false,
        message: '同じ名前の補助ファイルは追加できません。'
      };
    }

    const file = {
      id: makeId('rust-sub'),
      name: normalizedName,
      content: normalizedContent
    };

    state.subFiles.push(file);

    return {
      ok: true,
      message: `補助ファイルを追加しました: ${normalizedName}`,
      file: {
        id: file.id,
        name: file.name,
        content: file.content
      }
    };
  }

  function removeFileByIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.subFiles.length) {
      return {
        ok: false,
        message: '削除対象の補助ファイルが見つかりません。'
      };
    }

    const removed = state.subFiles.splice(index, 1)[0];

    return {
      ok: true,
      message: `補助ファイルを削除しました: ${removed.name}`,
      file: removed
    };
  }

  function getFileByIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.subFiles.length) {
      return {
        ok: false,
        message: '対象の補助ファイルが見つかりません。'
      };
    }

    const file = state.subFiles[index];

    return {
      ok: true,
      message: `補助ファイルを読み込みました: ${file.name}`,
      file: {
        id: file.id,
        name: file.name,
        content: file.content
      }
    };
  }

  function clearFiles() {
    state.subFiles = [];
    return {
      ok: true,
      message: '補助ファイル一覧を初期化しました。'
    };
  }

  function renderFileListHtml(files) {
    const list = Array.isArray(files) ? files : getSubFiles();

    if (!list.length) {
      return [
        '<div class="file-item">',
        '  <span>補助Rustファイルはまだ追加されていません</span>',
        '  <span>-</span>',
        '</div>'
      ].join('');
    }

    return list.map(function (file, index) {
      const safeName = escapeHtml(file.name);
      const safeLength = String((file.content || '').length);

      return [
        '<div class="file-item">',
        `  <div class="file-item-main">`,
        `    <strong>${safeName}</strong>`,
        `    <span>文字数: ${safeLength}</span>`,
        '  </div>',
        '  <div class="file-item-actions">',
        `    <button type="button" class="btn btn-muted" data-action="view-sub-file" data-index="${index}">表示</button>`,
        `    <button type="button" class="btn btn-danger" data-action="remove-sub-file" data-index="${index}">削除</button>`,
        '  </div>',
        '</div>'
      ].join('');
    }).join('');
  }

  global.RustFileManager = {
    getSubFiles,
    setSubFiles,
    addFile,
    removeFileByIndex,
    getFileByIndex,
    clearFiles,
    renderFileListHtml,
    normalizeRustFileName,
    isValidRustFileName
  };
})(window);