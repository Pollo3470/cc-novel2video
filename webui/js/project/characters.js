import { state } from "./state.js";
import { loadProject } from "./actions_project.js";
import { closeAllModals } from "./ui.js";
import { initCharacterVersionControls, updateGenerateButton } from "./versions.js";

// ==================== 人物管理 ====================

export async function openCharacterModal(charName = null) {
  const modal = document.getElementById("character-modal");
  const form = document.getElementById("character-form");
  const title = document.getElementById("character-modal-title");

  form.reset();
  document.getElementById("char-image-preview").classList.add("hidden");
  document.getElementById("char-image-version-prompt").classList.add("hidden");

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
      preview.querySelector("img").src = `${API.getFileUrl(state.projectName, char.character_sheet)}?t=${state.cacheBuster}`;
      preview.classList.remove("hidden");
      hasImage = true;
    }

    // 初始化版本控制
    await initCharacterVersionControls(charName, hasImage);
  } else {
    title.textContent = "添加人物";
    document.getElementById("char-edit-mode").value = "add";
    document.getElementById("char-original-name").value = "";

    // 重置版本选择器
    document.getElementById("char-image-version").innerHTML = '<option value="">无版本</option>';
    updateGenerateButton(document.getElementById("char-generate-btn"), false);
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

  if (!name || !description) {
    alert("请填写必填字段");
    return;
  }

  try {
    // 如果有新图片，先上传
    let characterSheet = null;
    if (imageInput.files.length > 0) {
      const result = await API.uploadFile(state.projectName, "character", imageInput.files[0], name);
      characterSheet = result.path;
    }

    if (mode === "add") {
      await API.addCharacter(state.projectName, name, description, voiceStyle);
      if (characterSheet) {
        await API.updateCharacter(state.projectName, name, { character_sheet: characterSheet });
      }
    } else {
      // 编辑模式
      if (originalName !== name) {
        // 名称变更，需要先删除旧的再添加新的
        await API.deleteCharacter(state.projectName, originalName);
        await API.addCharacter(state.projectName, name, description, voiceStyle);
      } else {
        await API.updateCharacter(state.projectName, name, { description, voice_style: voiceStyle });
      }
      if (characterSheet) {
        await API.updateCharacter(state.projectName, name, { character_sheet: characterSheet });
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

