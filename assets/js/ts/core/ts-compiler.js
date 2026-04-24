(function () {
  "use strict";

  if (!window.TSLogger) {
    throw new Error("TSLogger is required before ts-compiler.js");
  }

  const Logger = window.TSLogger;

  function compileFiles(files, settings) {
    if (!Array.isArray(files)) {
      throw new Error("compileFiles requires files array");
    }

    if (!window.ts || typeof window.ts.transpileModule !== "function") {
      throw new Error(
        "TypeScript公式コンパイラが読み込まれていません。typescript.js を ts-compiler.js より前に読み込んでください。"
      );
    }

    const safeSettings = normalizeSettings(settings);
    const outputs = [];

    Logger.info("TypeScript公式コンパイラによる変換を開始します。", {
      fileCount: files.length,
      moduleMode: safeSettings.moduleMode,
      targetMode: safeSettings.targetMode
    });

    for (const file of files) {
      const result = compileSingleFile(file, safeSettings);
      outputs.push(result);
    }

    Logger.success("TypeScript公式コンパイラによる変換が完了しました。", {
      outputCount: outputs.length
    });

    return outputs;
  }

  function compileSingleFile(file, settings) {
    const fileName = file && file.name ? file.name : "main.ts";
    const source = file && typeof file.code === "string" ? file.code : "";

    Logger.compilerMessage(fileName, "公式コンパイル開始");

    const compilerOptions = {
      module: toTsModuleKind(settings.moduleMode),
      target: toTsScriptTarget(settings.targetMode),
      strict: Boolean(settings.strictMode),
      removeComments: settings.keepComments === false,
      esModuleInterop: true,
      skipLibCheck: true,
      isolatedModules: true,
      sourceMap: false,
      inlineSourceMap: false,
      inlineSources: false
    };

    const result = window.ts.transpileModule(source, {
      compilerOptions,
      fileName,
      reportDiagnostics: true
    });

    const diagnostics = Array.isArray(result.diagnostics)
      ? result.diagnostics
      : [];

    const normalizedDiagnostics = diagnostics.map(function (diagnostic) {
      return normalizeDiagnostic(source, fileName, diagnostic);
    });

    for (const item of normalizedDiagnostics) {
      if (item.category === "Error") {
        Logger.lineError(fileName, item.line, item.message, item.lineText);
      } else if (item.category === "Warning") {
        Logger.lineWarn(fileName, item.line, item.message, item.lineText);
      } else {
        Logger.compilerMessage(fileName, item.message);
      }
    }

    const hasError = normalizedDiagnostics.some(function (item) {
      return item.category === "Error";
    });

    if (hasError) {
      throw new Error(fileName + ": TypeScript変換エラーがあります。");
    }

    const outputName = toOutputName(fileName);

    Logger.compilerMessage(fileName, "出力生成: " + outputName);

    return {
      inputName: fileName,
      outputName,
      code: result.outputText || "",
      warnings: normalizedDiagnostics.filter(function (item) {
        return item.category === "Warning";
      }),
      errors: normalizedDiagnostics.filter(function (item) {
        return item.category === "Error";
      })
    };
  }

  function normalizeSettings(settings) {
    return {
      moduleMode:
        settings && settings.moduleMode
          ? String(settings.moduleMode)
          : "esnext",

      targetMode:
        settings && settings.targetMode
          ? normalizeTargetMode(settings.targetMode)
          : "es2020",

      keepComments:
        settings && typeof settings.keepComments === "boolean"
          ? settings.keepComments
          : true,

      strictMode:
        settings && typeof settings.strictMode === "boolean"
          ? settings.strictMode
          : true
    };
  }

  function normalizeTargetMode(value) {
    const raw = String(value || "es2020").toLowerCase();

    /*
      古いページ設定との互換。
      browser/module/node は target ではないため、ES2020に寄せる。
    */
    if (raw === "browser") return "es2020";
    if (raw === "module") return "es2020";
    if (raw === "node") return "es2020";

    return raw;
  }

  function toTsModuleKind(value) {
    const ts = window.ts;
    const mode = String(value || "esnext").toLowerCase();

    if (mode === "none") return ts.ModuleKind.None;
    if (mode === "commonjs") return ts.ModuleKind.CommonJS;
    if (mode === "amd") return ts.ModuleKind.AMD;
    if (mode === "umd") return ts.ModuleKind.UMD;
    if (mode === "system") return ts.ModuleKind.System;
    if (mode === "es2015") return ts.ModuleKind.ES2015;
    if (mode === "es2020") return ts.ModuleKind.ES2020;
    if (mode === "es2022") return ts.ModuleKind.ES2022;
    if (mode === "esnext") return ts.ModuleKind.ESNext;
    if (mode === "node16") return ts.ModuleKind.Node16;
    if (mode === "nodenext") return ts.ModuleKind.NodeNext;

    return ts.ModuleKind.ESNext;
  }

  function toTsScriptTarget(value) {
    const ts = window.ts;
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

  function normalizeDiagnostic(source, fileName, diagnostic) {
    const category = diagnosticCategoryToText(diagnostic.category);
    const message = flattenDiagnosticMessage(diagnostic.messageText);
    const position = getDiagnosticPosition(source, diagnostic);

    return {
      fileName,
      category,
      line: position.line,
      character: position.character,
      message,
      lineText: position.lineText,
      code: diagnostic.code || null
    };
  }

  function diagnosticCategoryToText(category) {
    if (!window.ts || !window.ts.DiagnosticCategory) {
      return "Message";
    }

    if (category === window.ts.DiagnosticCategory.Error) {
      return "Error";
    }

    if (category === window.ts.DiagnosticCategory.Warning) {
      return "Warning";
    }

    if (category === window.ts.DiagnosticCategory.Suggestion) {
      return "Suggestion";
    }

    return "Message";
  }

  function flattenDiagnosticMessage(messageText) {
    if (typeof messageText === "string") {
      return messageText;
    }

    if (
      window.ts &&
      typeof window.ts.flattenDiagnosticMessageText === "function"
    ) {
      return window.ts.flattenDiagnosticMessageText(messageText, "\n");
    }

    return String(messageText || "");
  }

  function getDiagnosticPosition(source, diagnostic) {
    const text = String(source || "");
    const lines = text.split(/\r?\n/);

    if (typeof diagnostic.start !== "number") {
      return {
        line: 1,
        character: 1,
        lineText: lines[0] || ""
      };
    }

    const before = text.slice(0, diagnostic.start);
    const beforeLines = before.split(/\r?\n/);

    const line = beforeLines.length;
    const character = beforeLines[beforeLines.length - 1].length + 1;

    return {
      line,
      character,
      lineText: lines[line - 1] || ""
    };
  }

  function toOutputName(fileName) {
    const name = String(fileName || "main.ts");

    if (/\.tsx$/i.test(name)) {
      return name.replace(/\.tsx$/i, ".js");
    }

    if (/\.ts$/i.test(name)) {
      return name.replace(/\.ts$/i, ".js");
    }

    return name + ".js";
  }

  window.TSCompiler = {
    compileFiles,
    compileSingleFile,

    normalizeSettings,
    normalizeTargetMode,

    toTsModuleKind,
    toTsScriptTarget,

    normalizeDiagnostic,
    diagnosticCategoryToText,
    flattenDiagnosticMessage,
    getDiagnosticPosition,

    toOutputName
  };
})();