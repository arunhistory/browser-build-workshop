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

  function createDefaultCargoToml() {
    return [
      "[package]",
      'name = "sample-rust-project"',
      'version = "0.1.0"',
      'edition = "2021"',
      "",
      "[lib]",
      'crate-type = ["cdylib"]',
      "",
      "[dependencies]",
      'wasm-bindgen = "0.2"'
    ].join("\n");
  }

  function createDefaultRustCode() {
    return [
      "use wasm_bindgen::prelude::*;",
      "",
      "#[wasm_bindgen]",
      "pub fn greet(name: &str) -> String {",
      '    format!("hello {}", name)',
      "}"
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
      goTsPage: get("goTsPage"),
      projectName: get("projectName"),
      entryType: get("entryType"),
      outputMode: get("outputMode"),
      buildMode: get("buildMode"),
      crateType: get("crateType"),
      cargoToml: get("cargoToml"),
      mainRustCode: get("mainRustCode"),
      subFileName: get("subFileName"),
      subFileCode: get("subFileCode"),
      enableWasmBindgen: get("enableWasmBindgen"),
      enableOptimize: get("enableOptimize"),
      enableJsLoader: get("enableJsLoader"),
      subFilesList: get("subFilesList"),
      addSubFileButton: get("addSubFileButton"),
      runBuildButton: get("runBuildButton"),
      clearAllButton: get("clearAllButton"),
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
        "<span>補助Rustファイルはまだ追加されていません</span>",
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
    var lines = [
      "# project: " + (elements.projectName.value.trim() || "untitled-rust-project"),
      "# entry: " + elements.entryType.value,
      "# output mode: " + elements.outputMode.value,
      "# build mode: " + elements.buildMode.value,
      "# crate-type: " + elements.crateType.value,
      "# wasm-bindgen: " + (elements.enableWasmBindgen.checked ? "on" : "off"),
      "# optimize: " + (elements.enableOptimize.checked ? "on" : "off"),
      "# loader.js: " + (elements.enableJsLoader.checked ? "on" : "off"),
      "",
      "--- Cargo.toml ---",
      elements.cargoToml.value.trim() || "# no cargo config",
      "",
      "--- " + elements.entryType.value + " ---",
      elements.mainRustCode.value.trim() || "// no input",
      "",
      "--- sub files ---"
    ];

    if (!state.subFiles.length) {
      lines.push("# none");
    } else {
      state.subFiles.forEach(function (file) {
        lines.push("// " + file.name);
        lines.push(file.code.trim());
        lines.push("");
      });
    }

    return lines.join("\n").trim();
  }

  function addSubFile(elements, state) {
    var name = elements.subFileName.value.trim();
    var code = elements.subFileCode.value.trim();

    if (!name) {
      setStatus(elements, "補助ファイル名不足");
      setLog(elements, "補助Rustファイル名を入力してください。");
      return;
    }

    if (!code) {
      setStatus(elements, "補助ファイルコード不足");
      setLog(elements, "補助Rustファイルコードを入力してください。");
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
    setLog(elements, '補助Rustファイル "' + name + '" を追加しました。');
  }

  function runBuild(elements, state) {
    setStatus(elements, "ビルド実行中");
    setLog(elements, "Rustビルドを開始しました。\n現在は仮実行です。");

    var output = buildMockOutput(elements, state);

    setOutput(elements, output);
    setStatus(elements, "ビルド完了");
    setLog(
      elements,
      [
        "Rustビルドを完了しました。",
        "project: " + (elements.projectName.value.trim() || "untitled-rust-project"),
        "entry: " + elements.entryType.value,
        "sub files: " + state.subFiles.length,
        "現在は仮出力です。本物のRust→Wasmビルド本体は後で接続します。"
      ].join("\n")
    );
  }

  function clearAll(elements, state) {
    elements.projectName.value = "sample-rust-project";
    elements.entryType.value = "lib.rs";
    elements.outputMode.value = "wasm-js";
    elements.buildMode.value = "release";
    elements.crateType.value = "cdylib";
    elements.cargoToml.value = createDefaultCargoToml();
    elements.mainRustCode.value = createDefaultRustCode();
    elements.subFileName.value = "";
    elements.subFileCode.value = "";
    elements.enableWasmBindgen.checked = true;
    elements.enableOptimize.checked = true;
    elements.enableJsLoader.checked = true;
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

    var fileNameMap = {
      "wasm-js": "build-output.txt",
      "wasm-only": "index.wasm.txt",
      "zip": "project-output.txt"
    };

    var blob = new Blob([textValue], {
      type: "text/plain;charset=utf-8"
    });

    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");

    link.href = url;
    link.download = fileNameMap[elements.outputMode.value] || "build-output.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setStatus(elements, "保存完了");
    setLog(elements, "出力内容を保存しました。");
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
      window.BBWNavigation.bindMove("goTsPage", "./ts-build.html");
      return;
    }

    if (elements.goHome) {
      elements.goHome.addEventListener("click", function () {
        window.location.href = "./index.html";
      });
    }

    if (elements.goTsPage) {
      elements.goTsPage.addEventListener("click", function () {
        window.location.href = "./ts-build.html";
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