(function () {
  "use strict";

  function normalizeText(value) {
    return typeof value === "string" ? value : "";
  }

  function buildRustOutput(input) {
    var projectName = normalizeText(input.projectName).trim() || "sample-rust-project";
    var entryType = normalizeText(input.entryType).trim() || "lib.rs";
    var outputMode = normalizeText(input.outputMode).trim() || "wasm-js";
    var buildMode = normalizeText(input.buildMode).trim() || "release";
    var crateType = normalizeText(input.crateType).trim() || "cdylib";
    var cargoToml = normalizeText(input.cargoToml);
    var mainCode = normalizeText(input.mainCode);
    var subFiles = Array.isArray(input.subFiles) ? input.subFiles : [];

    var outputFileName = outputMode === "wasm-only"
      ? "index.wasm"
      : outputMode === "zip"
        ? "project.zip"
        : "index.js";

    var header = [
      "// browser-build-workshop",
      "// Rust mock build output",
      "// project: " + projectName,
      "// entry: " + entryType,
      "// build mode: " + buildMode,
      "// crate type: " + crateType,
      "// output mode: " + outputMode,
      "// wasm-bindgen: " + (input.enableWasmBindgen ? "on" : "off"),
      "// optimize: " + (input.enableOptimize ? "on" : "off"),
      "// js loader: " + (input.enableJsLoader ? "on" : "off"),
      ""
    ].join("\n");

    var body = [
      "// Cargo.toml equivalent",
      cargoToml,
      "",
      "// main rust source",
      mainCode,
      "",
      "// sub files count: " + subFiles.length
    ];

    subFiles.forEach(function (file, index) {
      var name = normalizeText(file.name).trim() || ("sub-file-" + (index + 1) + ".rs");
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
        "Rustビルドを開始しました。",
        "project: " + projectName,
        "entry: " + entryType,
        "sub files: " + subFiles.length,
        "現在は仮ビルドです。実際のRust/Wasmコンパイルはまだ未接続です。"
      ].join("\n")
    };
  }

  window.BBWRustBuildEngine = {
    buildRustOutput: buildRustOutput
  };
})();