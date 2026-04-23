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
      "補助ファイルはまだ追加されていません"
    );
  }

  function collectInput() {
    return {
      projectName: getValue("projectName"),
      entryFileName: getValue("entryFileName"),
      outputFileName: getValue("outputFileName"),
      moduleType: getValue("moduleType"),
      targetType: getValue("targetType"),
      mainCode: getValue("mainTsCode"),
      subFiles: subFiles.slice(),
      enableMinify: isChecked("enableMinify"),
      enableObfuscation: isChecked("enableObfuscation"),
      enableSourceMap: isChecked("enableSourceMap")
    };
  }

  function addSubFile() {
    var fileName = getValue("subFileName").trim();
    var fileCode = getValue("subFileCode");

    if (!fileName || !fileCode.trim()) {
      if (window.BBWStatus) {
        window.BBWStatus.setStatus(getElement("buildStatus"), "補助ファイル名とコードを入力してください");
        window.BBWStatus.setLog(getElement("buildLog"), "補助ファイルの追加に失敗しました。入力不足です。");
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
      window.BBWStatus.setStatus(getElement("buildStatus"), "補助ファイルを追加しました");
      window.BBWStatus.setLog(getElement("buildLog"), "補助ファイルを追加しました: " + fileName);
    }
  }

  function runBuild() {
    if (!window.BBWTsBuildEngine) {
      if (window.BBWStatus) {
        window.BBWStatus.setStatus(getElement("buildStatus"), "TS build engine が読み込まれていません");
        window.BBWStatus.setLog(getElement("buildLog"), "BBWTsBuildEngine が未定義です。");
      }
      return;
    }

    var result = window.BBWTsBuildEngine.buildTsOutput(collectInput());
    lastOutput = result.content || "";

    if (window.BBWStatus) {
      window.BBWStatus.setStatus(getElement("buildStatus"), result.success ? "変換完了" : "変換失敗");
      window.BBWStatus.setLog(getElement("buildLog"), result.logs || "");
      window.BBWStatus.setOutput(getElement("buildOutput"), lastOutput || "出力はありません。");
    }
  }

  function clearAll() {
    subFiles = [];
    lastOutput = "";

    setValue("projectName", "sample-ts-project");
    setValue("entryFileName", "main.ts");
    setValue("outputFileName", "index.js");
    setValue("mainTsCode", 'const message: string = "browser-build-workshop";\nconst version: number = 1;\n\nfunction boot(name: string): string {\n  return `hello ${name}`;\n}\n\nconsole.log(message, version);\nconsole.log(boot("TypeScript"));\n');
    setValue("subFileName", "");
    setValue("subFileCode", "");

    var enableMinify = getElement("enableMinify");
    var enableObfuscation = getElement("enableObfuscation");
    var enableSourceMap = getElement("enableSourceMap");

    if (enableMinify) enableMinify.checked = false;
    if (enableObfuscation) enableObfuscation.checked = false;
    if (enableSourceMap) enableSourceMap.checked = false;

    var moduleType = getElement("moduleType");
    var targetType = getElement("targetType");

    if (moduleType) moduleType.value = "esnext";
    if (targetType) targetType.value = "es2020";

    renderSubFiles();

    if (window.BBWStatus) {
      window.BBWStatus.setStatus(getElement("buildStatus"), "初期化しました");
      window.BBWStatus.setLog(getElement("buildLog"), "入力内容を初期化しました。");
      window.BBWStatus.setOutput(getElement("buildOutput"), "まだ出力はありません。");
    }
  }

  function downloadOutput() {
    var fileName = getValue("outputFileName").trim() || "index.js";

    if (!window.BBWDownload || !lastOutput) {
      if (window.BBWStatus) {
        window.BBWStatus.setStatus(getElement("buildStatus"), "保存できません");
        window.BBWStatus.setLog(getElement("buildLog"), "保存対象の出力がありません。");
      }
      return;
    }

    window.BBWDownload.downloadTextFile(lastOutput, fileName, "text/javascript;charset=utf-8");

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
      window.BBWNavigation.bindMove("goRustPage", "./rust-build.html");
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