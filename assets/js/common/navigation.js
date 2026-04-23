(function () {
  "use strict";

  function moveTo(path) {
    if (typeof path !== "string" || path.trim() === "") {
      return;
    }
    window.location.href = path;
  }

  function bindMove(buttonId, path) {
    var button = document.getElementById(buttonId);
    if (!button) {
      return;
    }

    button.addEventListener("click", function () {
      moveTo(path);
    });
  }

  window.BBWNavigation = {
    moveTo: moveTo,
    bindMove: bindMove
  };
})();