(function () {
  "use strict";

  if (!window.TSBuildState) {
    throw new Error("TSBuildState is required before ts-output-manager.js");
  }

  if (!window.TSLogger) {
    throw new Error("TSLogger is required before ts-output-manager.js");
  }

  const State = window.TSBuildState;
  const Logger = window.TSLogger;

  function setOutputs(outputs) {
    if (!Array.isArray(outputs)) {
      throw new Error("setOutputs requires outputs array");
    }

    const normalized = outputs.map((output) => normalizeOutput(output));
    State.setOutputs(normalized);

    Logger.info("出力結果を保存しました。", {
      outputCount: normalized.length
    });

    return normalized;
  }

  function normalizeOutput(output) {
    const inputName = output.inputName || "main.ts";
    const outputName = output.outputName || toJsFileName(inputName);

    return {
      id: output.id || State.createId("output"),
      inputName,
      outputName,
      code: typeof output.code === "string" ? output.code : "",
      type: output.type || "javascript",
      extension: output.extension || ".js",
      size: countBytes(output.code || ""),
      createdAt: output.createdAt || new Date().toISOString(),
      minified: Boolean(output.minified),
      obfuscated: Boolean(output.obfuscated),
      meta: output.meta || {}
    };
  }

  function getOutputs() {
    return State.getOutputs();
  }

  function clearOutputs() {
    State.clearOutputs();
    Logger.info("出力結果を削除しました。");
  }

  function getPrimaryOutput() {
    const outputs = State.getOutputs();
    return outputs[0] || null;
  }

  function getOutputByName(outputName) {
    return State.getOutputs().find((output) => output.outputName === outputName) || null;
  }

  function createBuildLogOutput() {
    const logText = Logger.toText();

    return {
      id: State.createId("output-log"),
      inputName: "build-log",
      outputName: "build-log.txt",
      code: logText,
      type: "text",
      extension: ".txt",
      size: countBytes(logText),
      createdAt: new Date().toISOString(),
      minified: false,
      obfuscated: false,
      meta: {
        generatedBy: "TSOutputManager"
      }
    };
  }

  function createManifestOutput() {
    const outputs = State.getOutputs();

    const manifest = {
      tool: "browser-build-workshop",
      type: "typescript-build",
      createdAt: new Date().toISOString(),
      settings: State.clone(State.getSettings()),
      outputs: outputs.map((output) => ({
        outputName: output.outputName,
        inputName: output.inputName,
        type: output.type,
        extension: output.extension,
        size: output.size,
        minified: output.minified,
        obfuscated: output.obfuscated,
        createdAt: output.createdAt
      }))
    };

    const text = JSON.stringify(manifest, null, 2);

    return {
      id: State.createId("output-manifest"),
      inputName: "manifest",
      outputName: "manifest.json",
      code: text,
      type: "json",
      extension: ".json",
      size: countBytes(text),
      createdAt: new Date().toISOString(),
      minified: false,
      obfuscated: false,
      meta: {
        generatedBy: "TSOutputManager"
      }
    };
  }

  function getAllDownloadTargets(options) {
    const safeOptions = options || {};
    const targets = [...State.getOutputs()];

    if (safeOptions.includeLog !== false) {
      targets.push(createBuildLogOutput());
    }

    if (safeOptions.includeManifest) {
      targets.push(createManifestOutput());
    }

    return targets;
  }

  function mergeOutputsToText(outputs) {
    const list = Array.isArray(outputs) ? outputs : State.getOutputs();

    return list
      .map((output) => {
        return [
          `/* ===== ${output.outputName} ===== */`,
          output.code,
          ""
        ].join("\n");
      })
      .join("\n");
  }

  function createCombinedOutput(fileName) {
    const text = mergeOutputsToText(State.getOutputs());

    return {
      id: State.createId("output-combined"),
      inputName: "combined",
      outputName: fileName || "combined-output.js",
      code: text,
      type: "javascript",
      extension: ".js",
      size: countBytes(text),
      createdAt: new Date().toISOString(),
      minified: false,
      obfuscated: false,
      meta: {
        generatedBy: "TSOutputManager"
      }
    };
  }

  function toJsFileName(fileName) {
    const safeName = String(fileName || "main.ts").trim() || "main.ts";

    return safeName
      .replace(/\.tsx$/i, ".js")
      .replace(/\.ts$/i, ".js");
  }

  function countBytes(text) {
    return new Blob([String(text || "")]).size;
  }

  function summarizeOutputs(outputs) {
    const list = Array.isArray(outputs) ? outputs : State.getOutputs();

    return {
      count: list.length,
      totalSize: list.reduce((sum, output) => sum + countBytes(output.code || ""), 0),
      names: list.map((output) => output.outputName)
    };
  }

  function assertHasOutputs() {
    const outputs = State.getOutputs();

    if (!outputs.length) {
      throw new Error("出力結果がありません。先に変換を実行してください。");
    }

    return outputs;
  }

  window.TSOutputManager = {
    setOutputs,
    normalizeOutput,

    getOutputs,
    clearOutputs,

    getPrimaryOutput,
    getOutputByName,

    createBuildLogOutput,
    createManifestOutput,
    createCombinedOutput,

    getAllDownloadTargets,
    mergeOutputsToText,

    toJsFileName,
    countBytes,
    summarizeOutputs,
    assertHasOutputs
  };
})();