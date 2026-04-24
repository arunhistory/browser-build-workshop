(function () {
  "use strict";

  const PAGE_VERSION = "ts-build-page-connected-diagnostic-v4";
  const els = {};

  document.addEventListener("DOMContentLoaded", function () {
    collectElements();
    bootPage();
  });

  function collectElements() {
    els.goHome = document.getElementById("goHome");
    els.goRustPage = document.getElementById("goRustPage");

    els.projectName = document.getElementById("projectName");
    els.fileName =
      document.getElementById("fileName") ||
      document.getElementById("entryFileName");

    els.outputName = document.getElementById("outputName");
    els.moduleMode = document.getElementById("moduleMode");
    els.targetMode = document.getElementById("targetMode");

    els.addFile = document.getElementById("addFile");
    els.deleteFile = document.getElementById("deleteFile");
    els.saveDraft = document.getElementById("saveDraft");
    els.loadDraft = document.getElementById("loadDraft");
    els.fileList = document.getElementById("fileList");

    els.tsInput =
      document.getElementById("tsInput") ||
      document.getElementById("mainTsInput");

    els.enableMinify = document.getElementById("enableMinify");
    els.enableObfuscate = document.getElementById("enableObfuscate");
    els.keepComments = document.getElementById("keepComments");
    els.strictMode = document.getElementById("strictMode");

    els.runBuild =
      document.getElementById("runBuild") ||
      document.getElementById("runBuildButton");

    els.clearLog = document.getElementById("clearLog");

    els.logOutput =
      document.getElementById("logOutput") ||
      document.getElementById("buildLog");

    els.jsOutput =
      document.getElementById("jsOutput") ||
      document.getElementById("buildOutput");

    els.downloadJs = document.getElementById("downloadJs");
    els.downloadLog = document.getElementById("downloadLog");
    els.downloadAll = document.getElementById("downloadAll");
  }

  function bootPage() {
    writeRawLog(makeDiagnosticText("BOOT"));

    const missing = getMissingModules();

    if (missing.length > 0) {
      writeRawLog(
        makeDiagnosticText("FATAL") +
          "\n\n[FATAL] 必要モジュールが読み込まれていません: " +
          missing.join(", ") +
          "\n\nこのページJSは起動しています。\n" +
          "つまり、問題は ts-build-page.js ではなく、上流モジュールの読み込みまたは実行停止です。"
      );
      return;
    }

    try {
      bindEvents();
      window.TSBuildEngine.boot();
      syncPageFromState();
      renderAll();

      writeLog("TS Build Page 接続起動完了");
    } catch (error) {
      writeRawLog(
        makeDiagnosticText("BOOT ERROR") +
          "\n\n[ERROR] bootPage 内で例外が発生しました。\n" +
          formatError(error)
      );
    }
  }

  function getRequiredModules() {
    return [
      "ts",
      "TSBuildState",
      "TSFileStore",
      "TSLogger",
      "TSCompiler",
      "TSMinifier",
      "TSObfuscator",
      "TSOutputManager",
      "TSStorage",
      "TSDownloader",
      "TSBuildEngine"
    ];
  }

  function getMissingModules() {
    return getRequiredModules().filter(function (name) {
      return !window[name];
    });
  }

  function makeDiagnosticText(label) {
    const lines = [];

    lines.push("=== TS Build Page Diagnostic ===");
    lines.push("label: " + label);
    lines.push("pageVersion: " + PAGE_VERSION);
    lines.push("time: " + new Date().toISOString());
    lines.push("");

    getRequiredModules().forEach(function (name) {
      lines.push("window." + name + ": " + Boolean(window[name]));
    });

    lines.push("");
    lines.push("=== Script Tags ===");

    Array.from(document.scripts).forEach(function (script, index) {
      lines.push(index + ": " + (script.src || "[inline script]"));
    });

    lines.push("");
    lines.push("=== Required Element Check ===");

    [
      "goHome",
      "goRustPage",
      "projectName",
      "fileName/entryFileName",
      "outputName",
      "moduleMode",
      "targetMode",
      "tsInput/mainTsInput",
      "runBuild/runBuildButton",
      "logOutput/buildLog",
      "jsOutput/buildOutput"
    ].forEach(function (labelText) {
      lines.push(labelText + ": " + hasElementGroup(labelText));
    });

    return lines.join("\n");
  }

  function hasElementGroup(labelText) {
    if (labelText === "fileName/entryFileName") {
      return Boolean(els.fileName);
    }

    if (labelText === "tsInput/mainTsInput") {
      return Boolean(els.tsInput);
    }

    if (labelText === "runBuild/runBuildButton") {
      return Boolean(els.runBuild);
    }

    if (labelText === "logOutput/buildLog") {
      return Boolean(els.logOutput);
    }

    if (labelText === "jsOutput/buildOutput") {
      return Boolean(els.jsOutput);
    }

    return Boolean(document.getElementById(labelText));
  }

  function bindEvents() {
    on(els.goHome, "click", function () {
      location.href = "./index.html";
    });

    on(els.goRustPage, "click", function () {
      location.href = "./rust-build.html";
    });

    on(els.fileName, "change", function () {
      safeRun(function () {
        syncCurrentCode();
        window.TSBuildEngine.renameActiveFile(getFileNameValue());
        syncPageFromState();
        renderAll();
      });
    });

    on(els.addFile, "click", function () {
      safeRun(function () {
        syncCurrentCode();

        const name = prompt("追加するTSファイル名", createNextFileName());
        if (name === null) return;

        window.TSBuildEngine.addFile(name, "");
        syncPageFromState();
        renderAll();
      });
    });

    on(els.deleteFile, "click", function () {
      safeRun(function () {
        const active = window.TSBuildEngine.getActiveFile();

        if (!active) {
          throw new Error("現在のファイルが見つかりません。");
        }

        if (window.TSBuildEngine.getFiles().length <= 1) {
          throw new Error("最低1つのTSファイルが必要です。");
        }

        window.TSBuildEngine.removeActiveFile();
        syncPageFromState();
        renderAll();
      });
    });

    on(els.saveDraft, "click", function () {
      safeRun(function () {
        syncStateFromPage();
        window.TSBuildEngine.saveDraft();
        renderLog();
      });
    });

    on(els.loadDraft, "click", function () {
      safeRun(function () {
        window.TSBuildEngine.loadDraft();
        syncPageFromState();
        renderAll();
      });
    });

    on(els.tsInput, "input", function () {
      safeRun(function () {
        syncCurrentCode();
      }, false);
    });

    [
      els.outputName,
      els.moduleMode,
      els.targetMode,
      els.enableMinify,
      els.enableObfuscate,
      els.keepComments,
      els.strictMode
    ].forEach(function (element) {
      on(element, "change", function () {
        safeRun(function () {
          updateSettingsFromPage();
        }, false);
      });
    });

    on(els.runBuild, "click", function () {
      safeRun(function () {
        syncStateFromPage();

        writeLog("変換実行ボタンを押しました。TSBuildEngine.build() を呼び出します。");
        setRunningUI(true);

        const result = window.TSBuildEngine.build();

        renderLog();
        renderOutput();

        if (!result || !result.ok) {
          throw new Error(
            result && result.error && result.error.message
              ? result.error.message
              : "TSBuildEngine.build() が失敗しました。"
          );
        }

        writeLog("TSBuildEngine.build() が完了しました。");
        renderLog();
        renderOutput();
      });
    });

    on(els.clearLog, "click", function () {
      safeRun(function () {
        window.TSBuildEngine.clearLogs();
        renderLog();
      });
    });

    on(els.downloadJs, "click", function () {
      safeRun(function () {
        window.TSBuildEngine.downloadPrimaryOutput();
      });
    });

    on(els.downloadLog, "click", function () {
      safeRun(function () {
        window.TSBuildEngine.downloadBuildLog();
      });
    });

    on(els.downloadAll, "click", function () {
      safeRun(function () {
        window.TSBuildEngine.downloadAllAsTextBundle();
      });
    });
  }

  function on(element, eventName, handler) {
    if (!element) return;
    element.addEventListener(eventName, handler);
  }

  function syncStateFromPage() {
    syncCurrentCode();

    const active = window.TSBuildEngine.getActiveFile();

    if (active && els.fileName) {
      window.TSBuildEngine.renameActiveFile(getFileNameValue());
    }

    updateSettingsFromPage();
  }

  function syncCurrentCode() {
    const active = window.TSBuildEngine.getActiveFile();

    if (!active || !els.tsInput) return;

    window.TSBuildEngine.updateActiveFileCode(els.tsInput.value);
  }

  function syncPageFromState() {
    const active = window.TSBuildEngine.getActiveFile();
    const settings = window.TSBuildEngine.getSettings();

    if (active) {
      if (els.fileName) {
        els.fileName.value = active.name || "main.ts";
      }

      if (els.tsInput) {
        els.tsInput.value = active.code || "";
      }
    }

    if (els.outputName) {
      els.outputName.value = settings.outputName || "index.js";
    }

    if (els.moduleMode && settings.moduleMode && hasOption(els.moduleMode, settings.moduleMode)) {
      els.moduleMode.value = settings.moduleMode;
    }

    if (els.targetMode && settings.targetMode && hasOption(els.targetMode, settings.targetMode)) {
      els.targetMode.value = settings.targetMode;
    }

    if (els.enableMinify) {
      els.enableMinify.checked = Boolean(settings.enableMinify);
    }

    if (els.enableObfuscate) {
      els.enableObfuscate.checked = Boolean(settings.enableObfuscate);
    }

    if (els.keepComments) {
      els.keepComments.checked = settings.keepComments !== false;
    }

    if (els.strictMode) {
      els.strictMode.checked = settings.strictMode !== false;
    }
  }

  function updateSettingsFromPage() {
    window.TSBuildEngine.updateSettings({
      outputName: els.outputName ? els.outputName.value : "index.js",
      moduleMode: els.moduleMode ? els.moduleMode.value : "esnext",
      targetMode: els.targetMode ? els.targetMode.value : "es2020",
      enableMinify: els.enableMinify ? els.enableMinify.checked : false,
      enableObfuscate: els.enableObfuscate ? els.enableObfuscate.checked : false,
      keepComments: els.keepComments ? els.keepComments.checked : true,
      strictMode: els.strictMode ? els.strictMode.checked : true
    });
  }

  function renderAll() {
    renderFileList();
    renderLog();
    renderOutput();
    setRunningUI(false);
  }

  function renderFileList() {
    if (!els.fileList) return;

    const files = window.TSBuildEngine.getFiles();
    const active = window.TSBuildEngine.getActiveFile();

    els.fileList.innerHTML = "";

    files.forEach(function (file) {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "file-item";

      if (active && active.id === file.id) {
        button.className += " active";
      }

      button.textContent = file.name;

      button.addEventListener("click", function () {
        safeRun(function () {
          syncCurrentCode();
          window.TSBuildEngine.selectFile(file.id);
          syncPageFromState();
          renderAll();
        });
      });

      els.fileList.appendChild(button);
    });
  }

  function renderLog() {
    if (!els.logOutput) return;

    if (
      window.TSBuildEngine &&
      typeof window.TSBuildEngine.getLogText === "function"
    ) {
      writeRawLog(window.TSBuildEngine.getLogText());
      return;
    }

    writeRawLog(makeDiagnosticText("LOG FALLBACK"));
  }

  function renderOutput() {
    if (!els.jsOutput) return;

    const primary = window.TSBuildEngine.getPrimaryOutput();

    if (!primary) {
      els.jsOutput.value = "";
      return;
    }

    els.jsOutput.value = primary.code || "";
  }

  function writeLog(message) {
    if (window.TSLogger && typeof window.TSLogger.info === "function") {
      window.TSLogger.info(message);
    }

    renderLog();
  }

  function writeRawLog(text) {
    if (!els.logOutput) return;

    if ("value" in els.logOutput) {
      els.logOutput.value = text || "";
    } else {
      els.logOutput.textContent = text || "";
    }
  }

  function safeRun(fn, alertOnError) {
    try {
      return fn();
    } catch (error) {
      const message = formatError(error);

      if (window.TSLogger && typeof window.TSLogger.error === "function") {
        window.TSLogger.error(message);
      } else {
        writeRawLog(makeDiagnosticText("RUNTIME ERROR") + "\n\n" + message);
      }

      renderLog();

      if (alertOnError !== false) {
        alert(message);
      }

      return null;
    } finally {
      setRunningUI(false);
    }
  }

  function formatError(error) {
    if (!error) return "unknown error";
    if (error.stack) return String(error.stack);
    if (error.message) return String(error.message);
    return String(error);
  }

  function getFileNameValue() {
    const value = els.fileName ? els.fileName.value.trim() : "";

    if (!value) return "main.ts";
    if (value.endsWith(".ts") || value.endsWith(".tsx")) return value;

    return value + ".ts";
  }

  function createNextFileName() {
    const files = window.TSBuildEngine.getFiles();
    let index = files.length + 1;

    while (
      files.some(function (file) {
        return file.name === "module-" + index + ".ts";
      })
    ) {
      index++;
    }

    return "module-" + index + ".ts";
  }

  function hasOption(select, value) {
    return Array.from(select.options).some(function (option) {
      return option.value === value;
    });
  }

  function setRunningUI(forceValue) {
    const running =
      typeof forceValue === "boolean"
        ? forceValue
        : Boolean(
            window.TSBuildState &&
              typeof window.TSBuildState.isRunning === "function" &&
              window.TSBuildState.isRunning()
          );

    [
      els.addFile,
      els.deleteFile,
      els.saveDraft,
      els.loadDraft,
      els.runBuild,
      els.downloadJs,
      els.downloadLog,
      els.downloadAll
    ].forEach(function (button) {
      if (!button) return;
      button.disabled = running;
    });

    if (els.runBuild) {
      els.runBuild.textContent = running ? "変換中..." : "変換実行";
    }
  }
})();