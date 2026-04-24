(function () {
  "use strict";

  if (!window.TSLogger) {
    throw new Error("TSLogger is required before ts-minifier.js");
  }

  const Logger = window.TSLogger;

  function minifyOutputs(outputs) {
    if (!Array.isArray(outputs)) {
      throw new Error("minifyOutputs requires outputs array");
    }

    Logger.info("JS圧縮処理を開始します。", {
      outputCount: outputs.length
    });

    const result = outputs.map((output) => {
      const beforeSize = countBytes(output.code);
      const minifiedCode = minifyJavaScript(output.code);
      const afterSize = countBytes(minifiedCode);

      Logger.info(`${output.outputName}: 圧縮完了`, {
        beforeSize,
        afterSize,
        savedBytes: beforeSize - afterSize
      });

      return {
        ...output,
        code: minifiedCode,
        minified: true,
        beforeMinifySize: beforeSize,
        afterMinifySize: afterSize
      };
    });

    Logger.success("JS圧縮処理が完了しました。");

    return result;
  }

  function minifyJavaScript(code) {
    let result = String(code || "");

    result = normalizeLineEndings(result);
    result = removeBlockComments(result);
    result = removeLineComments(result);
    result = collapseWhitespace(result);
    result = removeSpacesAroundSymbols(result);
    result = cleanupSemicolons(result);

    return result.trim();
  }

  function normalizeLineEndings(code) {
    return String(code || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function removeBlockComments(code) {
    return String(code || "").replace(/\/\*[\s\S]*?\*\//g, "");
  }

  function removeLineComments(code) {
    const source = String(code || "");
    const lines = source.split("\n");
    const result = [];

    for (const line of lines) {
      result.push(removeLineCommentSafe(line));
    }

    return result.join("\n");
  }

  function removeLineCommentSafe(line) {
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let escaped = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

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

      if (!inSingle && !inDouble && !inTemplate && char === "/" && next === "/") {
        const before = line[i - 1] || "";

        if (before === ":") {
          continue;
        }

        return line.slice(0, i).trimEnd();
      }
    }

    return line;
  }

  function collapseWhitespace(code) {
    let result = String(code || "");

    result = result
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(" ");

    result = result.replace(/\s+/g, " ");

    return result;
  }

  function removeSpacesAroundSymbols(code) {
    let result = String(code || "");

    const symbols = [
      "\\{",
      "\\}",
      "\$begin:math:text$\"\,
      \"\\$end:math:text$",
      "\$begin:math:display$\"\,
      \"\\$end:math:display$",
      ";",
      ",",
      ":",
      "=",
      "\\+",
      "-",
      "\\*",
      "/",
      "%",
      "<",
      ">",
      "\\?",
      "\\|",
      "&"
    ];

    for (const symbol of symbols) {
      const pattern = new RegExp(`\\s*${symbol}\\s*`, "g");
      const raw = symbol.replace(/\\/g, "");
      result = result.replace(pattern, raw);
    }

    result = result
      .replace(/===/g, "===")
      .replace(/!==/g, "!==")
      .replace(/=>/g, "=>")
      .replace(/\+\+/g, "++")
      .replace(/--/g, "--")
      .replace(/\|\|/g, "||")
      .replace(/&&/g, "&&")
      .replace(/<=/g, "<=")
      .replace(/>=/g, ">=");

    return result;
  }

  function cleanupSemicolons(code) {
    return String(code || "")
      .replace(/;+/g, ";")
      .replace(/;}/g, "}")
      .replace(/{;/g, "{");
  }

  function countBytes(text) {
    return new Blob([String(text || "")]).size;
  }

  window.TSMinifier = {
    minifyOutputs,
    minifyJavaScript,

    normalizeLineEndings,
    removeBlockComments,
    removeLineComments,
    removeLineCommentSafe,
    collapseWhitespace,
    removeSpacesAroundSymbols,
    cleanupSemicolons,
    countBytes
  };
})();