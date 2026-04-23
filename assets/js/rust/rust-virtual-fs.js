(function (global) {
  'use strict';

  function safeString(value, fallback = '') {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  function normalizeLineBreaks(text) {
    return safeString(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function trim(text) {
    return normalizeLineBreaks(text).trim();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizePath(path) {
    let value = trim(path);

    if (!value) return '';

    value = value.replace(/\\/g, '/');

    if (!value.startsWith('/')) {
      value = '/' + value;
    }

    value = value.replace(/\/+/g, '/');

    return value;
  }

  function normalizeSrcPath(path) {
    let value = trim(path);

    if (!value) return '';

    value = value.replace(/\\/g, '/');
    value = value.replace(/^\/+/, '');
    value = value.replace(/^src\//, '');

    return normalizePath('/src/' + value);
  }

  function createEmptyFs() {
    return {
      files: {},
      order: []
    };
  }

  function hasFile(fs, path) {
    const normalized = normalizePath(path);
    return !!(fs && fs.files && Object.prototype.hasOwnProperty.call(fs.files, normalized));
  }

  function writeFile(fs, path, content) {
    const normalized = normalizePath(path);
    if (!normalized) {
      throw new Error('ファイルパスが空です');
    }

    if (!fs.files[normalized]) {
      fs.order.push(normalized);
    }

    fs.files[normalized] = {
      path: normalized,
      content: normalizeLineBreaks(content)
    };

    return fs.files[normalized];
  }

  function readFile(fs, path) {
    const normalized = normalizePath(path);
    if (!hasFile(fs, normalized)) return '';
    return fs.files[normalized].content;
  }

  function deleteFile(fs, path) {
    const normalized = normalizePath(path);
    if (!hasFile(fs, normalized)) return false;

    delete fs.files[normalized];
    fs.order = fs.order.filter(function (item) {
      return item !== normalized;
    });

    return true;
  }

  function listFiles(fs) {
    return fs.order.map(function (path) {
      return clone(fs.files[path]);
    });
  }

  function buildCargoToml(config) {
    const projectName = trim(config.projectName || 'sample-rust-project');
    const version = trim(config.version || '0.1.0');
    const edition = trim(config.edition || '2021');
    const crateType = trim(config.crateType || 'cdylib');
    const dependenciesText = normalizeLineBreaks(config.dependenciesText || 'wasm-bindgen = "0.2"').trim();
    const featuresText = normalizeLineBreaks(config.featuresText || '').trim();
    const entryPoint = trim(config.entryPoint || 'lib.rs');

    const lines = [];

    lines.push('[package]');
    lines.push('name = "' + projectName + '"');
    lines.push('version = "' + version + '"');
    lines.push('edition = "' + edition + '"');
    lines.push('');

    if (entryPoint.endsWith('lib.rs')) {
      lines.push('[lib]');
      lines.push('crate-type = ["' + crateType + '"]');
      lines.push('');
    }

    if (dependenciesText) {
      lines.push('[dependencies]');
      lines.push(dependenciesText);
      lines.push('');
    }

    if (featuresText) {
      lines.push('[features]');
      lines.push(featuresText);
      lines.push('');
    }

    return lines.join('\n').trim() + '\n';
  }

  function createProjectFs(input) {
    const config = input || {};
    const fs = createEmptyFs();

    const entryPoint = trim(config.entryPoint || 'lib.rs');
    const mainRustCode = normalizeLineBreaks(config.mainRustCode || '');
    const subFiles = Array.isArray(config.subFiles) ? config.subFiles : [];
    const cargoTomlText = trim(config.cargoTomlText || '');

    const entryPath = normalizeSrcPath(entryPoint || 'lib.rs');
    const cargoPath = '/Cargo.toml';

    writeFile(fs, cargoPath, cargoTomlText || buildCargoToml(config));
    writeFile(fs, entryPath, mainRustCode);

    subFiles.forEach(function (file) {
      if (!file || typeof file !== 'object') return;

      const rawName = trim(file.name || '');
      if (!rawName) return;

      const filePath = normalizeSrcPath(rawName);
      const fileContent = normalizeLineBreaks(file.content || '');

      writeFile(fs, filePath, fileContent);
    });

    return fs;
  }

  function exportPlainObject(fs) {
    const result = {};

    fs.order.forEach(function (path) {
      result[path] = fs.files[path].content;
    });

    return result;
  }

  function validateFs(fs, entryPoint) {
    const errors = [];
    const warnings = [];

    if (!hasFile(fs, '/Cargo.toml')) {
      errors.push('/Cargo.toml がありません');
    }

    const entryPath = normalizeSrcPath(entryPoint || 'lib.rs');
    if (!hasFile(fs, entryPath)) {
      errors.push('エントリーファイルがありません: ' + entryPath);
    }

    const fileList = listFiles(fs);
    if (!fileList.length) {
      errors.push('仮想FSが空です');
    }

    fileList.forEach(function (file) {
      if (!file.content.trim()) {
        warnings.push('中身が空のファイルがあります: ' + file.path);
      }
    });

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }

  global.RustVirtualFs = {
    createEmptyFs: createEmptyFs,
    hasFile: hasFile,
    writeFile: writeFile,
    readFile: readFile,
    deleteFile: deleteFile,
    listFiles: listFiles,
    buildCargoToml: buildCargoToml,
    createProjectFs: createProjectFs,
    exportPlainObject: exportPlainObject,
    validateFs: validateFs,
    normalizePath: normalizePath,
    normalizeSrcPath: normalizeSrcPath
  };
})(window);