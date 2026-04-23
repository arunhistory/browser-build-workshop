(function (global) {
  'use strict';

  function safeString(value, fallback = '') {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  function normalizeFilename(name, fallback) {
    const value = safeString(name, fallback || 'download.txt')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-');

    return value || (fallback || 'download.txt');
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function buildTextBlob(content, mimeType) {
    return new Blob(
      [safeString(content)],
      { type: safeString(mimeType, 'text/plain;charset=utf-8') }
    );
  }

  function downloadBlob(filename, blob) {
    const safeName = normalizeFilename(filename, 'download.txt');
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = safeName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function downloadText(filename, content, mimeType) {
    const blob = buildTextBlob(content, mimeType);
    downloadBlob(filename, blob);
  }

  function inferMimeType(file) {
    const name = safeString(file && file.name, '').toLowerCase();

    if (name.endsWith('.js')) return 'application/javascript;charset=utf-8';
    if (name.endsWith('.json')) return 'application/json;charset=utf-8';
    if (name.endsWith('.toml')) return 'text/plain;charset=utf-8';
    if (name.endsWith('.rs')) return 'text/plain;charset=utf-8';
    if (name.endsWith('.txt')) return 'text/plain;charset=utf-8';
    if (name.endsWith('.wasm')) return 'application/wasm';

    return safeString(file && file.type, 'text/plain;charset=utf-8');
  }

  function normalizeFile(file, index) {
    const fallbackName = 'file-' + String(index + 1) + '.txt';

    return {
      name: normalizeFilename(file && file.name, fallbackName),
      type: inferMimeType(file),
      content: safeString(file && file.content, '')
    };
  }

  function normalizeFiles(files) {
    return ensureArray(files).map(function (file, index) {
      return normalizeFile(file, index);
    });
  }

  function buildCombinedText(files) {
    const normalized = normalizeFiles(files);
    const parts = [];

    normalized.forEach(function (file, index) {
      parts.push('='.repeat(64));
      parts.push('FILE: ' + file.name);
      parts.push('TYPE: ' + file.type);
      parts.push('='.repeat(64));
      parts.push(file.content);

      if (index !== normalized.length - 1) {
        parts.push('');
      }
    });

    return parts.join('\n');
  }

  function downloadSingleFile(file) {
    const normalized = normalizeFile(file, 0);
    downloadText(normalized.name, normalized.content, normalized.type);
    return normalized;
  }

  function downloadAllSeparately(files) {
    const normalized = normalizeFiles(files);

    normalized.forEach(function (file) {
      downloadText(file.name, file.content, file.type);
    });

    return normalized;
  }

  function downloadAsBundleText(bundleName, files) {
    const normalized = normalizeFiles(files);
    const content = buildCombinedText(normalized);
    const filename = normalizeFilename(bundleName || 'rust-output-bundle.txt', 'rust-output-bundle.txt');

    downloadText(filename, content, 'text/plain;charset=utf-8');

    return {
      name: filename,
      content: content,
      files: normalized
    };
  }

  function buildOutputSummary(files) {
    const normalized = normalizeFiles(files);

    return {
      count: normalized.length,
      names: normalized.map(function (file) {
        return file.name;
      }),
      totalCharacters: normalized.reduce(function (sum, file) {
        return sum + file.content.length;
      }, 0)
    };
  }

  global.RustOutputManager = {
    normalizeFiles: normalizeFiles,
    buildCombinedText: buildCombinedText,
    downloadText: downloadText,
    downloadSingleFile: downloadSingleFile,
    downloadAllSeparately: downloadAllSeparately,
    downloadAsBundleText: downloadAsBundleText,
    buildOutputSummary: buildOutputSummary
  };
})(window);