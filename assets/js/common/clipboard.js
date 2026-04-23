(function () {
  "use strict";

  function isValidText(value) {
    return typeof value === "string" && value.length > 0;
  }

  function copyText(content) {
    if (!isValidText(content)) {
      return Promise.reject(new Error("empty_content"));
    }

    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      return Promise.reject(new Error("clipboard_not_supported"));
    }

    return navigator.clipboard.writeText(content);
  }

  window.BBWClipboard = {
    isValidText: isValidText,
    copyText: copyText
  };
})();