(function (global) {
  'use strict';

  const ALLOWED_CRATES = {
    'wasm-bindgen': {
      versions: ['0.2'],
      note: 'Wasm公開関数向け'
    },
    'js-sys': {
      versions: ['0.3'],
      note: 'JavaScript連携向け'
    },
    'web-sys': {
      versions: ['0.3'],
      note: 'Web API連携向け'
    },
    'wee_alloc': {
      versions: ['0.4'],
      note: '軽量アロケータ'
    },
    'console_error_panic_hook': {
      versions: ['0.1'],
      note: 'panicログ補助'
    },
    'sha2': {
      versions: ['0.10'],
      note: 'SHA-256などのハッシュ計算向け'
    }
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

  function normalizeDependencyLines(rawText) {
    return normalizeLineBreaks(rawText)
      .split('\n')
      .map(function (line) {
        return line.trim();
      })
      .filter(function (line) {
        return !!line;
      });
  }

  function parseDependencyLine(line) {
    const text = trimOrEmpty(line);

    if (!text) {
      return {
        ok: false,
        error: '空行です。'
      };
    }

    const match = text.match(/^([a-zA-Z0-9_-]+)\s*=\s*["']([^"']+)["']$/);
    if (!match) {
      return {
        ok: false,
        error: '依存指定の形式が不正です: ' + text
      };
    }

    return {
      ok: true,
      name: match[1],
      version: match[2],
      raw: text
    };
  }

  function validateDependency(parsed) {
    if (!parsed || !parsed.ok) {
      return {
        ok: false,
        error: parsed && parsed.error ? parsed.error : '依存情報の解析に失敗しました。'
      };
    }

    const crate = ALLOWED_CRATES[parsed.name];
    if (!crate) {
      return {
        ok: false,
        error: '未対応crateです: ' + parsed.name
      };
    }

    const matched = crate.versions.some(function (version) {
      return parsed.version === version || parsed.version.startsWith(version + '.');
    });

    if (!matched) {
      return {
        ok: false,
        error: '未対応バージョンです: ' + parsed.name + ' = "' + parsed.version + '"'
      };
    }

    return {
      ok: true,
      name: parsed.name,
      version: parsed.version,
      raw: parsed.raw,
      note: crate.note
    };
  }

  function validateDependencies(rawText) {
    const lines = normalizeDependencyLines(rawText);
    const errors = [];
    const warnings = [];
    const parsedList = [];
    const seen = new Set();

    for (const line of lines) {
      const parsed = parseDependencyLine(line);

      if (!parsed.ok) {
        errors.push(parsed.error);
        continue;
      }

      const validated = validateDependency(parsed);

      if (!validated.ok) {
        errors.push(validated.error);
        continue;
      }

      if (seen.has(validated.name)) {
        warnings.push('同じcrateが重複しています: ' + validated.name);
      }

      seen.add(validated.name);
      parsedList.push(validated);
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
      parsedList: parsedList
    };
  }

  function getAllowedCrates() {
    return Object.keys(ALLOWED_CRATES).map(function (name) {
      return {
        name: name,
        versions: ALLOWED_CRATES[name].versions.slice(),
        note: ALLOWED_CRATES[name].note
      };
    });
  }

  function buildAllowedCratesHtml() {
    const items = getAllowedCrates();

    if (!items.length) {
      return '<p>対応crateはまだありません。</p>';
    }

    return [
      '<div class="dependency-allowed-list">',
      '  <ul>',
      items.map(function (item) {
        return [
          '    <li>',
          '      <strong>' + escapeHtml(item.name) + '</strong>',
          '      <span>対応: ' + escapeHtml(item.versions.join(', ')) + '</span>',
          '      <span>' + escapeHtml(item.note) + '</span>',
          '    </li>'
        ].join('');
      }).join(''),
      '  </ul>',
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

  global.RustDependencyManager = {
    getAllowedCrates: getAllowedCrates,
    validateDependencies: validateDependencies,
    buildAllowedCratesHtml: buildAllowedCratesHtml,
    normalizeDependencyLines: normalizeDependencyLines
  };
})(window);