(function () {
  "use strict";

  if (!window.TSBuildState) {
    throw new Error("TSBuildState is required before ts-logger.js");
  }

  const State = window.TSBuildState;

  const LEVEL_LABELS = {
    info: "INFO",
    warn: "WARN",
    error: "ERROR",
    success: "SUCCESS",
    debug: "DEBUG"
  };

  function nowText() {
    const date = new Date();

    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");

    return `${hh}:${mm}:${ss}`;
  }

  function createLog(level, message, detail) {
    const safeLevel = LEVEL_LABELS[level] ? level : "info";

    return {
      id: State.createId("log"),
      time: nowText(),
      level: safeLevel,
      label: LEVEL_LABELS[safeLevel],
      message: String(message || ""),
      detail: detail || null
    };
  }

  function add(level, message, detail) {
    const log = createLog(level, message, detail);
    State.addLog(log);
    return log;
  }

  function info(message, detail) {
    return add("info", message, detail);
  }

  function warn(message, detail) {
    return add("warn", message, detail);
  }

  function error(message, detail) {
    return add("error", message, detail);
  }

  function success(message, detail) {
    return add("success", message, detail);
  }

  function debug(message, detail) {
    return add("debug", message, detail);
  }

  function clear() {
    State.clearLogs();
  }

  function getLogs() {
    return State.getLogs();
  }

  function formatLog(log) {
    const head = `[${log.time}] [${log.label}]`;
    const message = log.message || "";

    if (!log.detail) {
      return `${head} ${message}`;
    }

    if (typeof log.detail === "string") {
      return `${head} ${message}\n${indent(log.detail)}`;
    }

    return `${head} ${message}\n${indent(JSON.stringify(log.detail, null, 2))}`;
  }

  function formatAll() {
    const logs = State.getLogs();

    if (!logs.length) {
      return "ログはありません。";
    }

    return logs.map(formatLog).join("\n");
  }

  function indent(text) {
    return String(text)
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n");
  }

  function lineError(fileName, lineNumber, message, lineText) {
    return error(`${fileName}:${lineNumber} ${message}`, {
      fileName,
      lineNumber,
      lineText: lineText || ""
    });
  }

  function lineWarn(fileName, lineNumber, message, lineText) {
    return warn(`${fileName}:${lineNumber} ${message}`, {
      fileName,
      lineNumber,
      lineText: lineText || ""
    });
  }

  function buildStart(label) {
    clear();

    info("TS変換を開始しました。", {
      label: label || "typescript-build",
      startedAt: new Date().toISOString()
    });
  }

  function buildEndSuccess(outputs) {
    success("TS変換が完了しました。", {
      outputCount: Array.isArray(outputs) ? outputs.length : 0,
      endedAt: new Date().toISOString()
    });
  }

  function buildEndError(err) {
    const message = err && err.message ? err.message : String(err || "unknown error");

    error("TS変換に失敗しました。", {
      message,
      endedAt: new Date().toISOString()
    });
  }

  function validateSummary(result) {
    if (!result || !Array.isArray(result.errors)) {
      return;
    }

    if (result.ok) {
      success("入力ファイル検証に成功しました。");
      return;
    }

    for (const item of result.errors) {
      error(item);
    }
  }

  function compilerMessage(fileName, message) {
    return info(`${fileName}: ${message}`);
  }

  function compilerWarning(fileName, message) {
    return warn(`${fileName}: ${message}`);
  }

  function compilerError(fileName, message) {
    return error(`${fileName}: ${message}`);
  }

  function toText() {
    return formatAll();
  }

  window.TSLogger = {
    LEVEL_LABELS,

    createLog,
    add,

    info,
    warn,
    error,
    success,
    debug,

    clear,
    getLogs,

    formatLog,
    formatAll,
    toText,

    lineError,
    lineWarn,

    buildStart,
    buildEndSuccess,
    buildEndError,

    validateSummary,

    compilerMessage,
    compilerWarning,
    compilerError
  };
})();