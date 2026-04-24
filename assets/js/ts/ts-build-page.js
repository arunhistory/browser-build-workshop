(function () {
  "use strict";

  const requiredModules = [
    "TSBuildEngine",
    "TSBuildState",
    "TSFileStore",
    "TSLogger",
    "TSOutputManager"
  ];

  for (const moduleName of requiredModules) {
    if (!window[moduleName]) {
      throw new Error(`${moduleName} is required before ts-build-page.js`);
    }
  }

  const Engine = window.TSBuildEngine;
  const State = window.TSBuildState;
  const Logger = window.TSLogger;
  const OutputManager = window.TSOutputManager;

  const els = {};

  document.addEventListener("DOMContentLoaded", function () {
    collectElements();
    bindEvents();
    Engine.boot();
    syncPageFromState();
    renderAll();
  });

  function collectElements() {
    els.goHome = document.getElementById("goHome");
    els.goRustPage = document.getElementById("goRustPage");

    els.fileName = document.getElementById("fileName");
    els.addFile = document.getElementById("addFile");
    els.deleteFile = document.getElementById("deleteFile");
    els.saveDraft = document.getElementById("saveDraft");
    els.loadDraft = document.getElementById("loadDraft");
    els.fileList = document.getElementById("fileList");

    els.tsInput = document.getElementById("tsInput");

    els.outputName = document.getElementById("outputName");
    els.targetMode = document.getElementById("targetMode");
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
    if (els.goHome) {
      els.goHome.addEventListener("click", function () {
        location.href = "./index.html";
      });
    }

    if (els.goRustPage) {
      els.goRustPage.addEventListener("click", function () {
        location.href = "./rust-build.html";
      });
    }

    if (els.fileName) {
      els.fileName.addEventListener("change", function () {
        runSafe(function () {
          Engine.renameActiveFile(els.fileName.value);
          renderAll();
        });
      });
    }

    if (els.addFile) {
      els.addFile.addEventListener("click", function () {
        runSafe(function () {
          const name = prompt("追加するTSファイル名", "module.ts");

          if (name === null) return;

          Engine.updateActiveFileCode(getInputCode());
          Engine.addFile(name, "");
          syncPageFromState();
          renderAll();
        });
      });
    }

    if (els.deleteFile) {
      els.deleteFile.addEventListener("click", function () {
        runSafe(function () {
          const active = Engine.getActiveFile();

          if (!active) return;

          const ok = confirm(`${active.name} を削除しますか？`);

          if (!ok) return;

          Engine.removeActiveFile();
          syncPageFromState();
          renderAll();
        });
      });
    }

    if (els.saveDraft) {
      els.saveDraft.addEventListener("click", function () {
        runSafe(function () {
          syncStateFromPage();
          Engine.saveDraft();
          renderLog();
        });
      });
    }

    if (els.loadDraft) {
      els.loadDraft.addEventListener("click", function () {
        runSafe(function () {
          Engine.loadDraft();
          syncPageFromState();
          renderAll();
        });
      });
    }

    if (els.tsInput) {
      els.tsInput.addEventListener("input", function () {
        runSafe(function () {
          Engine.updateActiveFileCode(getInputCode());
        }, false);
      });
    }

    const settingElements = [
      els.outputName,
      els.targetMode,
      els.enableMinify,
      els.enableObfuscate,
      els.keepComments,
      els.strictMode
    ];

    for (const item of settingElements) {
      if (!item) continue;

      item.addEventListener("change", function () {
        runSafe(function () {
          updateSettingsFromPage();
        }, false);
      });
    }

    if (els.runBuild) {
      els.runBuild.addEventListener("click", function () {
        runSafe(function () {
          syncStateFromPage();
          setRunningUI(true);

          const result = Engine.build();

          renderLog();
          renderOutput();

          if (!result.ok) {
            alert(result.error.message);
          }
        });
      });
    }

    if (els.clearLog) {
      els.clearLog.addEventListener("click", function () {
        runSafe(function () {
          Engine.clearLogs();
          renderLog();
        });
      });
    }

    if (els.downloadJs) {
      els.downloadJs.addEventListener("click", function () {
        runSafe(function () {
          Engine.downloadPrimaryOutput();
        });
      });
    }

    if (els.downloadLog) {
      els.downloadLog.addEventListener("click", function () {
        runSafe(function () {
          Engine.downloadBuildLog();
        });
      });
    }

    if (els.downloadAll) {
      els.downloadAll.addEventListener("click", function () {
        runSafe(function () {
          Engine.downloadAllAsTextBundle();
        });
      });
    }
  }

  function syncStateFromPage() {
    const active = Engine.getActiveFile();

    if (active) {
      Engine.updateActiveFileCode(getInputCode());

      if (els.fileName) {
        Engine.renameActiveFile(els.fileName.value);
      }
    }

    updateSettingsFromPage();
  }

  function syncPageFromState() {
    const active = Engine.getActiveFile();
    const settings = Engine.getSettings();

    if (active) {
      if (els.fileName) els.fileName.value = active.name;
      if (els.tsInput) els.tsInput.value = active.code || "";
    }

    if (els.outputName) els.outputName.value = settings.outputName || "main.js";
    if (els.targetMode) els.targetMode.value = settings.targetMode || "browser";
    if (els.enableMinify) els.enableMinify.checked = Boolean(settings.enableMinify);
    if (els.enableObfuscate) els.enableObfuscate.checked = Boolean(settings.enableObfuscate);
    if (els.keepComments) els.keepComments.checked = Boolean(settings.keepComments);
    if (els.strictMode) els.strictMode.checked = Boolean(settings.strictMode);
  }

  function updateSettingsFromPage() {
    Engine.updateSettings({
      outputName: els.outputName ? els.outputName.value : "main.js",
      targetMode: els.targetMode ? els.targetMode.value : "browser",
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

    const files = Engine.getFiles();
    const active = Engine.getActiveFile();

    els.fileList.innerHTML = "";

    for (const file of files) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "file-item";

      if (active && active.id === file.id) {
        button.className += " active";
      }

      button.textContent = file.name;

      button.addEventListener("click", function () {
        runSafe(function () {
          Engine.updateActiveFileCode(getInputCode());
          Engine.selectFile(file.id);
          syncPageFromState();
          renderAll();
        });
      });

      els.fileList.appendChild(button);
    }
  }

  function renderLog() {
    if (!els.logOutput) return;

    els.logOutput.textContent = Engine.getLogText();
  }

  function renderOutput() {
    if (!els.jsOutput) return;

    const primary = Engine.getPrimaryOutput();

    if (!primary) {
      els.jsOutput.value = "";
      return;
    }

    els.jsOutput.value = primary.code || "";
  }

  function getInputCode() {
    return els.tsInput ? els.tsInput.value : "";
  }

  function setRunningUI(forceValue) {
    const running = typeof forceValue === "boolean"
      ? forceValue
      : State.isRunning();

    const buttons = [
      els.addFile,
      els.deleteFile,
      els.saveDraft,
      els.loadDraft,
      els.runBuild,
      els.downloadJs,
      els.downloadLog,
      els.downloadAll
    ];

    for (const button of buttons) {
      if (!button) continue;
      button.disabled = running;
    }

    if (els.runBuild) {
      els.runBuild.textContent = running ? "変換中..." : "変換実行";
    }
  }

  function runSafe(fn, renderOnError) {
    try {
      return fn();
    } catch (error) {
      const message = error && error.message ? error.message : String(error);

      Logger.error(message);
      renderLog();

      if (renderOnError !== false) {
        alert(message);
      }

      return null;
    } finally {
      setRunningUI(false);
    }
  }
})();