(function () {
  "use strict";

  if (!window.TSOutputManager) {
    throw new Error("TSOutputManager is required before ts-downloader.js");
  }

  if (!window.TSLogger) {
    throw new Error("TSLogger is required before ts-downloader.js");
  }

  const OutputManager = window.TSOutputManager;
  const Logger = window.TSLogger;

  function downloadText(fileName, text, mimeType) {
    const safeName = sanitizeFileName(fileName || "download.txt");
    const blob = new Blob([String(text || "")], {
      type: mimeType || "text/plain;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = safeName;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);

    Logger.info("ファイルを保存しました。", {
      fileName: safeName,
      size: blob.size
    });

    return {
      fileName: safeName,
      size: blob.size
    };
  }

  function downloadOutput(output) {
    if (!output) {
      throw new Error("保存対象の出力がありません。");
    }

    return downloadText(
      output.outputName,
      output.code,
      getMimeType(output)
    );
  }

  function downloadPrimaryOutput() {
    const output = OutputManager.getPrimaryOutput();

    if (!output) {
      throw new Error("JS出力がありません。先に変換を実行してください。");
    }

    return downloadOutput(output);
  }

  function downloadOutputByName(outputName) {
    const output = OutputManager.getOutputByName(outputName);

    if (!output) {
      throw new Error(`指定された出力が見つかりません: ${outputName}`);
    }

    return downloadOutput(output);
  }

  function downloadBuildLog() {
    const output = OutputManager.createBuildLogOutput();
    return downloadOutput(output);
  }

  function downloadManifest() {
    const output = OutputManager.createManifestOutput();
    return downloadOutput(output);
  }

  function downloadCombinedOutput() {
    OutputManager.assertHasOutputs();

    const output = OutputManager.createCombinedOutput("combined-output.js");
    return downloadOutput(output);
  }

  function downloadAllAsTextBundle() {
    OutputManager.assertHasOutputs();

    const targets = OutputManager.getAllDownloadTargets({
      includeLog: true,
      includeManifest: true
    });

    const text = targets
      .map((output) => {
        return [
          `===== FILE: ${output.outputName} =====`,
          output.code,
          ""
        ].join("\n");
      })
      .join("\n");

    return downloadText(
      "ts-build-bundle.txt",
      text,
      "text/plain;charset=utf-8"
    );
  }

  function downloadEachOutput() {
    const outputs = OutputManager.assertHasOutputs();
    const results = [];

    for (const output of outputs) {
      results.push(downloadOutput(output));
    }

    return results;
  }

  function getMimeType(output) {
    const extension = output.extension || "";

    if (extension === ".js") {
      return "text/javascript;charset=utf-8";
    }

    if (extension === ".json") {
      return "application/json;charset=utf-8";
    }

    if (extension === ".html") {
      return "text/html;charset=utf-8";
    }

    if (extension === ".css") {
      return "text/css;charset=utf-8";
    }

    return "text/plain;charset=utf-8";
  }

  function sanitizeFileName(fileName) {
    const safe = String(fileName || "download.txt")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, "_");

    return safe || "download.txt";
  }

  function canDownload() {
    return typeof Blob !== "undefined" &&
      typeof URL !== "undefined" &&
      typeof document !== "undefined";
  }

  window.TSDownloader = {
    downloadText,

    downloadOutput,
    downloadPrimaryOutput,
    downloadOutputByName,

    downloadBuildLog,
    downloadManifest,
    downloadCombinedOutput,

    downloadAllAsTextBundle,
    downloadEachOutput,

    getMimeType,
    sanitizeFileName,
    canDownload
  };
})();