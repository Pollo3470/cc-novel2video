import { state } from "./state.js";
import { renderOverviewSection } from "./render.js";

/**
 * 保存项目概述（手动编辑）
 */
export async function saveOverview() {
  try {
    const updates = {
      synopsis: document.getElementById("edit-synopsis").value.trim(),
      genre: document.getElementById("edit-genre").value.trim(),
      theme: document.getElementById("edit-theme").value.trim(),
      world_setting: document.getElementById("edit-world-setting").value.trim(),
    };

    await API.updateOverview(state.projectName, updates);

    // 更新本地数据
    if (!state.currentProject.overview) {
      state.currentProject.overview = {};
    }
    Object.assign(state.currentProject.overview, updates);

    alert("概述已保存");
  } catch (error) {
    alert("保存失败: " + error.message);
  }
}

/**
 * 重新生成项目概述
 */
export async function regenerateOverview() {
  if (!confirm("确定要重新生成项目概述吗？这将覆盖当前内容。")) {
    return;
  }

  const btn = document.getElementById("regenerate-overview-btn");
  const originalContent = btn.innerHTML;

  try {
    // 显示加载状态
    btn.disabled = true;
    btn.innerHTML = `
            <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>生成中...</span>
        `;

    const result = await API.generateOverview(state.projectName);

    // 更新本地数据
    state.currentProject.overview = result.overview;

    // 重新渲染
    renderOverviewSection();

    alert("概述已重新生成");
  } catch (error) {
    alert("生成失败: " + error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalContent;
  }
}

/**
 * 上传源文件后自动生成概述（如果概述为空）
 */
export async function tryAutoGenerateOverview() {
  // 检查是否已有概述
  const overview = state.currentProject?.overview || {};
  const hasOverview = overview.synopsis || overview.genre || overview.theme || overview.world_setting;

  if (hasOverview) {
    return; // 已有概述，不自动生成
  }

  // 检查是否有源文件
  try {
    const data = await API.listFiles(state.projectName);
    const sourceFiles = data.files?.source || [];

    if (sourceFiles.length === 0) {
      return; // 没有源文件
    }

    // 自动生成概述
    console.log("检测到源文件，自动生成项目概述...");

    const btn = document.getElementById("regenerate-overview-btn");
    const originalContent = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = `
            <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>自动生成中...</span>
        `;

    const result = await API.generateOverview(state.projectName);
    state.currentProject.overview = result.overview;
    renderOverviewSection();

    btn.disabled = false;
    btn.innerHTML = originalContent;

    console.log("项目概述已自动生成");
  } catch (error) {
    console.error("自动生成概述失败:", error);
  }
}

