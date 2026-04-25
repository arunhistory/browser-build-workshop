(function (global) {
  "use strict";

  const MODULE_NAME = "RustBuildRequestBuilder";
  const MODULE_VERSION = "1.0.0";

  function safeString(value, fallback = "") {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  function normalizeLineBreaks(text) {
    return safeString(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function trimOrEmpty(text) {
    return normalizeLineBreaks(text).trim();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function makeId(prefix) {
    const rand = Math.random().toString(36).slice(2, 10);
    return prefix + "-" + Date.now() + "-" + rand;
  }

  function escapeHtml(text) {
    return safeString(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeProjectName(name) {
    const value = trimOrEmpty(name || "sample-rust-project")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return value || "sample-rust-project";
  }

  function normalizeEntryPoint(entryPoint) {
    const value = trimOrEmpty(entryPoint || "lib.rs");
    return value || "lib.rs";
  }

  function inferEntryTarget(entryPoint) {
    const value = normalizeEntryPoint(entryPoint).toLowerCase();
    if (value.endsWith("main.rs")) return "main";
    return "lib";
  }

  function normalizeEntryPath(entryPoint) {
    const raw = normalizeEntryPoint(entryPoint);

    if (raw.startsWith("/")) return raw;
    if (raw.startsWith("src/")) return "/" + raw;

    return "/src/" + raw;
  }

  function normalizeDependencies(text) {
    return normalizeLineBreaks(text)
      .split("\n")
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  function normalizeFeatures(text) {
    return normalizeLineBreaks(text)
      .split("\n")
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  function unwrapInput(input) {
    if (
      input &&
      typeof input === "object" &&
      input.config &&
      typeof input.config === "object"
    ) {
      return input.config;
    }

    return input || {};
  }

  function collectConfig(input) {
    const source = unwrapInput(input);
    const entryPoint = normalizeEntryPoint(source.entryPoint || "lib.rs");
    const entryTarget = inferEntryTarget(entryPoint);

    let crateType = trimOrEmpty(source.crateType || "cdylib") || "cdylib";

    if (entryTarget === "main") {
      crateType = "bin";
    }

    return {
      buildId: safeString(source.buildId || makeId("rust-wasm-build")),
      timestamp: safeString(source.timestamp || nowIso()),

      projectName: normalizeProjectName(source.projectName || "sample-rust-project"),
      version: trimOrEmpty(source.version || "0.1.0") || "0.1.0",
      edition: trimOrEmpty(source.edition || "2021") || "2021",

      entryPoint: entryPoint,
      entryTarget: entryTarget,
      crateType: crateType,

      buildMode: trimOrEmpty(source.buildMode || "release") || "release",
      outputMode: trimOrEmpty(source.outputMode || "wasm-js") || "wasm-js",

      dependenciesText: normalizeLineBreaks(source.dependenciesText || ""),
      featuresText: normalizeLineBreaks(source.featuresText || ""),
      mainRustCode: normalizeLineBreaks(source.mainRustCode || ""),

      subFiles: toArray(source.subFiles).map(function (file, index) {
        return {
          id: safeString((file && file.id) || "sub-" + index),
          name: safeString((file && file.name) || "").trim(),
          content: normalizeLineBreaks((file && file.content) || "")
        };
      })
    };
  }

  function buildCargoToml(config) {
    const lines = [];

    lines.push("[package]");
    lines.push('name = "' + config.projectName + '"');
    lines.push('version = "' + config.version + '"');
    lines.push('edition = "' + config.edition + '"');
    lines.push("");

    if (config.entryTarget === "lib") {
      lines.push("[lib]");
      lines.push('crate-type = ["' + config.crateType + '"]');
      lines.push("");
    }

    if (config.entryTarget === "main") {
      lines.push("[[bin]]");
      lines.push('name = "' + config.projectName + '"');
      lines.push('path = "src/main.rs"');
      lines.push("");
    }

    const dependencies = normalizeDependencies(config.dependenciesText);
    if (dependencies.length) {
      lines.push("[dependencies]");
      dependencies.forEach(function (line) {
        lines.push(line);
      });
      lines.push("");
    }

    const features = normalizeFeatures(config.featuresText);
    if (features.length) {
      lines.push("[features]");
      features.forEach(function (line) {
        lines.push(line);
      });
      lines.push("");
    }

    return lines.join("\n").trim() + "\n";
  }

  function buildVirtualFs(config) {
    const files = {};
    const entryPath = normalizeEntryPath(config.entryPoint);

    files["/Cargo.toml"] = buildCargoToml(config);
    files[entryPath] = normalizeLineBreaks(config.mainRustCode || "");

    toArray(config.subFiles).forEach(function (file) {
      if (!file || typeof file !== "object") return;

      const name = trimOrEmpty(file.name || "");
      if (!name) return;

      let filePath = name;

      if (!filePath.startsWith("/")) {
        if (filePath.startsWith("src/")) {
          filePath = "/" + filePath;
        } else {
          filePath = "/src/" + filePath;
        }
      }

      files[filePath] = normalizeLineBreaks(file.content || "");
    });

    return {
      ok: true,
      entryPath: entryPath,
      files: files,
      errors: [],
      warnings: []
    };
  }

  function validateConfig(config) {
    const errors = [];
    const warnings = [];

    if (!trimOrEmpty(config.projectName)) {
      errors.push("プロジェクト名が空です。");
    }

    if (!/^[a-z0-9_-]+$/.test(config.projectName)) {
      errors.push("プロジェクト名は半角英数字・ハイフン・アンダーバーのみ使用できます。");
    }

    if (!trimOrEmpty(config.version)) {
      errors.push("version が空です。");
    }

    if (!/^\d+\.\d+\.\d+$/.test(config.version)) {
      errors.push("version は 0.1.0 の形式で入力してください。");
    }

    if (!["2015", "2018", "2021", "2024"].includes(config.edition)) {
      errors.push("edition は 2015 / 2018 / 2021 / 2024 のいずれかにしてください。");
    }

    if (!trimOrEmpty(config.entryPoint)) {
      errors.push("エントリーポイントが空です。");
    }

    if (!trimOrEmpty(config.mainRustCode)) {
      errors.push("メインRustコードが空です。");
    }

    if (!["debug", "release"].includes(config.buildMode)) {
      errors.push("ビルドモードは debug / release のいずれかにしてください。");
    }

    if (!["cdylib", "rlib", "bin"].includes(config.crateType)) {
      errors.push("crate-type は cdylib / rlib / bin のいずれかにしてください。");
    }

    if (!["wasm-js", "wasm-only", "js-only"].includes(config.outputMode)) {
      errors.push("出力形式が不正です。");
    }

    if (config.entryTarget === "lib" && config.crateType === "bin") {
      errors.push("lib.rs で crate-type bin は使えません。");
    }

    if (config.entryTarget === "main" && config.crateType !== "bin") {
      warnings.push("main.rs のため crate-type は bin として扱われます。");
    }

    if (config.entryTarget === "main" && config.outputMode !== "wasm-only") {
      warnings.push("main.rs は wasm-bindgen 用途ではなく、通常は lib.rs + cdylib を推奨します。");
    }

    const dependencies = normalizeDependencies(config.dependenciesText);

    if (
      config.mainRustCode.includes("wasm_bindgen") &&
      !dependencies.some(function (line) {
        return line.startsWith("wasm-bindgen");
      })
    ) {
      warnings.push("コード内に wasm_bindgen が見つかりました。dependencies に wasm-bindgen を追加してください。");
    }

    if (
      config.mainRustCode.includes("js_sys") &&
      !dependencies.some(function (line) {
        return line.startsWith("js-sys");
      })
    ) {
      warnings.push("コード内に js_sys が見つかりました。dependencies に js-sys を追加してください。");
    }

    if (
      config.mainRustCode.includes("sha2") &&
      !dependencies.some(function (line) {
        return line.startsWith("sha2");
      })
    ) {
      warnings.push("コード内に sha2 が見つかりました。dependencies に sha2 を追加してください。");
    }

    return {
      errors: errors,
      warnings: warnings
    };
  }

  function makeBuildRequest(config, virtualFs) {
    return {
      schemaVersion: 1,
      builder: {
        moduleName: MODULE_NAME,
        moduleVersion: MODULE_VERSION
      },
      build: {
        buildId: config.buildId,
        timestamp: config.timestamp,
        projectName: config.projectName,
        version: config.version,
        edition: config.edition,
        entryPoint: config.entryPoint,
        entryTarget: config.entryTarget,
        crateType: config.crateType,
        buildMode: config.buildMode,
        outputMode: config.outputMode
      },
      virtualFs: virtualFs
    };
  }

  function makeLogText(config, virtualFs, errors, warnings) {
    const lines = [];

    lines.push("Rust Wasm build request generated.");
    lines.push("module: " + MODULE_NAME);
    lines.push("version: " + MODULE_VERSION);
    lines.push("build id: " + config.buildId);
    lines.push("timestamp: " + config.timestamp);
    lines.push("project: " + config.projectName);
    lines.push("entry: " + config.entryPoint);
    lines.push("entry target: " + config.entryTarget);
    lines.push("crate type: " + config.crateType);
    lines.push("build mode: " + config.buildMode);
    lines.push("output mode: " + config.outputMode);
    lines.push("");

    lines.push("virtual fs:");
    Object.keys(virtualFs.files || {}).sort().forEach(function (path) {
      lines.push("- " + path);
    });

    lines.push("");
    lines.push("errors:");
    if (errors.length) {
      errors.forEach(function (item) {
        lines.push("- " + item);
      });
    } else {
      lines.push("- なし");
    }

    lines.push("");
    lines.push("warnings:");
    if (warnings.length) {
      warnings.forEach(function (item) {
        lines.push("- " + item);
      });
    } else {
      lines.push("- なし");
    }

    lines.push("");
    lines.push("note:");
    lines.push("- このファイルは本物の .wasm を生成しません。");
    lines.push("- 本物の .wasm は GitHub Actions の cargo build によって生成します。");

    return lines.join("\n");
  }

  function makeSourceBundle(config, virtualFs) {
    const lines = [];

    lines.push("// Rust source bundle");
    lines.push("// build id: " + config.buildId);
    lines.push("// project: " + config.projectName);
    lines.push("// generated at: " + config.timestamp);
    lines.push("");

    Object.keys(virtualFs.files || {}).sort().forEach(function (path) {
      lines.push("===== FILE: " + path + " =====");
      lines.push(virtualFs.files[path]);
      lines.push("");
    });

    return lines.join("\n");
  }

  function makeSummaryHtml(config, errors, warnings, outputFiles) {
    function makeList(items) {
      if (!items.length) return "<p>なし</p>";
      return "<ul>" + items.map(function (item) {
        return "<li>" + escapeHtml(item) + "</li>";
      }).join("") + "</ul>";
    }

    return [
      '<div class="rust-build-request-summary">',
      "<p><strong>モジュール:</strong> " + escapeHtml(MODULE_NAME) + "</p>",
      "<p><strong>バージョン:</strong> " + escapeHtml(MODULE_VERSION) + "</p>",
      "<p><strong>ビルドID:</strong> " + escapeHtml(config.buildId) + "</p>",
      "<p><strong>状態:</strong> " + escapeHtml(errors.length ? "error" : "request-ready") + "</p>",
      "<p><strong>プロジェクト:</strong> " + escapeHtml(config.projectName) + "</p>",
      "<p><strong>entry:</strong> " + escapeHtml(config.entryPoint) + "</p>",
      "<p><strong>build-mode:</strong> " + escapeHtml(config.buildMode) + "</p>",
      "<p><strong>output-mode:</strong> " + escapeHtml(config.outputMode) + "</p>",
      "<h4>エラー</h4>",
      makeList(errors),
      "<h4>警告</h4>",
      makeList(warnings),
      "<h4>生成ファイル</h4>",
      makeList(outputFiles.map(function (file) {
        return file.name;
      })),
      "</div>"
    ].join("");
  }

  function buildOutputFileMap(outputFiles) {
    const map = {
      buildRequestJson: null,
      cargoToml: null,
      sourceBundle: null,
      buildLog: null
    };

    toArray(outputFiles).forEach(function (file) {
      if (!file || typeof file !== "object") return;

      if (file.name === "build-request.json") {
        map.buildRequestJson = clone(file);
      }

      if (file.name === "Cargo.toml") {
        map.cargoToml = clone(file);
      }

      if (file.name === "source-bundle.txt") {
        map.sourceBundle = clone(file);
      }

      if (file.name === "build-log.txt") {
        map.buildLog = clone(file);
      }
    });

    return map;
  }

  function compile(input) {
    const config = collectConfig(input);
    const virtualFs = buildVirtualFs(config);
    const validation = validateConfig(config);

    const errors = validation.errors;
    const warnings = validation.warnings;

    const buildRequest = makeBuildRequest(config, virtualFs);
    const logText = makeLogText(config, virtualFs, errors, warnings);
    const sourceBundle = makeSourceBundle(config, virtualFs);

    const outputFiles = [
      {
        name: "build-request.json",
        type: "application/json;charset=utf-8",
        content: JSON.stringify(buildRequest, null, 2)
      },
      {
        name: "Cargo.toml",
        type: "text/plain;charset=utf-8",
        content: virtualFs.files["/Cargo.toml"] || ""
      },
      {
        name: "source-bundle.txt",
        type: "text/plain;charset=utf-8",
        content: sourceBundle
      },
      {
        name: "build-log.txt",
        type: "text/plain;charset=utf-8",
        content: logText
      }
    ];

    return {
      ok: errors.length === 0,
      status: errors.length === 0 ? "request-ready" : "error",
      mode: "build-request",
      compileKind: "request-only",

      moduleName: MODULE_NAME,
      moduleVersion: MODULE_VERSION,

      buildId: config.buildId,
      timestamp: config.timestamp,

      config: clone(config),
      virtualFs: clone(virtualFs),

      errors: clone(errors),
      warnings: clone(warnings),

      outputFiles: clone(outputFiles),
      outputFileMap: buildOutputFileMap(outputFiles),

      logText: logText,
      outputText: sourceBundle,
      summaryHtml: makeSummaryHtml(config, errors, warnings, outputFiles)
    };
  }

  global.RustBuildRequestBuilder = {
    moduleName: MODULE_NAME,
    version: MODULE_VERSION,
    collectConfig: collectConfig,
    validateConfig: validateConfig,
    buildCargoToml: buildCargoToml,
    buildVirtualFs: buildVirtualFs,
    compile: compile
  };
})(window);