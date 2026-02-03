import { state } from "./state.js";
import { renderCharacters, renderClues, renderEpisodes, renderOverview, renderProjectHeader, updateCounts } from "./render.js";
import { renderSourceFiles } from "./source_files.js";
import { loadUsageStats } from "./usage.js";

/**
 * 加载项目数据
 */
export async function loadProject() {
  state.cacheBuster = Date.now(); // 更新缓存标记
  const loading = document.getElementById("loading");

  try {
    loading.classList.remove("hidden");

    const data = await API.getProject(state.projectName);
    state.currentProject = data.project;
    state.currentScripts = data.scripts || {};

    // 加载草稿数据
    try {
      const draftsData = await API.listDrafts(state.projectName);
      state.currentDrafts = draftsData.drafts || {};
    } catch (e) {
      console.log("No drafts found:", e);
      state.currentDrafts = {};
    }

    renderProjectHeader();
    renderOverview();
    renderCharacters();
    renderClues();
    renderEpisodes();
    void renderSourceFiles();
    void loadUsageStats();
    updateCounts();
  } catch (error) {
    console.error("加载项目失败:", error);
    alert("加载项目失败: " + error.message);
    window.location.href = "/";
  } finally {
    loading.classList.add("hidden");
  }
}

/**
 * 保存项目信息
 */
export async function saveProjectInfo() {
  try {
    const contentModeSelect = document.getElementById("edit-content-mode");
    const updates = {
      title: document.getElementById("edit-title").value.trim(),
      style: document.getElementById("edit-style").value.trim(),
      content_mode: contentModeSelect ? contentModeSelect.value : "narration",
    };

    await API.updateProject(state.projectName, updates);
    state.currentProject.title = updates.title;
    state.currentProject.style = updates.style;
    state.currentProject.content_mode = updates.content_mode;
    renderProjectHeader();
    alert("保存成功");
  } catch (error) {
    alert("保存失败: " + error.message);
  }
}

/**
 * 删除项目
 */
export async function deleteProject() {
  if (!confirm(`确定要删除项目 "${state.currentProject.title}" 吗？此操作不可恢复！`)) {
    return;
  }

  try {
    await API.deleteProject(state.projectName);
    alert("项目已删除");
    window.location.href = "/";
  } catch (error) {
    alert("删除失败: " + error.message);
  }
}

