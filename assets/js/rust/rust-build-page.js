(function () {
  "use strict";

  var subFiles = [];
  var lastOutput = "";

  function getElement(id) {
    return document.getElementById(id);
  }

  function getValue(id) {
    var element = getElement(id);
    return element ? element.value : "";
  }

  function setValue(id, value) {
    var element = getElement(id);
    if (element) {
      element.value = value;
    }
  }

  function isChecked(id) {
    var element = getElement(id);
    return !!(element && element.checked);
  }

  function renderSubFiles() {
    if (!window.BBWFileList) {
      return;
    }

    window.BBWFileList.renderFileList(
      getElement("subFilesList"),
      subFiles,
      "補助Rustファイルはまだ追加されていません"
    );
  }

  function collectInput() {
    return {
      projectName: getValue("projectName"),
      entryType: getValue("entryType"),
      outputMode: getValue("outputMode"),
      buildMode: getValue("buildMode"),
      crateType: getValue("crateType"),
      cargoToml: getValue("cargoToml"),
      mainCode: getValue("mainRustCode"),
      subFiles: subFiles.slice(),
      enableWasmBindgen: isChecked("enableWasmBindgen"),
      enableOptimize: isChecked("enableOptimize"),
      enableJsLoader: isChecked("enableJsLoader")
    };
  }

  function addSubFile() {
    var fileName = getValue("subFileName").trim();
    var fileCode = getValue("subFileCode");

    if (!fileName || !fileCode.trim()) {
      if (window.BBWStatus) {
        window.BBWStatus.setStatus(getElement("buildStatus"), "補助ファイル名とコードを入力してください");
        window.BBWStatus.setLog(getElement("buildLog"), "補助Rustファイルの追加に失敗しました。入力不足です。");
      }
      return;
    }

    subFiles.push({
      name: fileName,
      code: fileCode
    });

    setValue("subFileName", "");
    setValue("subFileCode", "");
    renderSubFiles();

    if (window.BBWStatus) {
      window.BBWStatus.setStatus(getElement("buildStatus"), "補助Rustファイルを追加しました");
      window.BBWStatus.setLog(getElement("buildLog"), "補助Rustファイルを追加しました: " + fileName);
    }
  }

  function runBuild() {
    if (!window.BBWRustBuildEngine) {
      if (window.BBWStatus) {
        window.BBWStatus.setStatus(getElement("buildStatus"), "Rust build engine が読み込まれていません");
        window.BBWStatus.setLog(getElement("buildLog"), "BBWRustBuildEngine が未定義です。");
      }
      return;
    }

    var result = window.BBWRustBuildEngine.buildRustOutput(collectInput());
    lastOutput = result.content || "";

    if (window.BBWStatus) {
      window.BBWStatus.setStatus(getElement("buildStatus"), result.success ? "ビルド完了" : "ビルド失敗");
      window.BBWStatus.setLog(getElement("buildLog"), result.logs || "");
      window.BBWStatus.setOutput(getElement("buildOutput"), lastOutput || "出力はありません。");
    }
  }

  function clearAll() {
    subFiles = [];
    lastOutput = "";

    setValue("projectName", "sample-rust-project");
    setValue("cargoToml", '[package]\nname = "sample-rust-project"\nversion = "0.1.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nwasm-bindgen = "0.2"\n');
    setValue("mainRustCode", 'use wasm_bindgen::prelude::*;\n\n#[wasm_bindgen]\npub fn greet(name: &str) -> String {\n    format!("hello {}", name)\n}\n');
    setValue("subFileName", "");
    setValue("subFileCode", "");

    var entryType = getElement("entryType");
    var outputMode = getElement("outputMode");
    var buildMode = getElement("buildMode");
    var crateType = getElement("crateType");

    if (entryType) entryType.value = "lib.rs";
    if (outputMode) outputMode.value = "wasm-js";
    if (buildMode) buildMode.value = "release";
    if (crateType) crateType.value = "cdylib";

    var enableWasmBindgen = getElement("enableWasmBindgen");
    var enableOptimize = getElement("enableOptimize");
    var enableJsLoader = getElement("enableJsLoader");

    if (enableWasmBindgen) enableWasmBindgen.checked = true;
    if (enableOptimize) enableOptimize.checked = true;
    if (enableJsLoader) enableJsLoader.checked = true;

    renderSubFiles();

    if (window.BBWStatus) {
      window.BBWStatus.setStatus(getElement("buildStatus"), "初期化しました");
      window.BBWStatus.setLog(getElement("buildLog"), "入力内容を初期化しました。");
      window.BBWStatus.setOutput(getElement("buildOutput"), "まだ出力はありません。");
    }
  }

  function downloadOutput() {
    var mode = getValue("outputMode").trim();
    var fileName = mode === "wasm-only"
      ? "index.wasm"
      : mode === "zip"
        ? "project.zip"
        : "index.js";

    if (!window.BBWDownload || !lastOutput) {
      if (window.BBWStatus) {
        window.BBWStatus.setStatus(getElement("buildStatus"), "保存できません");
        window.BBWStatus.setLog(getElement("buildLog"), "保存対象の出力がありません。");
      }
      return;
    }

    window.BBWDownload.downloadTextFile(lastOutput, fileName, "text/plain;charset=utf-8");

    if (window.BBWStatus) {
      window.BBWStatus.setStatus(getElement("buildStatus"), "出力を保存しました");
      window.BBWStatus.setLog(getElement("buildLog"), "出力ファイルを保存しました: " + fileName);
    }
  }

  function copyOutput() {
    if (!window.BBWClipboard || !lastOutput) {
      if (window.BBWStatus) {
        window.BBWStatus.setStatus(getElement("buildStatus"), "コピーできません");
        window.BBWStatus.setLog(getElement("buildLog"), "コピー対象の出力がありません。");
      }
      return;
    }

    window.BBWClipboard.copyText(lastOutput)
      .then(function () {
        if (window.BBWStatus) {
          window.BBWStatus.setStatus(getElement("buildStatus"), "出力をコピーしました");
          window.BBWStatus.setLog(getElement("buildLog"), "出力内容をクリップボードへコピーしました。");
        }
      })
      .catch(function (error) {
        if (window.BBWStatus) {
          window.BBWStatus.setStatus(getElement("buildStatus"), "コピーに失敗しました");
          window.BBWStatus.setLog(
            getElement("buildLog"),
            "コピーに失敗しました: " + (error && error.message ? error.message : "unknown_error")
          );
        }
      });
  }

  function bindEvents() {
    if (window.BBWNavigation) {
      window.BBWNavigation.bindMove("goHome", "./index.html");
      window.BBWNavigation.bindMove("goTsPage", "./ts-build.html");
    }

    var addSubFileButton = getElement("addSubFileButton");
    var runBuildButton = getElement("runBuildButton");
    var clearAllButton = getElement("clearAllButton");
    var downloadOutputButton = getElement("downloadOutputButton");
    var copyOutputButton = getElement("copyOutputButton");

    if (addSubFileButton) addSubFileButton.addEventListener("click", addSubFile);
    if (runBuildButton) runBuildButton.addEventListener("click", runBuild);
    if (clearAllButton) clearAllButton.addEventListener("click", clearAll);
    if (downloadOutputButton) downloadOutputButton.addEventListener("click", downloadOutput);
    if (copyOutputButton) copyOutputButton.addEventListener("click", copyOutput);
  }

  function init() {
    renderSubFiles();
    bindEvents();
  }

  init();
})();