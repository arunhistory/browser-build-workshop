(function () {
  "use strict";

  function setText(targetElement, value) {
    if (!targetElement) {
      return;
    }
    targetElement.textContent = typeof value === "string" ? value : "";
  }

  function setStatus(targetElement, message) {
    if (!targetElement) {
      return;
    }
    targetElement.textContent = "状態: " + (typeof message === "string" ? message : "");
  }

  function setLog(targetElement, message) {
    if (!targetElement) {
      return;
    }
    targetElement.textContent = typeof message === "string" ? message : "";
  }

  function setOutput(targetElement, message) {
    if (!targetElement) {
      return;
    }
    targetElement.textContent = typeof message === "string" ? message : "";
  }

  window.BBWStatus = {
    setText: setText,
    setStatus: setStatus,
    setLog: setLog,
    setOutput: setOutput
  };
})();