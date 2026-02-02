/**
 * UI helpers (modals, uploads, lightbox).
 */

export function closeAllModals() {
  document.querySelectorAll('[id$="-modal"]').forEach((modal) => {
    modal.classList.add("hidden");
  });
}

export function setupImageUpload(dropZoneId, inputId, previewId) {
  const dropZone = document.getElementById(dropZoneId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);

  if (!dropZone || !input || !preview) return;

  dropZone.onclick = () => input.click();

  input.onchange = (e) => {
    if (e.target.files.length > 0) {
      showPreview(e.target.files[0], preview);
    }
  };

  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  };

  dropZone.ondragleave = () => {
    dropZone.classList.remove("dragover");
  };

  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      input.files = e.dataTransfer.files;
      showPreview(e.dataTransfer.files[0], preview);
    }
  };
}

function showPreview(file, previewEl) {
  const reader = new FileReader();
  reader.onload = (e) => {
    previewEl.querySelector("img").src = e.target.result;
    previewEl.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

/**
 * 打开图片放大查看
 */
export function openLightbox(imageUrl, title) {
  const lightbox = document.getElementById("image-lightbox");
  document.getElementById("lightbox-image").src = imageUrl;
  document.getElementById("lightbox-title").textContent = title || "";
  lightbox.classList.remove("hidden");
}

/**
 * 关闭图片放大查看
 */
export function closeLightbox() {
  document.getElementById("image-lightbox").classList.add("hidden");
}

