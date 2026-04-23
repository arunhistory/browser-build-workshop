(function () {
  "use strict";

  function text(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value;
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function createEmptyItem(message) {
    return [
      '<div class="file-item">',
      "<span>" + escapeHtml(message || "ファイルはありません") + "</span>",
      "<span>-</span>",
      "</div>"
    ].join("");
  }

  function createFileItem(file, index) {
    var name = "";
    var lengthText = "0 chars";

    if (file && typeof file === "object") {
      name = text(file.name);
      lengthText = String(text(file.code).length) + " chars";
    }

    return [
      '<div class="file-item">',
      "<span>" + (index + 1) + ". " + escapeHtml(name) + "</span>",
      "<span>" + escapeHtml(lengthText) + "</span>",
      "</div>"
    ].join("");
  }

  function renderFileList(targetElement, files, emptyMessage) {
    if (!targetElement) {
      return;
    }

    if (!Array.isArray(files) || files.length === 0) {
      targetElement.innerHTML = createEmptyItem(emptyMessage);
      return;
    }

    targetElement.innerHTML = files
      .map(function (file, index) {
        return createFileItem(file, index);
      })
      .join("");
  }

  window.BBWFileList = {
    text: text,
    escapeHtml: escapeHtml,
    createEmptyItem: createEmptyItem,
    createFileItem: createFileItem,
    renderFileList: renderFileList
  };
})();