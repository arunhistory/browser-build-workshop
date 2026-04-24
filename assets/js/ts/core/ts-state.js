(function () {
  "use strict";

  const DEFAULT_SETTINGS = {
    outputName: "main.js",
    targetMode: "browser",
    enableMinify: false,
    enableObfuscate: false,
    keepComments: true,
    strictMode: true,
    sourceMap: false
  };

  const DEFAULT_MAIN_FILE = {
    id: "file-main-ts",
    name: "main.ts",
    path: "/src/main.ts",
    code:
`type User = {
  id: number;
  name: string;
};

const user: User = {
  id: 1,
  name: "Orikuro"
};

function hello(target: User): string {
  return \`Hello, \${target.name}\`;
}

console.log(hello(user));`
  };

  const state = {
    files: [clone(DEFAULT_MAIN_FILE)],
    activeFileId: DEFAULT_MAIN_FILE.id,
    settings: clone(DEFAULT_SETTINGS),
    outputs: [],
    logs: [],
    isRunning: false,
    lastBuildAt: null,
    lastError: null
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createId(prefix) {
    const random = Math.random().toString(36).slice(2, 10);
    const time = Date.now().toString(36);
    return `${prefix}-${time}-${random}`;
  }

  function getState() {
    return state;
  }

  function resetState() {
    state.files = [clone(DEFAULT_MAIN_FILE)];
    state.activeFileId = DEFAULT_MAIN_FILE.id;
    state.settings = clone(DEFAULT_SETTINGS);
    state.outputs = [];
    state.logs = [];
    state.isRunning = false;
    state.lastBuildAt = null;
    state.lastError = null;
  }

  function getFiles() {
    return state.files;
  }

  function setFiles(files) {
    if (!Array.isArray(files)) {
      throw new Error("files must be an array");
    }

    state.files = files.map((file) => normalizeFile(file));

    if (state.files.length === 0) {
      state.files.push(clone(DEFAULT_MAIN_FILE));
    }

    if (!state.files.some((file) => file.id === state.activeFileId)) {
      state.activeFileId = state.files[0].id;
    }
  }

  function normalizeFile(file) {
    const id = file.id || createId("file");
    const name = normalizeFileName(file.name || "main.ts");

    return {
      id,
      name,
      path: file.path || `/src/${name}`,
      code: typeof file.code === "string" ? file.code : ""
    };
  }

  function normalizeFileName(name) {
    const safeName = String(name || "main.ts").trim();

    if (!safeName) return "main.ts";
    if (safeName.endsWith(".ts") || safeName.endsWith(".tsx")) return safeName;

    return `${safeName}.ts`;
  }

  function getActiveFileId() {
    return state.activeFileId;
  }

  function setActiveFileId(fileId) {
    const exists = state.files.some((file) => file.id === fileId);

    if (!exists) {
      throw new Error(`active file not found: ${fileId}`);
    }

    state.activeFileId = fileId;
  }

  function getActiveFile() {
    return state.files.find((file) => file.id === state.activeFileId) || null;
  }

  function getSettings() {
    return state.settings;
  }

  function setSettings(settings) {
    state.settings = {
      ...state.settings,
      ...settings
    };
  }

  function resetSettings() {
    state.settings = clone(DEFAULT_SETTINGS);
  }

  function getOutputs() {
    return state.outputs;
  }

  function setOutputs(outputs) {
    if (!Array.isArray(outputs)) {
      throw new Error("outputs must be an array");
    }

    state.outputs = outputs;
  }

  function clearOutputs() {
    state.outputs = [];
  }

  function getLogs() {
    return state.logs;
  }

  function setLogs(logs) {
    if (!Array.isArray(logs)) {
      throw new Error("logs must be an array");
    }

    state.logs = logs;
  }

  function addLog(log) {
    state.logs.push(log);
  }

  function clearLogs() {
    state.logs = [];
  }

  function isRunning() {
    return state.isRunning;
  }

  function setRunning(value) {
    state.isRunning = Boolean(value);
  }

  function getLastBuildAt() {
    return state.lastBuildAt;
  }

  function setLastBuildAt(value) {
    state.lastBuildAt = value;
  }

  function getLastError() {
    return state.lastError;
  }

  function setLastError(error) {
    state.lastError = error;
  }

  function clearLastError() {
    state.lastError = null;
  }

  window.TSBuildState = {
    DEFAULT_SETTINGS,
    DEFAULT_MAIN_FILE,

    createId,
    clone,

    getState,
    resetState,

    getFiles,
    setFiles,

    normalizeFile,
    normalizeFileName,

    getActiveFileId,
    setActiveFileId,
    getActiveFile,

    getSettings,
    setSettings,
    resetSettings,

    getOutputs,
    setOutputs,
    clearOutputs,

    getLogs,
    setLogs,
    addLog,
    clearLogs,

    isRunning,
    setRunning,

    getLastBuildAt,
    setLastBuildAt,

    getLastError,
    setLastError,
    clearLastError
  };
})();