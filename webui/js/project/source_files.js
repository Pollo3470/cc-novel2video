import { state } from "./state.js";
import { closeAllModals } from "./ui.js";
import { tryAutoGenerateOverview } from "./overview.js";

// ==================== Source 文件管理 ====================

/**
 * 渲染源文件列表
 */
export async function renderSourceFiles() {
  const container = document.getElementById("source-files-list");
  try {
    const data = await API.listFiles(state.projectName);
    const files = data.files?.source || [];

    if (files.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-sm">暂无源文件，点击「新建」或「上传」添加</p>';
      return;
    }

    container.innerHTML = files
      .map(
        (file) => `
            <div class="flex items-center justify-between bg-gray-700 rounded-lg px-4 py-3">
                <div class="flex items-center space-x-3">
                    <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span class="text-white">${file.name}</span>
                    <span class="text-xs text-gray-500">${formatFileSize(file.size)}</span>
                </div>
                <div class="flex space-x-2">
                    <button onclick="editSourceFile('${file.name}')" class="px-3 py-1 text-blue-400 hover:text-blue-300 hover:bg-gray-600 rounded text-sm transition-colors">编辑</button>
                    <button onclick="deleteSourceFile('${file.name}')" class="px-3 py-1 text-red-400 hover:text-red-300 hover:bg-gray-600 rounded text-sm transition-colors">删除</button>
                </div>
            </div>
        `,
      )
      .join("");
  } catch (error) {
    container.innerHTML = '<p class="text-red-400 text-sm">加载失败: ' + error.message + "</p>";
  }
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * 新建源文件
 */
export function newSourceFile() {
  document.getElementById("source-modal-title").textContent = "新建源文件";
  document.getElementById("source-original-name").value = "";
  document.getElementById("source-filename").value = "";
  document.getElementById("source-filename").disabled = false;
  document.getElementById("source-content").value = "";
  document.getElementById("source-modal").classList.remove("hidden");
}

/**
 * 编辑源文件
 */
export async function editSourceFile(filename) {
  try {
    const content = await API.getSourceContent(state.projectName, filename);
    document.getElementById("source-modal-title").textContent = `编辑: ${filename}`;
    document.getElementById("source-original-name").value = filename;
    document.getElementById("source-filename").value = filename;
    document.getElementById("source-filename").disabled = true;
    document.getElementById("source-content").value = content;
    document.getElementById("source-modal").classList.remove("hidden");
  } catch (error) {
    alert("加载文件失败: " + error.message);
  }
}

/**
 * 保存源文件
 */
export async function saveSourceFile() {
  const filename = document.getElementById("source-filename").value.trim();
  const content = document.getElementById("source-content").value;

  if (!filename) {
    alert("请输入文件名");
    return;
  }

  // 确保文件名以 .txt 或 .md 结尾
  let finalFilename = filename;
  if (!filename.endsWith(".txt") && !filename.endsWith(".md")) {
    finalFilename = filename + ".txt";
  }

  try {
    await API.saveSourceFile(state.projectName, finalFilename, content);
    closeAllModals();
    await renderSourceFiles();
  } catch (error) {
    alert("保存失败: " + error.message);
  }
}

/**
 * 删除源文件
 */
export async function deleteSourceFile(filename) {
  if (!confirm(`确定要删除 "${filename}" 吗？`)) return;

  try {
    await API.deleteSourceFile(state.projectName, filename);
    await renderSourceFiles();
  } catch (error) {
    alert("删除失败: " + error.message);
  }
}

/**
 * 处理源文件上传
 */
export async function handleSourceUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    await API.uploadFile(state.projectName, "source", file);
    await renderSourceFiles();
    e.target.value = ""; // 重置 input

    // 上传成功后尝试自动生成概述
    await tryAutoGenerateOverview();
  } catch (error) {
    alert("上传失败: " + error.message);
  }
}

