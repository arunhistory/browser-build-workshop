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

  function trimOrEmpty(text) {
    return normalizeLineBreaks(text).trim();
  }

  function normalizePath(path) {
    let value = trimOrEmpty(path);

    if (!value) return '';

    value = value.replace(/\\/g, '/');
    value = value.replace(/\/+/g, '/');

    if (!value.startsWith('/')) {
      value = '/' + value;
    }

    return value;
  }

  function normalizeSourcePath(path) {
    let value = trimOrEmpty(path);

    if (!value) return '';

    value = value.replace(/^\/+/, '');
    value = value.replace(/^src\//, '');
    value = value.replace(/\\/g, '/');
    value = value.replace(/\/+/g, '/');

    return '/src/' + value;
  }

  function buildCargoToml(config) {
    const lines = [];

    lines.push('[package]');
    lines.push(`name = "${safeString(config.projectName || 'sample-rust-project').trim()}"`);
    lines.push(`version = "${safeString(config.version || '0.1.0').trim()}"`);
    lines.push(`edition = "${safeString(config.edition || '2021').trim()}"`);
    lines.push('');

    if (safeString(config.entryTarget || 'lib') === 'lib') {
      lines.push('[lib]');
      lines.push(`crate-type = ["${safeString(config.crateType || 'cdylib').trim()}"]`);
      lines.push('');
    }

    const dependencies = normalizeDependencyLines(config.dependenciesText || '');
    if (dependencies.length) {
      lines.push('[dependencies]');
      lines.push(...dependencies);
      lines.push('');
    }

    const features = normalizeFeatureLines(config.featuresText || '');
    if (features.length) {
      lines.push('[features]');
      lines.push(...features);
      lines.push('');
    }

    return lines.join('\n').trim() + '\n';
  }

  function normalizeDependencyLines(text) {
    return normalizeLineBreaks(text)
      .split('\n')
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  function normalizeFeatureLines(text) {
    return normalizeLineBreaks(text)
      .split('\n')
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  function makeEntryPath(entryPoint) {
    const point = trimOrEmpty(entryPoint || 'lib.rs');
    if (!point) return '/src/lib.rs';
    return normalizeSourcePath(point);
  }

  function createVirtualFs(config) {
    const files = {};
    const warnings = [];
    const errors = [];

    const entryPath = makeEntryPath(config.entryPoint);
    const cargoToml = buildCargoToml(config);
    const mainRustCode = normalizeLineBreaks(config.mainRustCode || '');

    files['/Cargo.toml'] = cargoToml;

    if (!mainRustCode.trim()) {
      errors.push('メインRustコードが空です。');
    } else {
      files[entryPath] = mainRustCode;
    }

    const subFiles = Array.isArray(config.subFiles) ? config.subFiles : [];
    const usedPaths = new Set(['/Cargo.toml', entryPath]);

    for (const file of subFiles) {
      if (!file || typeof file !== 'object') continue;

      const rawName = trimOrEmpty(file.name || '');
      const rawContent = normalizeLineBreaks(file.content || '');

      if (!rawName) {
        warnings.push('名前が空の補助ファイルをスキップしました。');
        continue;
      }

      if (!rawName.endsWith('.rs')) {
        warnings.push(`${rawName} は .rs ではないためスキップしました。`);
        continue;
      }

      const path = normalizeSourcePath(rawName);

      if (usedPaths.has(path)) {
        warnings.push(`${path} は重複しているため後続をスキップしました。`);
        continue;
      }

      usedPaths.add(path);
      files[path] = rawContent;
    }

    return {
      ok: errors.length === 0,
      entryPath,
      files,
      errors,
      warnings
    };
  }

  function listVirtualFs(files) {
    return Object.keys(files || {}).sort();
  }

  function readFile(files, path) {
    const normalized = normalizePath(path);
    if (!normalized) return '';
    return Object.prototype.hasOwnProperty.call(files || {}, normalized)
      ? files[normalized]
      : '';
  }

  global.RustVirtualFs = {
    buildCargoToml,
    createVirtualFs,
    listVirtualFs,
    readFile,
    makeEntryPath,
    normalizeSourcePath
  };
})(window);