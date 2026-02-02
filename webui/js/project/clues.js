import { state } from "./state.js";
import { loadProject } from "./actions_project.js";
import { closeAllModals } from "./ui.js";
import { initClueVersionControls, updateGenerateButton } from "./versions.js";

// ==================== 线索管理 ====================

export async function openClueModal(clueName = null) {
  const modal = document.getElementById("clue-modal");
  const form = document.getElementById("clue-form");
  const title = document.getElementById("clue-modal-title");

  form.reset();
  document.getElementById("clue-image-preview").classList.add("hidden");
  document.getElementById("clue-image-version-prompt").classList.add("hidden");

  let hasImage = false;

  if (clueName && state.currentProject.clues[clueName]) {
    const clue = state.currentProject.clues[clueName];
    title.textContent = "编辑线索";
    document.getElementById("clue-edit-mode").value = "edit";
    document.getElementById("clue-original-name").value = clueName;
    document.getElementById("clue-name").value = clueName;
    document.getElementById("clue-type").value = clue.type || "prop";
    document.getElementById("clue-importance").value = clue.importance || "major";
    document.getElementById("clue-description").value = clue.description || "";

    if (clue.clue_sheet) {
      const preview = document.getElementById("clue-image-preview");
      preview.querySelector("img").src = `${API.getFileUrl(state.projectName, clue.clue_sheet)}?t=${state.cacheBuster}`;
      preview.classList.remove("hidden");
      hasImage = true;
    }

    // 初始化版本控制
    await initClueVersionControls(clueName, hasImage);
  } else {
    title.textContent = "添加线索";
    document.getElementById("clue-edit-mode").value = "add";
    document.getElementById("clue-original-name").value = "";

    // 重置版本选择器
    document.getElementById("clue-image-version").innerHTML = '<option value="">无版本</option>';
    updateGenerateButton(document.getElementById("clue-generate-btn"), false);
    document.getElementById("clue-restore-btn").classList.add("hidden");
  }

  modal.classList.remove("hidden");
}

export function editClue(name) {
  void openClueModal(name);
}

export async function saveClue() {
  const mode = document.getElementById("clue-edit-mode").value;
  const originalName = document.getElementById("clue-original-name").value;
  const name = document.getElementById("clue-name").value.trim();
  const clueType = document.getElementById("clue-type").value;
  const importance = document.getElementById("clue-importance").value;
  const description = document.getElementById("clue-description").value.trim();
  const imageInput = document.getElementById("clue-image-input");

  if (!name || !description) {
    alert("请填写必填字段");
    return;
  }

  try {
    // 如果有新图片，先上传
    let clueSheet = null;
    if (imageInput.files.length > 0) {
      const result = await API.uploadFile(state.projectName, "clue", imageInput.files[0], name);
      clueSheet = result.path;
    }

    if (mode === "add") {
      await API.addClue(state.projectName, name, clueType, description, importance);
      if (clueSheet) {
        await API.updateClue(state.projectName, name, { clue_sheet: clueSheet });
      }
    } else {
      if (originalName !== name) {
        await API.deleteClue(state.projectName, originalName);
        await API.addClue(state.projectName, name, clueType, description, importance);
      } else {
        await API.updateClue(state.projectName, name, { clue_type: clueType, description, importance });
      }
      if (clueSheet) {
        await API.updateClue(state.projectName, name, { clue_sheet: clueSheet });
      }
    }

    closeAllModals();
    await loadProject();
  } catch (error) {
    alert("保存失败: " + error.message);
  }
}

export async function deleteClue(name) {
  if (!confirm(`确定要删除线索 "${name}" 吗？`)) return;

  try {
    await API.deleteClue(state.projectName, name);
    await loadProject();
  } catch (error) {
    alert("删除失败: " + error.message);
  }
}

