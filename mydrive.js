console.log("mydrive.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  /* ================================
   *  Files / Folders toggle (chips)
   * ================================ */
  const filesBtn = document.getElementById("btn-files");
  const foldersBtn = document.getElementById("btn-folders");

  function setTypeFilter(mode) {
    if (!filesBtn || !foldersBtn) return;

    if (mode === "files") {
      filesBtn.classList.add("active");
      foldersBtn.classList.remove("active");
    } else {
      foldersBtn.classList.add("active");
      filesBtn.classList.remove("active");
    }

    console.log("Type filter set to:", mode);
  }

  if (filesBtn) {
    filesBtn.addEventListener("click", () => setTypeFilter("files"));
  }
  if (foldersBtn) {
    foldersBtn.addEventListener("click", () => setTypeFilter("folders"));
  }

  /* ========================================
   *  Kebab menu + inline file actions
   * ======================================== */

    /* ========================================
   *  Kebab menu + inline file actions
   * ======================================== */
  document.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest(".kebab-toggle");
    const insideKebab = e.target.closest(".kebab");

    // 1) If we clicked the three-dots button
    if (toggleBtn && insideKebab) {
      // Close all others
      document.querySelectorAll(".kebab.open").forEach((k) => {
        if (k !== insideKebab) k.classList.remove("open");
      });

      // Toggle this one
      const nowOpen = insideKebab.classList.toggle("open");
      console.log("kebab now open?", nowOpen);

      // Stop click from bubbling further
      e.stopPropagation();
      return;
    }

    // 2) If we clicked anywhere outside any .kebab → close all
    if (!insideKebab) {
      document.querySelectorAll(".kebab.open").forEach((k) =>
        k.classList.remove("open")
      );
    }
  });


  function handleFileAction(action, fileId) {
    console.log(`Action: ${action} on file: ${fileId}`);

    switch (action) {
      case "share":
        // open share dialog
        break;
      case "download":
        // window.location = `/files/${fileId}/download`;
        break;
      case "rename":
        // show prompt / modal, then call backend
        break;
      case "star":
        // toggle star in backend + update UI
        break;
      case "trash":
        // move file to trash
        break;
      case "details":
        // open side panel / modal with file details
        break;
      default:
        break;
    }
  }
});

 
