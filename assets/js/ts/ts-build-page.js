(function () {
  "use strict";

  function get(id) {
    return document.getElementById(id);
  }

  function text(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value;
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function createDefaultMainCode() {
    return [
      'const message: string = "browser-build-workshop";',
      "const version: number = 1;",
      "",
      "function boot(name: string): string {",
      "  return `hello ${name}`;",
      "}",
      "",
      "console.log(message, version);",
      'console.log(boot("TypeScript"));'
    ].join("\n");
  }

  function createPageState() {
    return {
      subFiles: []
    };
  }

  function createElements() {
    return {
      goHome: get("goHome"),
      goRustPage: get("goRustPage"),
      projectName: get("projectName"),
      entryFileName: get("entryFileName"),
      outputFileName: get("outputFileName"),
      moduleType: get("moduleType"),
      targetType: get("targetType"),
      mainTsCode: get("mainTsCode"),
      subFileName: get("subFileName"),
      subFileCode: get("subFileCode"),
      enableMinify: get("enableMinify"),
      enableObfuscation: get("enableObfuscation"),
      enableSourceMap: get("enableSourceMap"),
      subFilesList: get("subFilesList"),
      runBuildButton: get("runBuildButton"),
      clearAllButton: get("clearAllButton"),
      addSubFileButton: get("addSubFileButton"),
      buildStatus: get("buildStatus"),
      buildLog: get("buildLog"),
      buildOutput: get("buildOutput"),
      downloadOutputButton: get("downloadOutputButton"),
      copyOutputButton: get("copyOutputButton")
    };
  }

  function setStatus(elements, message) {
    if (!elements.buildStatus) {
      return;
    }
    elements.buildStatus.textContent = "状態: " + message;
  }

  function setLog(elements, message) {
    if (!elements.buildLog) {
      return;
    }
    elements.buildLog.textContent = message;
  }

  function setOutput(elements, message) {
    if (!elements.buildOutput) {
      return;
    }
    elements.buildOutput.textContent = message;
  }

  function renderSubFiles(elements, state) {
    if (!elements.subFilesList) {
      return;
    }

    if (!state.subFiles.length) {
      elements.subFilesList.innerHTML = [
        '<div class="file-item">',
        "<span>補助ファイルはまだ追加されていません</span>",
        "<span>-</span>",
        "</div>"
      ].join("");
      return;
    }

    elements.subFilesList.innerHTML = state.subFiles
      .map(function (file, index) {
        return [
          '<div class="file-item">',
          "<span>" + (index + 1) + ". " + escapeHtml(file.name) + "</span>",
          "<span>" + file.code.length + " chars</span>",
          "</div>"
        ].join("");
      })
      .join("");
  }

  function buildMockOutput(elements, state) {
    var header = [
      "// project: " + (elements.projectName.value.trim() || "untitled-project"),
      "// entry: " + (elements.entryFileName.value.trim() || "main.ts"),
      "// output: " + (elements.outputFileName.value.trim() || "index.js"),
      "// module: " + elements.moduleType.value,
      "// target: " + elements.targetType.value,
      "// minify: " + (elements.enableMinify.checked ? "on" : "off"),
      "// obfuscation: " + (elements.enableObfuscation.checked ? "on" : "off"),
      "// sourcemap: " + (elements.enableSourceMap.checked ? "on" : "off"),
      ""
    ].join("\n");

    var body = [
      "/* mock converted output */",
      elements.mainTsCode.value.trim() || "// no input",
      "",
      "/* sub files */"
    ];

    if (!state.subFiles.length) {
      body.push("// none");
    } else {
      state.subFiles.forEach(function (file) {
        body.push("// " + file.name);
        body.push(file.code.trim());
        body.push("");
      });
    }

    return (header + "\n" + body.join("\n")).trim();
  }

  function addSubFile(elements, state) {
    var name = elements.subFileName.value.trim();
    var code = elements.subFileCode.value.trim();

    if (!name) {
      setStatus(elements, "補助ファイル名不足");
      setLog(elements, "補助ファイル名を入力してください。");
      return;
    }

    if (!code) {
      setStatus(elements, "補助ファイルコード不足");
      setLog(elements, "補助ファイルコードを入力してください。");
      return;
    }

    state.subFiles.push({
      name: name,
      code: code
    });

    elements.subFileName.value = "";
    elements.subFileCode.value = "";

    renderSubFiles(elements, state);
    setStatus(elements, "補助ファイル追加完了");
    setLog(elements, '補助ファイル "' + name + '" を追加しました。');
  }

  function runBuild(elements, state) {
    setStatus(elements, "変換実行中");
    setLog(elements, "TS変換を開始しました。\n現在は仮実行です。");

    var output = buildMockOutput(elements, state);

    setOutput(elements, output);
    setStatus(elements, "変換完了");
    setLog(
      elements,
      [
        "TS変換を完了しました。",
        "project: " + (elements.projectName.value.trim() || "untitled-project"),
        "entry: " + (elements.entryFileName.value.trim() || "main.ts"),
        "sub files: " + state.subFiles.length,
        "現在は仮出力です。本物の変換本体は後で接続します。"
      ].join("\n")
    );
  }

  function clearAll(elements, state) {
    elements.projectName.value = "sample-ts-project";
    elements.entryFileName.value = "main.ts";
    elements.outputFileName.value = "index.js";
    elements.moduleType.value = "esnext";
    elements.targetType.value = "es2020";
    elements.mainTsCode.value = createDefaultMainCode();
    elements.subFileName.value = "";
    elements.subFileCode.value = "";
    elements.enableMinify.checked = false;
    elements.enableObfuscation.checked = false;
    elements.enableSourceMap.checked = false;
    state.subFiles.length = 0;

    renderSubFiles(elements, state);
    setStatus(elements, "初期化完了");
    setLog(elements, "入力内容を初期状態に戻しました。");
    setOutput(elements, "まだ出力はありません。");
  }

  function downloadOutput(elements) {
    var textValue = elements.buildOutput.textContent || "";

    if (!textValue || textValue === "まだ出力はありません。") {
      setStatus(elements, "保存失敗");
      setLog(elements, "保存対象の出力がありません。");
      return;
    }

    var blob = new Blob([textValue], {
      type: "text/javascript;charset=utf-8"
    });

    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");

    link.href = url;
    link.download = elements.outputFileName.value.trim() || "index.js";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setStatus(elements, "保存完了");
    setLog(elements, "出力ファイルを保存しました。");
  }

  function copyOutput(elements) {
    var textValue = elements.buildOutput.textContent || "";

    if (!textValue || textValue === "まだ出力はありません。") {
      setStatus(elements, "コピー失敗");
      setLog(elements, "コピー対象の出力がありません。");
      return;
    }

    navigator.clipboard.writeText(textValue)
      .then(function () {
        setStatus(elements, "コピー完了");
        setLog(elements, "出力内容をコピーしました。");
      })
      .catch(function () {
        setStatus(elements, "コピー失敗");
        setLog(elements, "クリップボードへのコピーに失敗しました。");
      });
  }

  function bindNavigation(elements) {
    if (window.BBWNavigation) {
      window.BBWNavigation.bindMove("goHome", "./index.html");
      window.BBWNavigation.bindMove("goRustPage", "./rust-build.html");
      return;
    }

    if (elements.goHome) {
      elements.goHome.addEventListener("click", function () {
        window.location.href = "./index.html";
      });
    }

    if (elements.goRustPage) {
      elements.goRustPage.addEventListener("click", function () {
        window.location.href = "./rust-build.html";
      });
    }
  }

  function bindActions(elements, state) {
    if (elements.addSubFileButton) {
      elements.addSubFileButton.addEventListener("click", function () {
        addSubFile(elements, state);
      });
    }

    if (elements.runBuildButton) {
      elements.runBuildButton.addEventListener("click", function () {
        runBuild(elements, state);
      });
    }

    if (elements.clearAllButton) {
      elements.clearAllButton.addEventListener("click", function () {
        clearAll(elements, state);
      });
    }

    if (elements.downloadOutputButton) {
      elements.downloadOutputButton.addEventListener("click", function () {
        downloadOutput(elements);
      });
    }

    if (elements.copyOutputButton) {
      elements.copyOutputButton.addEventListener("click", function () {
        copyOutput(elements);
      });
    }
  }

  function init() {
    var elements = createElements();
    var state = createPageState();

    bindNavigation(elements);
    bindActions(elements, state);
    renderSubFiles(elements, state);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();