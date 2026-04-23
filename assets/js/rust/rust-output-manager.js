(function (global) {
  'use strict';

  function safeString(value, fallback = '') {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  function trim(value) {
    return safeString(value).trim();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeOutputMode(mode) {
    const value = trim(mode);

    if (value === 'wasm-only') return 'wasm-only';
    if (value === 'js-only') return 'js-only';
    if (value === 'zip') return 'zip';

    return 'wasm-js';
  }

  function pascalCase(value) {
    return safeString(value)
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join('') || 'RustProject';
  }

  function makeMockWasmContent(config) {
    return [
      '; mock wasm binary placeholder',
      '; browser-build-workshop',
      '; project=' + safeString(config.projectName || 'rust-project'),
      '; build-id=' + safeString(config.buildId || ''),
      '; build-mode=' + safeString(config.buildMode || 'release'),
      '; crate-type=' + safeString(config.crateType || 'cdylib')
    ].join('\n');
  }

  function makeLoaderJsContent(config, buildResult) {
    const fnName = 'load' + pascalCase(config.projectName || 'rust-project');

    return [
      '// browser-build-workshop',
      '// generated loader',
      'export async function ' + fnName + '() {',
      '  return {',
      '    ok: ' + String(!!buildResult.ok) + ',',
      '    project: ' + JSON.stringify(safeString(config.projectName || 'rust-project')) + ',',
      '    buildId: ' + JSON.stringify(safeString(config.buildId || '')) + ',',
      '    buildMode: ' + JSON.stringify(safeString(config.buildMode || 'release')) + ',',
      '    crateType: ' + JSON.stringify(safeString(config.crateType || 'cdylib')) + ',',
      '    outputMode: ' + JSON.stringify(safeString(config.outputMode || 'wasm-js')),
      '  };',
      '}'
    ].join('\n');
  }

  function makeBuildLogContent(config, buildResult) {
    const errors = Array.isArray(buildResult.errors) ? buildResult.errors : [];
    const warnings = Array.isArray(buildResult.warnings) ? buildResult.warnings : [];
    const files = Array.isArray(buildResult.virtualFiles) ? buildResult.virtualFiles : [];

    const lines = [];

    lines.push('browser-build-workshop');
    lines.push('Rust Build Log');
    lines.push('project: ' + safeString(config.projectName || 'rust-project'));
    lines.push('build-id: ' + safeString(config.buildId || ''));
    lines.push('build-mode: ' + safeString(config.buildMode || 'release'));
    lines.push('crate-type: ' + safeString(config.crateType || 'cdylib'));
    lines.push('output-mode: ' + safeString(config.outputMode || 'wasm-js'));
    lines.push('status: ' + (buildResult.ok ? 'success' : 'error'));
    lines.push('');

    lines.push('[errors]');
    if (errors.length) {
      errors.forEach(function (item) {
        lines.push('- ' + safeString(item));
      });
    } else {
      lines.push('(none)');
    }

    lines.push('');
    lines.push('[warnings]');
    if (warnings.length) {
      warnings.forEach(function (item) {
        lines.push('- ' + safeString(item));
      });
    } else {
      lines.push('(none)');
    }

    lines.push('');
    lines.push('[virtual-files]');
    if (files.length) {
      files.forEach(function (file) {
        lines.push('- ' + safeString(file.path || ''));
      });
    } else {
      lines.push('(none)');
    }

    return lines.join('\n');
  }

  function makeReadableOutput(config, buildResult) {
    const files = Array.isArray(buildResult.virtualFiles) ? buildResult.virtualFiles : [];
    const errors = Array.isArray(buildResult.errors) ? buildResult.errors : [];
    const warnings = Array.isArray(buildResult.warnings) ? buildResult.warnings : [];

    const lines = [];

    lines.push('// browser-build-workshop');
    lines.push('// Rust output preview');
    lines.push('// project: ' + safeString(config.projectName || 'rust-project'));
    lines.push('// build-id: ' + safeString(config.buildId || ''));
    lines.push('// status: ' + (buildResult.ok ? 'success' : 'error'));
    lines.push('');

    files.forEach(function (file) {
      lines.push('// file: ' + safeString(file.path || ''));
      lines.push(safeString(file.content || ''));
      lines.push('');
    });

    if (errors.length) {
      lines.push('// errors');
      errors.forEach(function (item) {
        lines.push('// - ' + safeString(item));
      });
      lines.push('');
    }

    if (warnings.length) {
      lines.push('// warnings');
      warnings.forEach(function (item) {
        lines.push('// - ' + safeString(item));
      });
    }

    return lines.join('\n').trim() + '\n';
  }

  function makeOutputFiles(config, buildResult) {
    const outputMode = normalizeOutputMode(config.outputMode);
    const projectName = trim(config.projectName || 'rust-project');
    const outputFiles = [];

    const cargoTomlFile = Array.isArray(buildResult.virtualFiles)
      ? buildResult.virtualFiles.find(function (file) {
          return file.path === '/Cargo.toml';
        })
      : null;

    outputFiles.push({
      name: 'build-log.txt',
      type: 'text/plain',
      content: makeBuildLogContent(config, buildResult)
    });

    if (cargoTomlFile) {
      outputFiles.push({
        name: 'Cargo.toml',
        type: 'text/plain',
        content: safeString(cargoTomlFile.content || '')
      });
    }

    if (outputMode === 'wasm-js' || outputMode === 'wasm-only' || outputMode === 'zip') {
      outputFiles.push({
        name: projectName + '.wasm',
        type: 'application/wasm',
        content: makeMockWasmContent(config)
      });
    }

    if (outputMode === 'wasm-js' || outputMode === 'js-only' || outputMode === 'zip') {
      outputFiles.push({
        name: projectName + '.loader.js',
        type: 'application/javascript',
        content: makeLoaderJsContent(config, buildResult)
      });
    }

    if (outputMode === 'zip') {
      outputFiles.push({
        name: projectName + '-output-preview.txt',
        type: 'text/plain',
        content: makeReadableOutput(config, buildResult)
      });
    }

    return outputFiles;
  }

  function makeSummaryHtml(config, buildResult, outputFiles) {
    const errors = Array.isArray(buildResult.errors) ? buildResult.errors : [];
    const warnings = Array.isArray(buildResult.warnings) ? buildResult.warnings : [];

    const errorHtml = errors.length
      ? '<ul>' + errors.map(function (item) {
          return '<li>' + escapeHtml(item) + '</li>';
        }).join('') + '</ul>'
      : '<p>なし</p>';

    const warningHtml = warnings.length
      ? '<ul>' + warnings.map(function (item) {
          return '<li>' + escapeHtml(item) + '</li>';
        }).join('') + '</ul>'
      : '<p>なし</p>';

    const fileHtml = outputFiles.length
      ? '<ul>' + outputFiles.map(function (file) {
          return '<li>' + escapeHtml(file.name) + '</li>';
        }).join('') + '</ul>'
      : '<p>なし</p>';

    return [
      '<div class="rust-build-summary">',
      '<p><strong>プロジェクト:</strong> ' + escapeHtml(config.projectName || 'rust-project') + '</p>',
      '<p><strong>ビルドID:</strong> ' + escapeHtml(config.buildId || '') + '</p>',
      '<p><strong>状態:</strong> ' + escapeHtml(buildResult.ok ? 'success' : 'error') + '</p>',
      '<p><strong>出力形式:</strong> ' + escapeHtml(config.outputMode || 'wasm-js') + '</p>',
      '<h4>エラー</h4>',
      errorHtml,
      '<h4>警告</h4>',
      warningHtml,
      '<h4>生成ファイル</h4>',
      fileHtml,
      '</div>'
    ].join('');
  }

  function escapeHtml(text) {
    return safeString(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([safeString(content)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function downloadOutputFile(file) {
    if (!file || typeof file !== 'object') return false;

    const type = safeString(file.type || 'text/plain;charset=utf-8');
    const blob = new Blob([safeString(file.content || '')], { type: type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = safeString(file.name || 'download.txt');
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);

    return true;
  }

  global.RustOutputManager = {
    normalizeOutputMode: normalizeOutputMode,
    makeMockWasmContent: makeMockWasmContent,
    makeLoaderJsContent: makeLoaderJsContent,
    makeBuildLogContent: makeBuildLogContent,
    makeReadableOutput: makeReadableOutput,
    makeOutputFiles: makeOutputFiles,
    makeSummaryHtml: makeSummaryHtml,
    downloadTextFile: downloadTextFile,
    downloadOutputFile: downloadOutputFile
  };
})(window);