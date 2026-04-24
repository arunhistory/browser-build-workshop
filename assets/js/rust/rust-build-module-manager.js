(function (global) {
  'use strict';

  const MODULE_NAME = 'RustBuildModuleManager';
  const MODULE_VERSION = '0.1.0';

  function safeString(value, fallback = '') {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function trim(value) {
    return safeString(value).trim();
  }

  function hasFunction(target, name) {
    return !!target && typeof target[name] === 'function';
  }

  function getRegisteredModules() {
    return {
      realCompiler: global.RustRealCompiler || null,
      buildController: global.RustBuildController || null,
      buildEngine: global.RustBuildEngine || null,
      dependencyManager: global.RustDependencyManager || null,
      virtualFs: global.RustVirtualFs || null,
      fileManager: global.RustFileManager || null,
      outputManager: global.RustOutputManager || null
    };
  }

  function inspectModules() {
    const modules = getRegisteredModules();

    return {
      realCompilerReady: hasFunction(modules.realCompiler, 'compile'),
      buildControllerReady: hasFunction(modules.buildController, 'runBuild'),
      buildEngineReady: hasFunction(modules.buildEngine, 'runBuild'),
      dependencyManagerReady: hasFunction(modules.dependencyManager, 'validateDependencies'),
      virtualFsReady: hasFunction(modules.virtualFs, 'createVirtualFs'),
      fileManagerReady: hasFunction(modules.fileManager, 'downloadFiles'),
      outputManagerReady: hasFunction(modules.outputManager, 'buildOutputBundle'),
      modules: modules
    };
  }

  function chooseRunner(options) {
    const mode = trim(options && options.compileMode || 'real');
    const inspected = inspectModules();

    if (mode === 'real') {
      if (inspected.realCompilerReady) {
        return {
          ok: true,
          runnerType: 'real',
          runnerName: 'RustRealCompiler.compile',
          run: function (input) {
            return inspected.modules.realCompiler.compile(input);
          }
        };
      }

      return {
        ok: false,
        runnerType: 'real',
        runnerName: '',
        error: 'RustRealCompiler.compile が見つかりません。'
      };
    }

    if (mode === 'mock') {
      if (inspected.buildControllerReady) {
        return {
          ok: true,
          runnerType: 'mock',
          runnerName: 'RustBuildController.runBuild',
          run: function (input) {
            return inspected.modules.buildController.runBuild(input);
          }
        };
      }

      if (inspected.buildEngineReady) {
        return {
          ok: true,
          runnerType: 'mock',
          runnerName: 'RustBuildEngine.runBuild',
          run: function (input) {
            return inspected.modules.buildEngine.runBuild(input);
          }
        };
      }

      return {
        ok: false,
        runnerType: 'mock',
        runnerName: '',
        error: 'RustBuildController.runBuild / RustBuildEngine.runBuild が見つかりません。'
      };
    }

    return {
      ok: false,
      runnerType: mode || 'unknown',
      runnerName: '',
      error: 'compileMode は real / mock のいずれかにしてください。'
    };
  }

  function attachExecutionMeta(result, meta) {
    const source = result && typeof result === 'object' ? clone(result) : {};

    source.execution = {
      module: MODULE_NAME,
      version: MODULE_VERSION,
      runnerType: safeString(meta.runnerType || ''),
      runnerName: safeString(meta.runnerName || ''),
      requestedMode: safeString(meta.requestedMode || ''),
      switchedMode: safeString(meta.switchedMode || ''),
      timestamp: new Date().toISOString()
    };

    return source;
  }

  function execute(input) {
    const source = input && typeof input === 'object' ? clone(input) : {};
    const requestedMode = trim(source.compileMode || 'real') || 'real';

    const runner = chooseRunner({
      compileMode: requestedMode
    });

    if (!runner.ok) {
      return {
        ok: false,
        status: 'error',
        compileKind: requestedMode,
        errors: [runner.error],
        warnings: [],
        outputFiles: [],
        logText: [
          'ビルド実行に失敗しました。',
          'module: ' + MODULE_NAME,
          'version: ' + MODULE_VERSION,
          'requested mode: ' + requestedMode,
          'error: ' + runner.error
        ].join('\n'),
        outputText: '',
        summaryHtml: [
          '<div class="rust-build-module-error">',
          '<p><strong>module:</strong> ' + safeString(MODULE_NAME) + '</p>',
          '<p><strong>version:</strong> ' + safeString(MODULE_VERSION) + '</p>',
          '<p><strong>requested mode:</strong> ' + safeString(requestedMode) + '</p>',
          '<p><strong>error:</strong> ' + safeString(runner.error) + '</p>',
          '</div>'
        ].join('')
      };
    }

    const result = runner.run(source);

    return attachExecutionMeta(result, {
      runnerType: runner.runnerType,
      runnerName: runner.runnerName,
      requestedMode: requestedMode,
      switchedMode: runner.runnerType
    });
  }

  function describeAvailability() {
    const inspected = inspectModules();
    const lines = [];

    lines.push('module: ' + MODULE_NAME);
    lines.push('version: ' + MODULE_VERSION);
    lines.push('realCompilerReady: ' + (inspected.realCompilerReady ? 'yes' : 'no'));
    lines.push('buildControllerReady: ' + (inspected.buildControllerReady ? 'yes' : 'no'));
    lines.push('buildEngineReady: ' + (inspected.buildEngineReady ? 'yes' : 'no'));
    lines.push('dependencyManagerReady: ' + (inspected.dependencyManagerReady ? 'yes' : 'no'));
    lines.push('virtualFsReady: ' + (inspected.virtualFsReady ? 'yes' : 'no'));
    lines.push('fileManagerReady: ' + (inspected.fileManagerReady ? 'yes' : 'no'));
    lines.push('outputManagerReady: ' + (inspected.outputManagerReady ? 'yes' : 'no'));

    return lines.join('\n');
  }

  function getCapabilities() {
    const inspected = inspectModules();

    return {
      moduleName: MODULE_NAME,
      version: MODULE_VERSION,
      availableModes: [
        inspected.realCompilerReady ? 'real' : null,
        (inspected.buildControllerReady || inspected.buildEngineReady) ? 'mock' : null
      ].filter(Boolean),
      modules: {
        realCompiler: inspected.realCompilerReady,
        buildController: inspected.buildControllerReady,
        buildEngine: inspected.buildEngineReady,
        dependencyManager: inspected.dependencyManagerReady,
        virtualFs: inspected.virtualFsReady,
        fileManager: inspected.fileManagerReady,
        outputManager: inspected.outputManagerReady
      }
    };
  }

  global.RustBuildModuleManager = {
    moduleName: MODULE_NAME,
    version: MODULE_VERSION,
    inspectModules: inspectModules,
    chooseRunner: chooseRunner,
    execute: execute,
    describeAvailability: describeAvailability,
    getCapabilities: getCapabilities
  };
})(window);