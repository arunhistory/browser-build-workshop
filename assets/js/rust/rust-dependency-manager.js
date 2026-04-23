(function (global) {
  'use strict';

  const SUPPORTED_CRATES = {
    'wasm-bindgen': {
      versions: ['0.2'],
      note: 'Wasm公開向けの基本crate'
    },
    'js-sys': {
      versions: ['0.3'],
      note: 'JavaScript連携用'
    },
    'web-sys': {
      versions: ['0.3'],
      note: 'Web API連携用'
    },
    'serde': {
      versions: ['1'],
      note: 'シリアライズ用'
    },
    'serde_json': {
      versions: ['1'],
      note: 'JSON処理用'
    },
    'console_error_panic_hook': {
      versions: ['0.1'],
      note: 'panic表示補助'
    },
    'wee_alloc': {
      versions: ['0.4'],
      note: '軽量アロケータ候補'
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

  function trim(text) {
    return normalizeLineBreaks(text).trim();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function parseDependencyLine(line) {
    const raw = trim(line);
    if (!raw) return null;
    if (raw.startsWith('#')) return null;

    const eqIndex = raw.indexOf('=');

    if (eqIndex === -1) {
      return {
        raw: raw,
        name: raw,
        version: '',
        valid: false,
        reason: '依存指定に = がありません'
      };
    }

    const name = raw.slice(0, eqIndex).trim();
    const value = raw.slice(eqIndex + 1).trim();

    if (!name) {
      return {
        raw: raw,
        name: '',
        version: '',
        valid: false,
        reason: 'crate名が空です'
      };
    }

    let version = '';

    const quoted = value.match(/"([^"]+)"/);
    if (quoted) {
      version = quoted[1].trim();
    } else if (value.startsWith('{') && value.endsWith('}')) {
      const versionMatch = value.match(/version\s*=\s*"([^"]+)"/);
      version = versionMatch ? versionMatch[1].trim() : '';
    } else {
      version = value.replace(/^["']|["']$/g, '').trim();
    }

    return {
      raw: raw,
      name: name,
      version: version,
      valid: true,
      reason: ''
    };
  }

  function parseDependencies(text) {
    const source = normalizeLineBreaks(text);
    const lines = source.split('\n');
    const items = [];

    lines.forEach(function (line) {
      const parsed = parseDependencyLine(line);
      if (parsed) {
        items.push(parsed);
      }
    });

    return items;
  }

  function parseFeatures(text) {
    const source = normalizeLineBreaks(text);
    const lines = source.split('\n');
    const items = [];

    lines.forEach(function (line) {
      const value = trim(line);
      if (!value) return;
      if (value.startsWith('#')) return;
      items.push(value);
    });

    return items;
  }

  function isSupportedCrate(crateName) {
    return Object.prototype.hasOwnProperty.call(SUPPORTED_CRATES, crateName);
  }

  function checkVersion(crateName, version) {
    if (!isSupportedCrate(crateName)) {
      return {
        ok: false,
        reason: '未対応crateです'
      };
    }

    const supported = SUPPORTED_CRATES[crateName];
    const allowedVersions = supported.versions || [];

    if (!version) {
      return {
        ok: true,
        reason: 'バージョン未指定'
      };
    }

    const matched = allowedVersions.some(function (prefix) {
      return version === prefix || version.startsWith(prefix + '.') || version.startsWith('^' + prefix) || version.startsWith('~' + prefix);
    });

    if (!matched) {
      return {
        ok: false,
        reason: '対応外バージョンの可能性があります'
      };
    }

    return {
      ok: true,
      reason: ''
    };
  }

  function evaluateDependencies(dependenciesText, featuresText) {
    const dependencies = parseDependencies(dependenciesText);
    const features = parseFeatures(featuresText);

    const errors = [];
    const warnings = [];
    const accepted = [];
    const rejected = [];

    dependencies.forEach(function (item) {
      if (!item.valid) {
        errors.push(item.reason + ': ' + item.raw);
        rejected.push(item);
        return;
      }

      if (!isSupportedCrate(item.name)) {
        errors.push('未対応crateです: ' + item.name);
        rejected.push(item);
        return;
      }

      const versionCheck = checkVersion(item.name, item.version);
      if (!versionCheck.ok) {
        warnings.push(item.name + ': ' + versionCheck.reason + ' (' + (item.version || '未指定') + ')');
      }

      accepted.push({
        name: item.name,
        version: item.version,
        note: SUPPORTED_CRATES[item.name].note || ''
      });
    });

    features.forEach(function (feature) {
      if (!/^[a-zA-Z0-9_-]+(\s*=\s*\[.*\])?$/.test(feature) && !/^[a-zA-Z0-9_-]+$/.test(feature)) {
        warnings.push('features の記述確認が必要です: ' + feature);
      }
    });

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
      accepted: accepted,
      rejected: rejected,
      features: features
    };
  }

  function getSupportedCrates() {
    return clone(SUPPORTED_CRATES);
  }

  global.RustDependencyManager = {
    parseDependencyLine: parseDependencyLine,
    parseDependencies: parseDependencies,
    parseFeatures: parseFeatures,
    isSupportedCrate: isSupportedCrate,
    checkVersion: checkVersion,
    evaluateDependencies: evaluateDependencies,
    getSupportedCrates: getSupportedCrates
  };
})(window);