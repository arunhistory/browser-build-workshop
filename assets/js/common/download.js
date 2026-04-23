(function () {
  "use strict";

  function isValidText(value) {
    return typeof value === "string" && value.length > 0;
  }

  function createTextBlob(content, mimeType) {
    return new Blob([content], {
      type: mimeType || "text/plain;charset=utf-8"
    });
  }

  function downloadBlob(blob, fileName) {
    if (!blob || !fileName) {
      return false;
    }

    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    return true;
  }

  function downloadTextFile(content, fileName, mimeType) {
    if (!isValidText(content) || !isValidText(fileName)) {
      return false;
    }

    var blob = createTextBlob(content, mimeType);
    return downloadBlob(blob, fileName);
  }

  window.BBWDownload = {
    isValidText: isValidText,
    createTextBlob: createTextBlob,
    downloadBlob: downloadBlob,
    downloadTextFile: downloadTextFile
  };
})();