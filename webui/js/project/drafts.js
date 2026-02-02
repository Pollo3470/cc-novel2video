import { state } from "./state.js";
import { loadProject } from "./actions_project.js";
import { closeAllModals } from "./ui.js";

// ==================== 草稿管理 ====================

/**
 * 切换草稿编辑/预览模式
 * @param {string} mode - 'edit' 或 'preview'
 */
export function toggleDraftMode(mode) {
  const textarea = document.getElementById("draft-content");
  const preview = document.getElementById("draft-preview");
  const editBtn = document.getElementById("draft-mode-edit");
  const previewBtn = document.getElementById("draft-mode-preview");

  if (mode === "edit") {
    textarea.classList.remove("hidden");
    preview.classList.add("hidden");
    editBtn.classList.remove("bg-gray-600", "text-gray-300");
    editBtn.classList.add("bg-blue-600", "text-white");
    previewBtn.classList.remove("bg-blue-600", "text-white");
    previewBtn.classList.add("bg-gray-600", "text-gray-300");
  } else {
    textarea.classList.add("hidden");
    preview.classList.remove("hidden");
    const md = window.marked;
    preview.innerHTML = md ? md.parse(textarea.value || "*无内容*") : textarea.value || "*无内容*";
    editBtn.classList.remove("bg-blue-600", "text-white");
    editBtn.classList.add("bg-gray-600", "text-gray-300");
    previewBtn.classList.remove("bg-gray-600", "text-gray-300");
    previewBtn.classList.add("bg-blue-600", "text-white");
  }
}

/**
 * 打开草稿编辑模态框
 * @param {number} episode - 剧集编号
 * @param {number} stepNum - 步骤编号 (1, 2, 3)
 * @param {boolean} exists - 草稿文件是否存在
 * @param {string} contentMode - 内容模式 ('narration' 或 'drama')
 */
export async function openDraftModal(episode, stepNum, exists, contentMode) {
  const modal = document.getElementById("draft-modal");
  // 根据 content_mode 选择不同的步骤名称
  const stepNames =
    contentMode === "narration"
      ? {
          1: "片段拆分",
          2: "宫格切分规划",
          3: "角色表/线索表",
        }
      : {
          1: "规范化剧本",
          2: "镜头预算表",
          3: "角色表/线索表",
        };

  document.getElementById("draft-modal-title").textContent = `Step ${stepNum}: ${stepNames[stepNum]} (第 ${episode} 集)`;
  document.getElementById("draft-episode").value = episode;
  document.getElementById("draft-step").value = stepNum;

  if (exists) {
    try {
      const content = await API.getDraftContent(state.projectName, episode, stepNum);
      document.getElementById("draft-content").value = content;
      // 有内容时默认显示预览模式
      if (content && content.trim()) {
        toggleDraftMode("preview");
      } else {
        toggleDraftMode("edit");
      }
    } catch (error) {
      document.getElementById("draft-content").value = "";
      toggleDraftMode("edit");
      console.error("加载草稿失败:", error);
    }
  } else {
    document.getElementById("draft-content").value = "";
    // 无内容时默认显示编辑模式
    toggleDraftMode("edit");
  }

  modal.classList.remove("hidden");
}

/**
 * 保存草稿
 */
export async function saveDraft() {
  const episode = document.getElementById("draft-episode").value;
  const stepNum = document.getElementById("draft-step").value;
  const content = document.getElementById("draft-content").value;

  try {
    await API.saveDraft(state.projectName, episode, stepNum, content);
    closeAllModals();
    await loadProject();
  } catch (error) {
    alert("保存失败: " + error.message);
  }
}

