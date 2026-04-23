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

  function escapeHtml(text) {
    return safeString(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  function buildLogText(config, evaluation, virtualFs, outputFiles) {
    const lines = [];

    lines.push('Rustビルドログ');
    lines.push(`project: ${safeString(config.projectName || 'sample-rust-project')}`);
    lines.push(`entry: ${safeString(config.entryPoint || 'lib.rs')}`);
    lines.push(`entry-target: ${safeString(config.entryTarget || 'lib')}`);
    lines.push(`build-mode: ${safeString(config.buildMode || 'release')}`);
    lines.push(`crate-type: ${safeString(config.crateType || 'cdylib')}`);
    lines.push(`output-mode: ${safeString(config.outputMode || 'wasm-js')}`);
    lines.push(`status: ${evaluation && evaluation.ok ? 'success' : 'error'}`);
    lines.push('');

    lines.push('仮想FS:');
    Object.keys(virtualFs || {}).sort().forEach(function (path) {
      lines.push(`- ${path}`);
    });

    lines.push('');
    lines.push('エラー:');
    if (evaluation && Array.isArray(evaluation.errors) && evaluation.errors.length) {
      evaluation.errors.forEach(function (item) {
        lines.push(`- ${item}`);
      });
    } else {
      lines.push('- なし');
    }

    lines.push('');
    lines.push('警告:');
    if (evaluation && Array.isArray(evaluation.warnings) && evaluation.warnings.length) {
      evaluation.warnings.forEach(function (item) {
        lines.push(`- ${item}`);
      });
    } else {
      lines.push('- なし');
    }

    lines.push('');
    lines.push('生成ファイル:');
    if (Array.isArray(outputFiles) && outputFiles.length) {
      outputFiles.forEach(function (file) {
        lines.push(`- ${file.name}`);
      });
    } else {
      lines.push('- なし');
    }

    return lines.join('\n');
  }

  function buildReadableOutput(config, virtualFs, evaluation) {
    const lines = [];
    const entryPoint = safeString(config.entryPoint || 'lib.rs').trim();
    const paths = Object.keys(virtualFs || {}).sort();

    lines.push('// browser-build-workshop');
    lines.push('// Rust output preview');
    lines.push(`// project: ${safeString(config.projectName || 'sample-rust-project')}`);
    lines.push(`// entry: ${entryPoint}`);
    lines.push(`// build-mode: ${safeString(config.buildMode || 'release')}`);
    lines.push(`// crate-type: ${safeString(config.crateType || 'cdylib')}`);
    lines.push(`// output-mode: ${safeString(config.outputMode || 'wasm-js')}`);
    lines.push(`// result: ${evaluation && evaluation.ok ? 'success' : 'error'}`);
    lines.push('');

    if (virtualFs && virtualFs['/Cargo.toml']) {
      lines.push('// Cargo.toml');
      lines.push(virtualFs['/Cargo.toml']);
      lines.push('');
    }

    paths.forEach(function (path) {
      if (path === '/Cargo.toml') return;
      lines.push(`// file: ${path}`);
      lines.push(safeString(virtualFs[path]));
      lines.push('');
    });

    if (evaluation && Array.isArray(evaluation.errors) && evaluation.errors.length) {
      lines.push('// errors');
      evaluation.errors.forEach(function (item) {
        lines.push(`// - ${item}`);
      });
      lines.push('');
    }

    if (evaluation && Array.isArray(evaluation.warnings) && evaluation.warnings.length) {
      lines.push('// warnings');
      evaluation.warnings.forEach(function (item) {
        lines.push(`// - ${item}`);
      });
      lines.push('');
    }

    return lines.join('\n').trim() + '\n';
  }

  function buildOutputFiles(config, evaluation, virtualFs) {
    const outputMode = safeString(config.outputMode || 'wasm-js').trim();
    const projectName = trimOrEmpty(config.projectName || 'sample-rust-project') || 'sample-rust-project';
    const files = [];

    const readableOutput = buildReadableOutput(config, virtualFs, evaluation);
    const logText = buildLogText(config, evaluation, virtualFs, []);

    if (outputMode === 'wasm-js' || outputMode === 'wasm-only') {
      files.push({
        name: `${projectName}.wasm`,
        type: 'application/wasm',
        content: [
          '; mock wasm output',
          `; project=${projectName}`,
          `; entry=${safeString(config.entryPoint || 'lib.rs')}`,
          `; build-mode=${safeString(config.buildMode || 'release')}`
        ].join('\n')
      });
    }

    if (outputMode === 'wasm-js' || outputMode === 'js-only') {
      files.push({
        name: `${projectName}.loader.js`,
        type: 'application/javascript',
        content: [
          `// loader for ${projectName}`,
          `export async function load${pascalCase(projectName)}() {`,
          '  return {',
          `    ok: ${evaluation && evaluation.ok ? 'true' : 'false'},`,
          `    project: ${JSON.stringify(projectName)},`,
          `    entry: ${JSON.stringify(safeString(config.entryPoint || 'lib.rs'))}`,
          '  };',
          '}'
        ].join('\n')
      });
    }

    files.push({
      name: 'build-log.txt',
      type: 'text/plain',
      content: logText
    });

    files.push({
      name: 'Cargo.toml',
      type: 'text/plain',
      content: safeString(virtualFs['/Cargo.toml'] || '')
    });

    files.push({
      name: `${projectName}-preview.txt`,
      type: 'text/plain',
      content: readableOutput
    });

    return files;
  }

  function buildSummaryHtml(config, evaluation, outputFiles) {
    const errors = evaluation && Array.isArray(evaluation.errors) ? evaluation.errors : [];
    const warnings = evaluation && Array.isArray(evaluation.warnings) ? evaluation.warnings : [];
    const files = Array.isArray(outputFiles) ? outputFiles : [];

    const errorHtml = errors.length
      ? `<ul>${errors.map(function (item) { return `<li>${escapeHtml(item)}</li>`; }).join('')}</ul>`
      : '<p>なし</p>';

    const warningHtml = warnings.length
      ? `<ul>${warnings.map(function (item) { return `<li>${escapeHtml(item)}</li>`; }).join('')}</ul>`
      : '<p>なし</p>';

    const fileHtml = files.length
      ? `<ul>${files.map(function (file) { return `<li>${escapeHtml(file.name)}</li>`; }).join('')}</ul>`
      : '<p>なし</p>';

    return [
      '<div class="rust-build-summary">',
      `<p><strong>プロジェクト:</strong> ${escapeHtml(safeString(config.projectName || 'sample-rust-project'))}</p>`,
      `<p><strong>entry:</strong> ${escapeHtml(safeString(config.entryPoint || 'lib.rs'))}</p>`,
      `<p><strong>build-mode:</strong> ${escapeHtml(safeString(config.buildMode || 'release'))}</p>`,
      `<p><strong>crate-type:</strong> ${escapeHtml(safeString(config.crateType || 'cdylib'))}</p>`,
      `<p><strong>output-mode:</strong> ${escapeHtml(safeString(config.outputMode || 'wasm-js'))}</p>`,
      `<p><strong>状態:</strong> ${evaluation && evaluation.ok ? 'success' : 'error'}</p>`,
      '<h4>エラー</h4>',
      errorHtml,
      '<h4>警告</h4>',
      warningHtml,
      '<h4>生成ファイル</h4>',
      fileHtml,
      '</div>'
    ].join('');
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([safeString(content)], { type: 'text/plain;charset=utf-8' });
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

  global.RustOutputManager = {
    buildLogText,
    buildReadableOutput,
    buildOutputFiles,
    buildSummaryHtml,
    downloadTextFile
  };
})(window);