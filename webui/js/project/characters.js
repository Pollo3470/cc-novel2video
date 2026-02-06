import { state } from "./state.js";
import { loadProject } from "./actions_project.js";
import { closeAllModals } from "./ui.js";
import {
  initCharacterVersionControls,
  updateGenerateButton,
} from "./versions.js";

// ==================== 人物管理 ====================

export async function openCharacterModal(charName = null) {
  const modal = document.getElementById("character-modal");
  const form = document.getElementById("character-form");
  const title = document.getElementById("character-modal-title");
  const generateBtn = document.getElementById("char-generate-btn");
  const loadingEl = document.getElementById("char-image-loading");

  form.reset();
  document.getElementById("char-image-preview").classList.add("hidden");
  document.getElementById("char-image-version-prompt").classList.add("hidden");
  loadingEl.classList.add("hidden");
  generateBtn.onclick = null;

  // 重置参考图区域
  document.getElementById("char-ref-preview").classList.add("hidden");
  document.getElementById("char-ref-placeholder").classList.remove("hidden");
  document.getElementById("char-ref-input").value = "";

  let hasImage = false;

  if (charName && state.currentProject.characters[charName]) {
    const char = state.currentProject.characters[charName];
    title.textContent = "编辑人物";
    document.getElementById("char-edit-mode").value = "edit";
    document.getElementById("char-original-name").value = charName;
    document.getElementById("char-name").value = charName;
    document.getElementById("char-description").value = char.description || "";
    document.getElementById("char-voice").value = char.voice_style || "";

    if (char.character_sheet) {
      const preview = document.getElementById("char-image-preview");
      preview.querySelector("img").src =
        `${API.getFileUrl(state.projectName, char.character_sheet)}?t=${state.cacheBuster}`;
      preview.classList.remove("hidden");
      hasImage = true;
    }

    // 先重置按钮状态，避免显示上一个人物任务的 loading 样式
    updateGenerateButton(generateBtn, hasImage, false);

    // 显示参考图（如果有）
    if (char.reference_image) {
      const refPreview = document.getElementById("char-ref-preview");
      refPreview.querySelector("img").src =
        `${API.getFileUrl(state.projectName, char.reference_image)}?t=${state.cacheBuster}`;
      refPreview.classList.remove("hidden");
      document.getElementById("char-ref-placeholder").classList.add("hidden");
    }

    // 初始化版本控制
    await initCharacterVersionControls(charName, hasImage);
  } else {
    title.textContent = "添加人物";
    document.getElementById("char-edit-mode").value = "add";
    document.getElementById("char-original-name").value = "";

    // 重置版本选择器
    document.getElementById("char-image-version").innerHTML =
      '<option value="">无版本</option>';
    updateGenerateButton(generateBtn, false);
    generateBtn.onclick = () => alert("请先保存人物后再生成设计图");
    document.getElementById("char-restore-btn").classList.add("hidden");
  }

  modal.classList.remove("hidden");
}

export function editCharacter(name) {
  void openCharacterModal(name);
}

export async function saveCharacter() {
  const mode = document.getElementById("char-edit-mode").value;
  const originalName = document.getElementById("char-original-name").value;
  const name = document.getElementById("char-name").value.trim();
  const description = document.getElementById("char-description").value.trim();
  const voiceStyle = document.getElementById("char-voice").value.trim();
  const imageInput = document.getElementById("char-image-input");
  const refInput = document.getElementById("char-ref-input");

  if (!name || !description) {
    alert("请填写必填字段");
    return;
  }

  try {
    // 如果有新参考图，先上传
    let referenceImage = null;
    if (refInput.files.length > 0) {
      const result = await API.uploadFile(
        state.projectName,
        "character_ref",
        refInput.files[0],
        name,
      );
      referenceImage = result.path;
    }

    // 如果有新设计图，上传
    let characterSheet = null;
    if (imageInput.files.length > 0) {
      const result = await API.uploadFile(
        state.projectName,
        "character",
        imageInput.files[0],
        name,
      );
      characterSheet = result.path;
    }

    if (mode === "add") {
      await API.addCharacter(state.projectName, name, description, voiceStyle);
      if (referenceImage) {
        await API.updateCharacter(state.projectName, name, {
          reference_image: referenceImage,
        });
      }
      if (characterSheet) {
        await API.updateCharacter(state.projectName, name, {
          character_sheet: characterSheet,
        });
      }
    } else {
      // 编辑模式
      if (originalName !== name) {
        // 名称变更，需要先删除旧的再添加新的
        await API.deleteCharacter(state.projectName, originalName);
        await API.addCharacter(
          state.projectName,
          name,
          description,
          voiceStyle,
        );
      } else {
        await API.updateCharacter(state.projectName, name, {
          description,
          voice_style: voiceStyle,
        });
      }
      if (referenceImage) {
        await API.updateCharacter(state.projectName, name, {
          reference_image: referenceImage,
        });
      }
      if (characterSheet) {
        await API.updateCharacter(state.projectName, name, {
          character_sheet: characterSheet,
        });
      }
    }

    closeAllModals();
    await loadProject();
  } catch (error) {
    alert("保存失败: " + error.message);
  }
}

export async function deleteCharacter(name) {
  if (!confirm(`确定要删除人物 "${name}" 吗？`)) return;

  try {
    await API.deleteCharacter(state.projectName, name);
    await loadProject();
  } catch (error) {
    alert("删除失败: " + error.message);
  }
}

// 初始化参考图上传区域
export function initCharacterRefUpload() {
  const dropZone = document.getElementById("char-ref-drop");
  const input = document.getElementById("char-ref-input");
  const preview = document.getElementById("char-ref-preview");
  const placeholder = document.getElementById("char-ref-placeholder");

  if (!dropZone || !input) return;

  // 点击上传
  dropZone.addEventListener("click", () => input.click());

  // 文件选择
  input.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      showRefPreview(file);
    }
  });

  // 拖拽上传
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("border-blue-500");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("border-blue-500");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("border-blue-500");
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      // 设置到 input 以便后续读取
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      showRefPreview(file);
    }
  });

  function showRefPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.querySelector("img").src = e.target.result;
      preview.classList.remove("hidden");
      placeholder.classList.add("hidden");
    };
    reader.readAsDataURL(file);
  }
}
