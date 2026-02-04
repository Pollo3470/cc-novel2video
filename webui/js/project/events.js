import { deleteProject, loadProject, saveProjectInfo } from "./actions_project.js";
import { openCharacterModal, saveCharacter } from "./characters.js";
import { openClueModal, saveClue } from "./clues.js";
import { saveDraft, toggleDraftMode } from "./drafts.js";
import { initPromptEditors } from "./prompt_editors.js";
import { regenerateOverview, saveOverview } from "./overview.js";
import { saveScene, saveSegment } from "./scenes_segments.js";
import { handleSourceUpload, newSourceFile, saveSourceFile } from "./source_files.js";
import { closeAllModals, closeLightbox, setupImageUpload } from "./ui.js";
import { setupStyleImageEvents } from "./style_image.js";

/**
 * 切换剧集展开/折叠
 */
export function toggleEpisode(header) {
  const content = header.nextElementSibling;
  const arrow = header.querySelector(".episode-arrow");
  content.classList.toggle("hidden");
  arrow.classList.toggle("rotate-180");
}

/**
 * 设置事件监听
 */
export function setupEventListeners() {
  // Tab 切换
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  // 刷新按钮
  document.getElementById("refresh-btn").onclick = () => void loadProject();

  // 删除项目
  document.getElementById("delete-btn").onclick = () => void deleteProject();

  // 项目信息表单
  document.getElementById("project-info-form").onsubmit = async (e) => {
    e.preventDefault();
    await saveProjectInfo();
  };

  // 故事概述表单
  document.getElementById("overview-form").onsubmit = async (e) => {
    e.preventDefault();
    await saveOverview();
  };

  // 重新生成概述按钮
  document.getElementById("regenerate-overview-btn").onclick = () => void regenerateOverview();

  // 人物模态框
  document.getElementById("add-character-btn").onclick = () => void openCharacterModal();
  document.getElementById("character-form").onsubmit = (e) => {
    e.preventDefault();
    void saveCharacter();
  };

  // 线索模态框
  document.getElementById("add-clue-btn").onclick = () => void openClueModal();
  document.getElementById("clue-form").onsubmit = (e) => {
    e.preventDefault();
    void saveClue();
  };

  // 场景模态框
  document.getElementById("scene-form").onsubmit = (e) => {
    e.preventDefault();
    void saveScene();
  };

  // 片段模态框（说书模式）
  document.getElementById("segment-form").onsubmit = (e) => {
    e.preventDefault();
    void saveSegment();
  };

  // 关闭模态框
  document.querySelectorAll(".close-modal").forEach((btn) => {
    btn.onclick = closeAllModals;
  });

  // 点击背景关闭模态框
  ["character-modal", "clue-modal", "scene-modal", "segment-modal", "source-modal", "draft-modal"].forEach((id) => {
    document.getElementById(id).onclick = (e) => {
      if (e.target.id === id) closeAllModals();
    };
  });

  // Lightbox 关闭事件
  document.getElementById("image-lightbox").onclick = (e) => {
    if (e.target.id === "image-lightbox") closeLightbox();
  };
  document.getElementById("lightbox-close-btn").onclick = closeLightbox;

  // ESC 键关闭模态框
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllModals();
      closeLightbox();
    }
  });

  // 图片上传
  setupImageUpload("char-image-drop", "char-image-input", "char-image-preview");
  setupImageUpload("clue-image-drop", "clue-image-input", "clue-image-preview");

  // Source 文件管理
  document.getElementById("new-source-btn").onclick = newSourceFile;
  document.getElementById("source-upload-input").onchange = (e) => void handleSourceUpload(e);
  document.getElementById("source-form").onsubmit = (e) => {
    e.preventDefault();
    void saveSourceFile();
  };

  // 草稿模态框
  document.getElementById("draft-form").onsubmit = (e) => {
    e.preventDefault();
    void saveDraft();
  };

  // 草稿编辑/预览模式切换
  document.getElementById("draft-mode-edit").onclick = () => toggleDraftMode("edit");
  document.getElementById("draft-mode-preview").onclick = () => toggleDraftMode("preview");

  // Prompt 编辑器初始化（枚举选项/对白按钮）
  initPromptEditors();

  // 风格参考图事件
  setupStyleImageEvents();
}

/**
 * 切换 Tab
 */
export function switchTab(tabName) {
  // 更新按钮样式
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    if (btn.dataset.tab === tabName) {
      btn.className = "tab-btn w-full flex items-center space-x-3 px-4 py-3 rounded-lg bg-blue-600 text-white";
    } else {
      btn.className =
        "tab-btn w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white";
    }
  });

  // 显示对应内容
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.add("hidden");
  });
  document.getElementById(`tab-${tabName}`).classList.remove("hidden");
}

