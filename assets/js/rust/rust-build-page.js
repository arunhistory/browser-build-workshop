(function (global) {
  "use strict";

  const state = {
    files: [],
    activeFileId: null,
    lastBuildResult: null,
    isRunning: false
  };

  function getEl(id) {
    return document.getElementById(id);
  }

  function safeValue(id, fallback) {
    const el = getEl(id);
    if (!el) return fallback || "";
    return typeof el.value === "string" ? el.value : (fallback || "");
  }

  function setValue(id, value) {
    const el = getEl(id);
    if (el) {
      el.value = value;
    }
  }

  function setText(id, value) {
    const el = getEl(id);
    if (el) {
      el.textContent = value;
    }
  }

  function setDisabled(id, disabled) {
    const el = getEl(id);
    if (el) {
      el.disabled = !!disabled;
    }
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function createId(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  }

  function normalizeTsFileName(name) {
    const value = String(name || "main.ts").trim();

    if (!value) return "main.ts";
    if (value.endsWith(".ts") || value.endsWith(".tsx")) return value;

    return value + ".ts";
  }

  function toJsFileName(name) {
    return String(name || "main.ts")
      .replace(/\.tsx$/i, ".js")
      .replace(/\.ts$/i, ".js");
  }

  function getActiveFile() {
    return state.files.find(function (file) {
      return file.id === state.activeFileId;
    }) || null;
  }

  function getTsInputEl() {
    return getEl("tsInput") || getEl("mainTsInput");
  }

  function getJsOutputEl() {
    return getEl("jsOutput") || getEl("buildOutput");
  }

  function getLogEl() {
    return getEl("logOutput") || getEl("buildLog");
  }

  function showStatus(message) {
    const statusEl = getEl("buildStatus");

    if (statusEl) {
      statusEl.textContent = "状態: " + message;
      return;
    }

    appendLog("[STATUS] " + message);
  }

  function showLog(text) {
    const logEl = getLogEl();
    if (!logEl) return;

    if ("value" in logEl) {
      logEl.value = text || "";
      return;
    }

    logEl.textContent = text || "";
  }

  function appendLog(text) {
    const logEl = getLogEl();
    if (!logEl) return;

    const current = "value" in logEl ? logEl.value : logEl.textContent;
    const next = current ? current + "\n" + text : text;

    if ("value" in logEl) {
      logEl.value = next;
    } else {
      logEl.textContent = next;
    }
  }

  function showOutput(text) {
    const outputEl = getJsOutputEl();
    if (!outputEl) return;

    if ("value" in outputEl) {
      outputEl.value = text || "";
      return;
    }

    outputEl.textContent = text || "";
  }

  function collectSettings() {
    return {
      projectName: safeValue("projectName", "sample-ts-project").trim() || "sample-ts-project",
      entryFileName: normalizeTsFileName(safeValue("fileName", "main.ts")),
      outputName: safeValue("outputName", "index.js").trim() || "index.js",
      moduleMode: safeValue("moduleMode", "esnext").trim() || "esnext",
      targetMode: safeValue("targetMode", "es2020").trim() || "es2020",
      enableMinify: !!getEl("enableMinify") && !!getEl("enableMinify").checked,
      enableObfuscate: !!getEl("enableObfuscate") && !!getEl("enableObfuscate").checked,
      keepComments: !getEl("keepComments") || !!getEl("keepComments").checked,
      strictMode: !getEl("strictMode") || !!getEl("strictMode").checked
    };
  }

  function syncCurrentInputToFile() {
    const active = getActiveFile();
    const input = getTsInputEl();

    if (!active || !input) return;

    active.name = normalizeTsFileName(safeValue("fileName", active.name));
    active.content = input.value || "";
  }

  function syncFileToPage(file) {
    const input = getTsInputEl();

    if (!file) return;

    setValue("fileName", file.name);

    if (input) {
      input.value = file.content || "";
    }
  }

  function createInitialFile() {
    const input = getTsInputEl();

    const file = {
      id: createId("ts-file"),
      name: normalizeTsFileName(safeValue("fileName", "main.ts")),
      content: input ? input.value : ""
    };

    state.files = [file];
    state.activeFileId = file.id;
  }

  function createNextFileName() {
    let index = state.files.length + 1;

    while (
      state.files.some(function (file) {
        return file.name === "module-" + index + ".ts";
      })
    ) {
      index++;
    }

    return "module-" + index + ".ts";
  }

  function renderFiles() {
    const target = getEl("fileList");
    if (!target) return;

    if (!state.files.length) {
      target.innerHTML = [
        '<div class="file-item">',
        "  <span>TSファイルはまだありません</span>",
        "</div>"
      ].join("");
      return;
    }

    target.innerHTML = state.files.map(function (file, index) {
      const active = file.id === state.activeFileId ? " active" : "";

      return [
        '<div class="file-item' + active + '">',
        "  <div>",
        "    <strong>" + escapeHtml(file.name) + "</strong>",
        "    <div>文字数: " + String((file.content || "").length) + "</div>",
        "  </div>",
        '  <div class="file-item-actions">',
        '    <button type="button" class="btn btn-muted" data-action="view-ts-file" data-index="' + String(index) + '">表示</button>',
        '    <button type="button" class="btn btn-danger" data-action="remove-ts-file" data-index="' + String(index) + '">削除</button>',
        "  </div>",
        "</div>"
      ].join("");
    }).join("");
  }

  function addFile() {
    syncCurrentInputToFile();

    const name = prompt("追加するTSファイル名", createNextFileName());
    if (name === null) return;

    const fileName = normalizeTsFileName(name);

    const exists = state.files.some(function (file) {
      return file.name === fileName;
    });

    if (exists) {
      showStatus("同じ名前のTSファイルは追加できません");
      return;
    }

    const file = {
      id: createId("ts-file"),
      name: fileName,
      content: ""
    };

    state.files.push(file);
    state.activeFileId = file.id;

    syncFileToPage(file);
    renderFiles();
    showStatus("TSファイルを追加しました: " + file.name);
  }

  function removeFile(index) {
    if (state.files.length <= 1) {
      showStatus("最低1つのTSファイルが必要です");
      return;
    }

    if (index < 0 || index >= state.files.length) {
      showStatus("削除対象のTSファイルが見つかりません");
      return;
    }

    const removed = state.files.splice(index, 1)[0];

    if (removed.id === state.activeFileId) {
      const next = state.files[index] || state.files[index - 1] || state.files[0];
      state.activeFileId = next.id;
      syncFileToPage(next);
    }

    renderFiles();
    showStatus("TSファイルを削除しました: " + removed.name);
  }

  function viewFile(index) {
    if (index < 0 || index >= state.files.length) {
      showStatus("表示対象のTSファイルが見つかりません");
      return;
    }

    syncCurrentInputToFile();

    const file = state.files[index];
    state.activeFileId = file.id;

    syncFileToPage(file);
    renderFiles();
    showStatus("TSファイルを表示しました: " + file.name);
  }

  function lockUi(locked) {
    setDisabled("runBuild", locked);
    setDisabled("runBuildButton", locked);
    setDisabled("addFile", locked);
    setDisabled("deleteFile", locked);
    setDisabled("saveDraft", locked);
    setDisabled("loadDraft", locked);
    setDisabled("downloadJs", locked);
    setDisabled("downloadLog", locked);
    setDisabled("downloadAll", locked);
    setDisabled("clearLog", locked);
  }

  function toTsModuleKind(value) {
    const ts = global.ts;
    const mode = String(value || "esnext").toLowerCase();

    if (mode === "none") return ts.ModuleKind.None;
    if (mode === "commonjs") return ts.ModuleKind.CommonJS;
    if (mode === "amd") return ts.ModuleKind.AMD;
    if (mode === "umd") return ts.ModuleKind.UMD;
    if (mode === "system") return ts.ModuleKind.System;
    if (mode === "es2015") return ts.ModuleKind.ES2015;
    if (mode === "es2020") return ts.ModuleKind.ES2020;
    if (mode === "es2022") return ts.ModuleKind.ES2022;
    if (mode === "node16") return ts.ModuleKind.Node16;
    if (mode === "nodenext") return ts.ModuleKind.NodeNext;

    return ts.ModuleKind.ESNext;
  }

  function toTsTarget(value) {
    const ts = global.ts;
    const target = String(value || "es2020").toLowerCase();

    if (target === "es3") return ts.ScriptTarget.ES3;
    if (target === "es5") return ts.ScriptTarget.ES5;
    if (target === "es6") return ts.ScriptTarget.ES2015;
    if (target === "es2015") return ts.ScriptTarget.ES2015;
    if (target === "es2016") return ts.ScriptTarget.ES2016;
    if (target === "es2017") return ts.ScriptTarget.ES2017;
    if (target === "es2018") return ts.ScriptTarget.ES2018;
    if (target === "es2019") return ts.ScriptTarget.ES2019;
    if (target === "es2020") return ts.ScriptTarget.ES2020;
    if (target === "es2021") return ts.ScriptTarget.ES2021;
    if (target === "es2022") return ts.ScriptTarget.ES2022;
    if (target === "esnext") return ts.ScriptTarget.ESNext;

    return ts.ScriptTarget.ES2020;
  }

  function flattenDiagnostic(messageText) {
    if (!global.ts) return String(messageText || "");
    return global.ts.flattenDiagnosticMessageText(messageText, "\n");
  }

  function getDiagnosticLine(source, diagnostic) {
    if (typeof diagnostic.start !== "number") {
      return {
        line: 1,
        text: ""
      };
    }

    const before = source.slice(0, diagnostic.start);
    const line = before.split(/\r?\n/).length;
    const sourceLines = source.split(/\r?\n/);

    return {
      line: line,
      text: sourceLines[line - 1] || ""
    };
  }

  function compileOne(file, settings) {
    if (!global.ts || typeof global.ts.transpileModule !== "function") {
      throw new Error("TypeScript公式コンパイラが読み込まれていません。typescript.js を確認してください。");
    }

    const compilerOptions = {
      module: toTsModuleKind(settings.moduleMode),
      target: toTsTarget(settings.targetMode),
      strict: !!settings.strictMode,
      removeComments: settings.keepComments === false,
      esModuleInterop: true,
      skipLibCheck: true,
      isolatedModules: true,
      sourceMap: false,
      inlineSourceMap: false,
      inlineSources: false
    };

    const result = global.ts.transpileModule(file.content || "", {
      compilerOptions: compilerOptions,
      fileName: file.name,
      reportDiagnostics: true
    });

    const diagnostics = result.diagnostics || [];
    const logLines = [];

    diagnostics.forEach(function (diagnostic) {
      const position = getDiagnosticLine(file.content || "", diagnostic);
      const message = flattenDiagnostic(diagnostic.messageText);
      const category = global.ts.DiagnosticCategory[diagnostic.category] || "Message";

      logLines.push(
        "[" + category + "] " +
        file.name + ":" + position.line + " " +
        message
      );

      if (position.text) {
        logLines.push("  " + position.text);
      }
    });

    const hasError = diagnostics.some(function (diagnostic) {
      return diagnostic.category === global.ts.DiagnosticCategory.Error;
    });

    if (hasError) {
      throw new Error(file.name + " にTypeScript変換エラーがあります。\n" + logLines.join("\n"));
    }

    return {
      name: toJsFileName(file.name),
      content: result.outputText || "",
      type: "text/javascript;charset=utf-8",
      logLines: logLines
    };
  }

  function minifyJavaScript(code) {
    return String(code || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map(function (line) {
        return line.trim();
      })
      .filter(function (line) {
        return line.length > 0;
      })
      .join("\n");
  }

  function obfuscateJavaScript(code) {
    const header = [
      "(function(){",
      '"use strict";'
    ].join("\n");

    const footer = "\n})();";

    return header + "\n" + String(code || "") + footer;
  }

  function runBuild() {
    if (state.isRunning) {
      showStatus("変換実行中です");
      return;
    }

    syncCurrentInputToFile();

    const settings = collectSettings();

    state.isRunning = true;
    lockUi(true);
    showStatus("変換中...");
    showLog("TypeScript変換を開始します...");
    showOutput("");

    try {
      const outputFiles = [];
      const logLines = [];

      logLines.push("=== TS Build Start ===");
      logLines.push("project: " + settings.projectName);
      logLines.push("module: " + settings.moduleMode);
      logLines.push("target: " + settings.targetMode);
      logLines.push("files: " + String(state.files.length));
      logLines.push("");

      state.files.forEach(function (file) {
        logLines.push("[compile] " + file.name);

        const output = compileOne(file, settings);

        output.logLines.forEach(function (line) {
          logLines.push(line);
        });

        let content = output.content;

        if (settings.enableMinify) {
          content = minifyJavaScript(content);
          logLines.push("[minify] " + output.name);
        }

        if (settings.enableObfuscate) {
          content = obfuscateJavaScript(content);
          logLines.push("[obfuscate] " + output.name);
        }

        outputFiles.push({
          name: output.name,
          content: content,
          type: output.type
        });
      });

      let outputText = "";

      if (outputFiles.length === 1) {
        outputText = outputFiles[0].content;
      } else {
        outputText = outputFiles.map(function (file) {
          return [
            "/* ===== " + file.name + " ===== */",
            file.content
          ].join("\n");
        }).join("\n\n");
      }

      logLines.push("");
      logLines.push("=== TS Build Success ===");

      state.lastBuildResult = {
        ok: true,
        config: settings,
        outputFiles: outputFiles,
        outputText: outputText,
        logText: logLines.join("\n")
      };

      showLog(state.lastBuildResult.logText);
      showOutput(outputText);
      showStatus("変換成功");
    } catch (error) {
      state.lastBuildResult = null;

      const message = String(error && error.stack ? error.stack : error);

      showLog(message);
      showOutput("");
      showStatus("変換失敗");
    } finally {
      state.isRunning = false;
      lockUi(false);
    }
  }

  function clearLog() {
    showLog("");
    showStatus("ログを削除しました");
  }

  function saveDraft() {
    syncCurrentInputToFile();

    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      files: state.files,
      activeFileId: state.activeFileId,
      settings: collectSettings()
    };

    localStorage.setItem("browser-build-workshop:ts-draft:v1", JSON.stringify(data));
    showStatus("下書きを保存しました");
  }

  function loadDraft() {
    const raw = localStorage.getItem("browser-build-workshop:ts-draft:v1");

    if (!raw) {
      showStatus("保存済みの下書きがありません");
      return;
    }

    try {
      const data = JSON.parse(raw);

      if (!data || !Array.isArray(data.files) || !data.files.length) {
        throw new Error("下書きデータが不正です");
      }

      state.files = data.files;
      state.activeFileId = data.activeFileId || state.files[0].id;

      if (!getActiveFile()) {
        state.activeFileId = state.files[0].id;
      }

      if (data.settings) {
        setValue("projectName", data.settings.projectName || "sample-ts-project");
        setValue("fileName", data.settings.entryFileName || "main.ts");
        setValue("outputName", data.settings.outputName || "index.js");
        setValue("moduleMode", data.settings.moduleMode || "esnext");
        setValue("targetMode", data.settings.targetMode || "es2020");

        if (getEl("enableMinify")) getEl("enableMinify").checked = !!data.settings.enableMinify;
        if (getEl("enableObfuscate")) getEl("enableObfuscate").checked = !!data.settings.enableObfuscate;
        if (getEl("keepComments")) getEl("keepComments").checked = data.settings.keepComments !== false;
        if (getEl("strictMode")) getEl("strictMode").checked = data.settings.strictMode !== false;
      }

      syncFileToPage(getActiveFile());
      renderFiles();
      showStatus("下書きを読み込みました");
    } catch (error) {
      showStatus("下書きの読み込みに失敗しました");
      showLog(String(error && error.stack ? error.stack : error));
    }
  }

  function downloadByAnchor(filename, content, mimeType) {
    const blob = new Blob([content], {
      type: mimeType || "text/plain;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function downloadJs() {
    if (!state.lastBuildResult || !Array.isArray(state.lastBuildResult.outputFiles)) {
      showStatus("保存するJS出力がありません");
      return;
    }

    const files = state.lastBuildResult.outputFiles;

    if (!files.length) {
      showStatus("保存するJS出力がありません");
      return;
    }

    if (files.length === 1) {
      downloadByAnchor(files[0].name, files[0].content || "", files[0].type);
      showStatus("JSを保存しました");
      return;
    }

    downloadAll();
  }

  function downloadLog() {
    if (!state.lastBuildResult || !state.lastBuildResult.logText) {
      showStatus("保存するログがありません");
      return;
    }

    const projectName = state.lastBuildResult.config.projectName || "ts-build";
    downloadByAnchor(projectName + "-build-log.txt", state.lastBuildResult.logText, "text/plain;charset=utf-8");
    showStatus("ログを保存しました");
  }

  function downloadAll() {
    if (!state.lastBuildResult || !Array.isArray(state.lastBuildResult.outputFiles)) {
      showStatus("保存する出力がありません");
      return;
    }

    const files = state.lastBuildResult.outputFiles;

    if (!files.length) {
      showStatus("保存する出力がありません");
      return;
    }

    const text = files.map(function (file) {
      return [
        "===== " + file.name + " =====",
        file.content || ""
      ].join("\n");
    }).join("\n\n");

    const projectName = state.lastBuildResult.config.projectName || "ts-output";
    downloadByAnchor(projectName + "-bundle.txt", text, "text/plain;charset=utf-8");
    showStatus("まとめて保存しました");
  }

  function bindButtons() {
    const addFileButton = getEl("addFile");
    const deleteFileButton = getEl("deleteFile");
    const saveDraftButton = getEl("saveDraft");
    const loadDraftButton = getEl("loadDraft");
    const runBuildButton = getEl("runBuild") || getEl("runBuildButton");
    const clearLogButton = getEl("clearLog");
    const downloadJsButton = getEl("downloadJs");
    const downloadLogButton = getEl("downloadLog");
    const downloadAllButton = getEl("downloadAll");

    if (addFileButton) addFileButton.addEventListener("click", addFile);

    if (deleteFileButton) {
      deleteFileButton.addEventListener("click", function () {
        const active = getActiveFile();

        if (!active) {
          showStatus("現在のファイルが見つかりません");
          return;
        }

        const index = state.files.findIndex(function (file) {
          return file.id === active.id;
        });

        removeFile(index);
      });
    }

    if (saveDraftButton) saveDraftButton.addEventListener("click", saveDraft);
    if (loadDraftButton) loadDraftButton.addEventListener("click", loadDraft);
    if (runBuildButton) runBuildButton.addEventListener("click", runBuild);
    if (clearLogButton) clearLogButton.addEventListener("click", clearLog);
    if (downloadJsButton) downloadJsButton.addEventListener("click", downloadJs);
    if (downloadLogButton) downloadLogButton.addEventListener("click", downloadLog);
    if (downloadAllButton) downloadAllButton.addEventListener("click", downloadAll);
  }

  function bindFileActions() {
    const list = getEl("fileList");
    if (!list) return;

    list.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const action = target.getAttribute("data-action");
      const index = Number(target.getAttribute("data-index"));

      if (!action || Number.isNaN(index)) return;

      if (action === "remove-ts-file") {
        removeFile(index);
        return;
      }

      if (action === "view-ts-file") {
        viewFile(index);
      }
    });
  }

  function bindNavigation() {
    const goHome = getEl("goHome");
    const goRustPage = getEl("goRustPage");

    if (goHome) {
      goHome.addEventListener("click", function () {
        location.href = "./index.html";
      });
    }

    if (goRustPage) {
      goRustPage.addEventListener("click", function () {
        location.href = "./rust-build.html";
      });
    }
  }

  function bindInputSync() {
    const input = getTsInputEl();

    if (input) {
      input.addEventListener("input", syncCurrentInputToFile);
    }

    const fileName = getEl("fileName");

    if (fileName) {
      fileName.addEventListener("change", function () {
        const active = getActiveFile();

        if (!active) return;

        active.name = normalizeTsFileName(fileName.value);
        fileName.value = active.name;
        renderFiles();
      });
    }
  }

  function ensureOptionalFields() {
    if (!getEl("projectName")) console.warn("projectName フィールドが見つかりません");
    if (!getEl("fileName")) console.warn("fileName フィールドが見つかりません");
    if (!getEl("outputName")) console.warn("outputName フィールドが見つかりません");
    if (!getEl("moduleMode")) console.warn("moduleMode フィールドが見つかりません");
    if (!getEl("targetMode")) console.warn("targetMode フィールドが見つかりません");
    if (!getTsInputEl()) console.warn("tsInput フィールドが見つかりません");
    if (!getJsOutputEl()) console.warn("jsOutput フィールドが見つかりません");
    if (!getLogEl()) console.warn("logOutput フィールドが見つかりません");
  }

  function init() {
    ensureOptionalFields();
    createInitialFile();
    bindButtons();
    bindFileActions();
    bindNavigation();
    bindInputSync();
    renderFiles();
    showLog("");
    showOutput("");
    showStatus("準備完了");
  }

  init();
})(window);