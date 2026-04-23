(function () {
  "use strict";

  function normalizeText(value) {
    return typeof value === "string" ? value : "";
  }

  function buildTsOutput(input) {
    var projectName = normalizeText(input.projectName).trim() || "sample-ts-project";
    var entryFileName = normalizeText(input.entryFileName).trim() || "main.ts";
    var outputFileName = normalizeText(input.outputFileName).trim() || "index.js";
    var moduleType = normalizeText(input.moduleType).trim() || "esnext";
    var targetType = normalizeText(input.targetType).trim() || "es2020";
    var mainCode = normalizeText(input.mainCode);
    var subFiles = Array.isArray(input.subFiles) ? input.subFiles : [];

    var header = [
      "// browser-build-workshop",
      "// TS mock build output",
      "// project: " + projectName,
      "// entry: " + entryFileName,
      "// output: " + outputFileName,
      "// module: " + moduleType,
      "// target: " + targetType,
      "// minify: " + (input.enableMinify ? "on" : "off"),
      "// obfuscation: " + (input.enableObfuscation ? "on" : "off"),
      "// sourceMap: " + (input.enableSourceMap ? "on" : "off"),
      ""
    ].join("\n");

    var body = [
      "// main source",
      mainCode,
      "",
      "// sub files count: " + subFiles.length
    ];

    subFiles.forEach(function (file, index) {
      var name = normalizeText(file.name).trim() || ("sub-file-" + (index + 1) + ".ts");
      var code = normalizeText(file.code);

      body.push("");
      body.push("// sub file: " + name);
      body.push(code);
    });

    return {
      success: true,
      fileName: outputFileName,
      content: header + body.join("\n"),
      logs: [
        "TS変換を開始しました。",
        "project: " + projectName,
        "entry: " + entryFileName,
        "sub files: " + subFiles.length,
        "現在は仮変換です。実際のTypeScriptコンパイラはまだ未接続です。"
      ].join("\n")
    };
  }

  window.BBWTsBuildEngine = {
    buildTsOutput: buildTsOutput
  };
})();