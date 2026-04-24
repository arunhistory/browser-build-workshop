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

    const result = outputs.map(function (output) {
      const beforeSize = countBytes(output.code || "");
      const code = minifyJavaScript(output.code || "");
      const afterSize = countBytes(code);

      Logger.info(output.outputName + ": 圧縮完了", {
        beforeSize: beforeSize,
        afterSize: afterSize,
        savedBytes: beforeSize - afterSize
      });

      return Object.assign({}, output, {
        code: code,
        minified: true,
        beforeMinifySize: beforeSize,
        afterMinifySize: afterSize
      });
    });

    Logger.success("JS圧縮処理が完了しました。");

    return result;
  }

  function minifyJavaScript(code) {
    let source = String(code || "");

    source = normalizeLineEndings(source);
    source = removeBlockComments(source);
    source = removeLineComments(source);
    source = trimLines(source);
    source = collapseBlankLines(source);
    source = collapseSpaces(source);
    source = removeSafeSpaces(source);

    return source.trim();
  }

  function normalizeLineEndings(code) {
    return String(code || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
  }

  function removeBlockComments(code) {
    return String(code || "").replace(/\/\*[\s\S]*?\*\//g, "");
  }

  function removeLineComments(code) {
    const lines = String(code || "").split("\n");

    return lines.map(function (line) {
      return removeLineCommentSafe(line);
    }).join("\n");
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

  function trimLines(code) {
    return String(code || "")
      .split("\n")
      .map(function (line) {
        return line.trim();
      })
      .join("\n");
  }

  function collapseBlankLines(code) {
    return String(code || "").replace(/\n{2,}/g, "\n");
  }

  function collapseSpaces(code) {
    return String(code || "").replace(/[ \t]{2,}/g, " ");
  }

  function removeSafeSpaces(code) {
    return String(code || "")
      .replace(/\s*([{}()[\];,])\s*/g, "$1")
      .replace(/\s*([+\-*%=&|<>?:])\s*/g, "$1")
      .replace(/([^=])=([^=>])/g, "$1=$2")
      .replace(/=>/g, "=>")
      .replace(/===/g, "===")
      .replace(/!==/g, "!==")
      .replace(/<=/g, "<=")
      .replace(/>=/g, ">=")
      .replace(/\|\|/g, "||")
      .replace(/&&/g, "&&");
  }

  function countBytes(text) {
    return new Blob([String(text || "")]).size;
  }

  window.TSMinifier = {
    minifyOutputs: minifyOutputs,
    minifyJavaScript: minifyJavaScript,

    normalizeLineEndings: normalizeLineEndings,
    removeBlockComments: removeBlockComments,
    removeLineComments: removeLineComments,
    removeLineCommentSafe: removeLineCommentSafe,
    trimLines: trimLines,
    collapseBlankLines: collapseBlankLines,
    collapseSpaces: collapseSpaces,
    removeSafeSpaces: removeSafeSpaces,
    countBytes: countBytes
  };
})();