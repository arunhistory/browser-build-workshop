(function () {
  "use strict";

  const els = {};

  document.addEventListener("DOMContentLoaded", function () {
    try {
      collectElements();
      bootPage();
    } catch (error) {
      showFatalError(error);
    }
  });

  function bootPage() {
    const missingModules = checkRequiredModules();

    if (missingModules.length > 0) {
      showFatalError(
        new Error("必要モジュールが読み込まれていません: " + missingModules.join(", "))
      );
      return;
    }

    bindEvents();

    window.TSBuildEngine.boot();

    syncPageFromState();
    renderAll();

    writeLog("TS Build Page 起動完了");
  }

  function checkRequiredModules() {
    const requiredModules = [
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

    return requiredModules.filter(function (name) {
      return !window[name];
    });
  }

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

    els.runBuild = document.getElementById("runBuild");
    els.clearLog = document.getElementById("clearLog");

    els.logOutput = document.getElementById("logOutput");
    els.jsOutput = document.getElementById("jsOutput");

    els.downloadJs = document.getElementById("downloadJs");
    els.downloadLog = document.getElementById("downloadLog");
    els.downloadAll = document.getElementById("downloadAll");
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

        const nextName = getFileNameValue();
        window.TSBuildEngine.renameActiveFile(nextName);

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
        const files = window.TSBuildEngine.getFiles();
        const active = window.TSBuildEngine.getActiveFile();

        if (!active) {
          throw new Error("現在のファイルが見つかりません。");
        }

        if (files.length <= 1) {
          throw new Error("最低1つのTSファイルが必要です。");
        }

        const ok = confirm(active.name + " を削除しますか？");

        if (!ok) return;

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

        writeLog("変換実行ボタンを押しました。");
        setRunningUI(true);

        const result = window.TSBuildEngine.build();

        renderLog();
        renderOutput();

        if (!result.ok) {
          const message =
            result.error && result.error.message
              ? result.error.message
              : "TS変換に失敗しました。";

          throw new Error(message);
        }

        writeLog("変換処理が完了しました。");
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

    if (els.moduleMode) {
      const moduleMode = settings.moduleMode || "esnext";

      if (hasOption(els.moduleMode, moduleMode)) {
        els.moduleMode.value = moduleMode;
      }
    }

    if (els.targetMode) {
      const targetMode = settings.targetMode || "es2020";

      if (hasOption(els.targetMode, targetMode)) {
        els.targetMode.value = targetMode;
      }
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

    if (window.TSBuildEngine && typeof window.TSBuildEngine.getLogText === "function") {
      els.logOutput.textContent = window.TSBuildEngine.getLogText();
      return;
    }

    els.logOutput.textContent = "ログ取得機能が見つかりません。";
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

  function showFatalError(error) {
    const message =
      error && error.message
        ? error.message
        : String(error || "unknown error");

    if (els.logOutput) {
      els.logOutput.textContent =
        "[FATAL] " + message + "\n\n" +
        "確認するもの:\n" +
        "1. typescript.js が ts-compiler.js より前に読み込まれているか\n" +
        "2. core フォルダのファイル名が一致しているか\n" +
        "3. ts-build-engine.js が ts-build-page.js より前に読み込まれているか\n" +
        "4. HTML側のIDが不足していないか";
    } else {
      alert("[FATAL] " + message);
    }
  }

  function safeRun(fn, alertOnError) {
    try {
      return fn();
    } catch (error) {
      const message =
        error && error.message
          ? error.message
          : String(error || "unknown error");

      if (window.TSLogger && typeof window.TSLogger.error === "function") {
        window.TSLogger.error(message);
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

  function getFileNameValue() {
    const value = els.fileName ? els.fileName.value.trim() : "";

    if (!value) {
      return "main.ts";
    }

    if (value.endsWith(".ts") || value.endsWith(".tsx")) {
      return value;
    }

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
    if (!select) return false;

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