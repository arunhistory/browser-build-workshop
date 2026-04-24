(function () {
  "use strict";

  if (!window.TSLogger) {
    throw new Error("TSLogger is required before ts-obfuscator.js");
  }

  const Logger = window.TSLogger;

  const RESERVED_WORDS = new Set([
    "break", "case", "catch", "class", "const", "continue", "debugger",
    "default", "delete", "do", "else", "export", "extends", "finally",
    "for", "function", "if", "import", "in", "instanceof", "let", "new",
    "return", "super", "switch", "this", "throw", "try", "typeof", "var",
    "void", "while", "with", "yield", "async", "await", "static", "of",
    "true", "false", "null", "undefined", "console", "log", "warn", "error",
    "Math", "Date", "Array", "Object", "String", "Number", "Boolean",
    "JSON", "Promise", "setTimeout", "setInterval", "clearTimeout",
    "clearInterval", "window", "document", "localStorage", "sessionStorage"
  ]);

  function obfuscateOutputs(outputs) {
    if (!Array.isArray(outputs)) {
      throw new Error("obfuscateOutputs requires outputs array");
    }

    Logger.info("JS難読化処理を開始します。", {
      outputCount: outputs.length
    });

    const result = outputs.map((output) => {
      const obfuscated = obfuscateJavaScript(output.code);

      Logger.info(`${output.outputName}: 難読化完了`, {
        renamedCount: obfuscated.renamedCount,
        stringCount: obfuscated.stringCount
      });

      return {
        ...output,
        code: obfuscated.code,
        obfuscated: true,
        obfuscationMap: obfuscated.map
      };
    });

    Logger.success("JS難読化処理が完了しました。");

    return result;
  }

  function obfuscateJavaScript(code) {
    let source = String(code || "");

    const stringResult = protectStrings(source);
    source = stringResult.code;

    const renameResult = renameLocalIdentifiers(source);
    source = renameResult.code;

    source = restoreStrings(source, stringResult.strings);
    source = addWrapper(source);

    return {
      code: source,
      map: renameResult.map,
      renamedCount: Object.keys(renameResult.map).length,
      stringCount: stringResult.strings.length
    };
  }

  function protectStrings(code) {
    const strings = [];
    let result = "";
    let i = 0;

    while (i < code.length) {
      const char = code[i];

      if (char === "'" || char === "\"" || char === "`") {
        const quote = char;
        let value = char;
        i++;

        let escaped = false;

        while (i < code.length) {
          const current = code[i];
          value += current;

          if (escaped) {
            escaped = false;
            i++;
            continue;
          }

          if (current === "\\") {
            escaped = true;
            i++;
            continue;
          }

          if (current === quote) {
            i++;
            break;
          }

          i++;
        }

        const token = `__TS_STRING_${strings.length}__`;
        strings.push(value);
        result += token;
        continue;
      }

      result += char;
      i++;
    }

    return {
      code: result,
      strings
    };
  }

  function restoreStrings(code, strings) {
    let result = String(code || "");

    strings.forEach((value, index) => {
      const token = new RegExp(`__TS_STRING_${index}__`, "g");
      result = result.replace(token, value);
    });

    return result;
  }

  function renameLocalIdentifiers(code) {
    const identifiers = collectIdentifiers(code);
    const map = {};
    let index = 0;

    for (const name of identifiers) {
      if (RESERVED_WORDS.has(name)) continue;
      if (name.startsWith("__TS_STRING_")) continue;
      if (name.length <= 1) continue;

      map[name] = createShortName(index);
      index++;
    }

    let result = String(code || "");

    for (const [from, to] of Object.entries(map)) {
      const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, "g");
      result = result.replace(pattern, to);
    }

    return {
      code: result,
      map
    };
  }

  function collectIdentifiers(code) {
    const found = new Set();

    const patterns = [
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
      /\bfunction\s+([A-Za-z_$][\w$]*)/g,
      /\bclass\s+([A-Za-z_$][\w$]*)/g,
      /$begin:math:text$\(\[\^\)\]\*\)$end:math:text$\s*=>/g,
      /function\s*[A-Za-z_$]*\s*$begin:math:text$\(\[\^\)\]\*\)$end:math:text$/g
    ];

    for (const pattern of patterns) {
      let match;

      while ((match = pattern.exec(code)) !== null) {
        if (!match[1]) continue;

        if (match[1].includes(",")) {
          const params = match[1]
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

          for (const param of params) {
            const clean = param.replace(/=.*$/g, "").trim();
            if (/^[A-Za-z_$][\w$]*$/.test(clean)) found.add(clean);
          }
        } else {
          const clean = match[1].trim();
          if (/^[A-Za-z_$][\w$]*$/.test(clean)) found.add(clean);
        }
      }
    }

    return Array.from(found);
  }

  function createShortName(index) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let value = "";
    let current = index;

    do {
      value = chars[current % chars.length] + value;
      current = Math.floor(current / chars.length) - 1;
    } while (current >= 0);

    return `_${value}`;
  }

  function addWrapper(code) {
    const body = String(code || "").trim();

    if (!body) {
      return "";
    }

    return `(function(){\n${body}\n})();`;
  }

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  window.TSObfuscator = {
    RESERVED_WORDS,

    obfuscateOutputs,
    obfuscateJavaScript,

    protectStrings,
    restoreStrings,

    renameLocalIdentifiers,
    collectIdentifiers,
    createShortName,

    addWrapper,
    escapeRegExp
  };
})();