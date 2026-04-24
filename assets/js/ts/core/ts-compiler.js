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

    const safeSettings = normalizeSettings(settings);
    const outputs = [];

    Logger.info("TSコンパイル処理を開始します。", {
      fileCount: files.length,
      targetMode: safeSettings.targetMode
    });

    for (const file of files) {
      const result = compileSingleFile(file, safeSettings);
      outputs.push(result);
    }

    Logger.success("TSコンパイル処理が完了しました。", {
      outputCount: outputs.length
    });

    return outputs;
  }

  function compileSingleFile(file, settings) {
    const fileName = file && file.name ? file.name : "unknown.ts";
    const source = file && typeof file.code === "string" ? file.code : "";

    Logger.compilerMessage(fileName, "コンパイル開始");

    const scan = scanSource(fileName, source);

    for (const item of scan.warnings) {
      Logger.lineWarn(fileName, item.line, item.message, item.text);
    }

    for (const item of scan.errors) {
      Logger.lineError(fileName, item.line, item.message, item.text);
    }

    if (scan.errors.length > 0) {
      throw new Error(`${fileName}: コンパイル前検査でエラーがあります`);
    }

    let code = source;

    code = normalizeLineEndings(code);

    if (!settings.keepComments) {
      code = removeComments(code);
      Logger.compilerMessage(fileName, "コメントを削除しました");
    }

    code = removeTypeOnlyImports(code);
    code = removeDeclareBlocks(code);
    code = removeInterfaces(code);
    code = removeTypeAliases(code);
    code = convertEnums(code, fileName);
    code = removeNamespaces(code, fileName);
    code = removeAccessModifiers(code);
    code = removeImplements(code);
    code = removeAbstractKeyword(code);
    code = removeReadonlyKeyword(code);
    code = removeOptionalMarks(code);
    code = removeGenericDeclarations(code);
    code = removeTypeAnnotations(code);
    code = removeAsCasts(code);
    code = removeSatisfies(code);
    code = removeNonNullAssertions(code);
    code = processExports(code, settings.targetMode, fileName);
    code = processImports(code, settings.targetMode, fileName);
    code = cleanupJavaScript(code);

    if (settings.strictMode) {
      code = `"use strict";\n\n${code}`;
    }

    const outputName = toOutputName(fileName);

    Logger.compilerMessage(fileName, `出力生成: ${outputName}`);

    return {
      inputName: fileName,
      outputName,
      code,
      warnings: scan.warnings,
      errors: []
    };
  }

  function normalizeSettings(settings) {
    return {
      targetMode: settings && settings.targetMode ? settings.targetMode : "browser",
      keepComments: settings && typeof settings.keepComments === "boolean" ? settings.keepComments : true,
      strictMode: settings && typeof settings.strictMode === "boolean" ? settings.strictMode : true
    };
  }

  function scanSource(fileName, source) {
    const lines = String(source || "").split(/\r?\n/);
    const warnings = [];
    const errors = [];

    lines.forEach((line, index) => {
      const lineNo = index + 1;
      const text = line;

      if (/\bawait\b/.test(text) && !/\basync\b/.test(source)) {
        warnings.push({
          line: lineNo,
          message: "await を検出しました。トップレベルawaitは実行環境に依存します。",
          text
        });
      }

      if (/\bimport\s*\(/.test(text)) {
        warnings.push({
          line: lineNo,
          message: "dynamic import を検出しました。簡易コンパイラでは完全変換しません。",
          text
        });
      }

      if (/\bdecorator\b/.test(text) || /^\s*@\w+/.test(text)) {
        warnings.push({
          line: lineNo,
          message: "デコレーター構文を検出しました。簡易コンパイラでは未対応です。",
          text
        });
      }

      if (/\bnamespace\b/.test(text)) {
        warnings.push({
          line: lineNo,
          message: "namespace を検出しました。簡易的に展開します。",
          text
        });
      }
    });

    if (hasUnbalancedBrackets(source, "{", "}")) {
      errors.push({
        line: 1,
        message: "波括弧の数が一致していません。",
        text: ""
      });
    }

    if (hasUnbalancedBrackets(source, "(", ")")) {
      errors.push({
        line: 1,
        message: "丸括弧の数が一致していません。",
        text: ""
      });
    }

    return {
      warnings,
      errors
    };
  }

  function hasUnbalancedBrackets(source, open, close) {
    let count = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let escaped = false;

    for (const char of String(source || "")) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (!inDouble && !inTemplate && char === "'") {
        inSingle = !inSingle;
        continue;
      }

      if (!inSingle && !inTemplate && char === "\"") {
        inDouble = !inDouble;
        continue;
      }

      if (!inSingle && !inDouble && char === "`") {
        inTemplate = !inTemplate;
        continue;
      }

      if (inSingle || inDouble || inTemplate) continue;

      if (char === open) count++;
      if (char === close) count--;

      if (count < 0) return true;
    }

    return count !== 0;
  }

  function normalizeLineEndings(code) {
    return String(code || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function removeComments(code) {
    return code
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  function removeTypeOnlyImports(code) {
    return code.replace(/^\s*import\s+type\s+.+?;?\s*$/gm, "");
  }

  function removeDeclareBlocks(code) {
    code = code.replace(/^\s*declare\s+global\s*{[\s\S]*?^\s*}\s*$/gm, "");
    code = code.replace(/^\s*declare\s+module\s+["'][^"']+["']\s*{[\s\S]*?^\s*}\s*$/gm, "");
    code = code.replace(/^\s*declare\s+.+?;?\s*$/gm, "");
    return code;
  }

  function removeInterfaces(code) {
    return code
      .replace(/^\s*export\s+interface\s+\w+[\s\S]*?^\s*}\s*;?\s*$/gm, "")
      .replace(/^\s*interface\s+\w+[\s\S]*?^\s*}\s*;?\s*$/gm, "");
  }

  function removeTypeAliases(code) {
    return code
      .replace(/^\s*export\s+type\s+\w+[\s\S]*?;\s*$/gm, "")
      .replace(/^\s*type\s+\w+[\s\S]*?;\s*$/gm, "");
  }

  function convertEnums(code, fileName) {
    return code.replace(/(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)\s*{([\s\S]*?)}/g, function (_, enumName, body) {
      Logger.compilerWarning(fileName, `enum ${enumName} を簡易オブジェクトへ変換します`);

      const members = body
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const lines = [];
      let autoValue = 0;

      for (const member of members) {
        const parts = member.split("=").map((v) => v.trim());
        const key = parts[0].replace(/["']/g, "");
        let value;

        if (parts.length >= 2) {
          value = parts.slice(1).join("=");
          const numeric = Number(value);

          if (Number.isFinite(numeric)) {
            autoValue = numeric + 1;
          }
        } else {
          value = String(autoValue);
          autoValue++;
        }

        lines.push(`  ${JSON.stringify(key)}: ${value}`);
      }

      return `const ${enumName} = Object.freeze({\n${lines.join(",\n")}\n});`;
    });
  }

  function removeNamespaces(code, fileName) {
    return code.replace(/(?:export\s+)?namespace\s+([A-Za-z_$][\w$]*)\s*{([\s\S]*?)}/g, function (_, namespaceName, body) {
      Logger.compilerWarning(fileName, `namespace ${namespaceName} を簡易展開します`);
      return `const ${namespaceName} = (function(){\n${body}\nreturn {};\n})();`;
    });
  }

  function removeAccessModifiers(code) {
    return code.replace(/\b(public|private|protected)\s+/g, "");
  }

  function removeImplements(code) {
    return code.replace(/\s+implements\s+[A-Za-z0-9_$,\s<>]+/g, "");
  }

  function removeAbstractKeyword(code) {
    return code.replace(/\babstract\s+/g, "");
  }

  function removeReadonlyKeyword(code) {
    return code.replace(/\breadonly\s+/g, "");
  }

  function removeOptionalMarks(code) {
    return code.replace(/([A-Za-z_$][\w$]*)\?\s*:/g, "$1:");
  }

  function removeGenericDeclarations(code) {
    code = code.replace(/function\s+([A-Za-z_$][\w$]*)\s*<[^>]+>\s*\(/g, "function $1(");
    code = code.replace(/class\s+([A-Za-z_$][\w$]*)\s*<[^>]+>/g, "class $1");
    code = code.replace(/const\s+([A-Za-z_$][\w$]*)\s*=\s*<[^>]+>\s*\(/g, "const $1 = (");
    return code;
  }

  function removeTypeAnnotations(code) {
    code = code.replace(/:\s*[A-Za-z_$][A-Za-z0-9_$<>,\s$begin:math:display$$end:math:display$\|&?.]*(?=\s*[=,);{])/g, "");
    code = code.replace(/\)\s*:\s*[A-Za-z_$][A-Za-z0-9_$<>,\s$begin:math:display$$end:math:display$\|&?.]*\s*{/g, ") {");
    code = code.replace(/\)\s*:\s*[A-Za-z_$][A-Za-z0-9_$<>,\s$begin:math:display$$end:math:display$\|&?.]*\s*=>/g, ") =>");
    return code;
  }

  function removeAsCasts(code) {
    return code.replace(/\s+as\s+[A-Za-z_$][A-Za-z0-9_$<>,\s$begin:math:display$$end:math:display$\|&?.]*/g, "");
  }

  function removeSatisfies(code) {
    return code.replace(/\s+satisfies\s+[A-Za-z_$][A-Za-z0-9_$<>,\s$begin:math:display$$end:math:display$\|&?.]*/g, "");
  }

  function removeNonNullAssertions(code) {
    return code.replace(/([A-Za-z_$][\w$]*)!(?=[.\[\);,])/g, "$1");
  }

  function processExports(code, targetMode, fileName) {
    if (targetMode === "module") {
      return code;
    }

    if (/\bexport\b/.test(code)) {
      Logger.compilerWarning(fileName, "browser/node mode のため export を簡易除去します");
    }

    code = code.replace(/^\s*export\s+default\s+/gm, "");
    code = code.replace(/^\s*export\s+(?=class|function|const|let|var|enum)/gm, "");
    code = code.replace(/^\s*export\s*{[^}]+};?\s*$/gm, "");

    return code;
  }

  function processImports(code, targetMode, fileName) {
    if (targetMode === "module") {
      return code;
    }

    if (/^\s*import\s+/m.test(code)) {
      Logger.compilerWarning(fileName, "browser/node mode のため import を削除します");
    }

    return code.replace(/^\s*import\s+.+?;?\s*$/gm, "");
  }

  function cleanupJavaScript(code) {
    return String(code || "")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function toOutputName(fileName) {
    return String(fileName || "main.ts")
      .replace(/\.tsx$/i, ".js")
      .replace(/\.ts$/i, ".js");
  }

  window.TSCompiler = {
    compileFiles,
    compileSingleFile,

    scanSource,

    normalizeLineEndings,
    removeComments,
    removeTypeOnlyImports,
    removeDeclareBlocks,
    removeInterfaces,
    removeTypeAliases,
    convertEnums,
    removeNamespaces,
    removeAccessModifiers,
    removeImplements,
    removeAbstractKeyword,
    removeReadonlyKeyword,
    removeOptionalMarks,
    removeGenericDeclarations,
    removeTypeAnnotations,
    removeAsCasts,
    removeSatisfies,
    removeNonNullAssertions,
    processExports,
    processImports,
    cleanupJavaScript,
    toOutputName
  };
})();