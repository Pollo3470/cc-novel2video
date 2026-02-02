import { state } from "./state.js";
import { collectImagePrompt, collectVideoPrompt } from "./prompt_editors.js";

// ==================== 版本管理与生成功能 ====================

/**
 * 加载资源版本列表
 * @param {string} resourceType - 资源类型
 * @param {string} resourceId - 资源 ID
 */
async function loadVersions(resourceType, resourceId) {
  try {
    const data = await API.getVersions(state.projectName, resourceType, resourceId);
    state.currentVersions[resourceType][resourceId] = data;
    return data;
  } catch (error) {
    console.log(`加载版本失败: ${resourceType}/${resourceId}`, error);
    return { current_version: 0, versions: [] };
  }
}

/**
 * 渲染版本选择器
 * @param {HTMLSelectElement} selectEl - 选择器元素
 * @param {Array} versions - 版本列表
 * @param {number} currentVersion - 当前版本号
 */
function renderVersionSelector(selectEl, versions, currentVersion) {
  if (!versions || versions.length === 0) {
    selectEl.innerHTML = '<option value="">无版本</option>';
    return;
  }

  selectEl.innerHTML = versions
    .map((v) => {
      const date = new Date(v.created_at);
      const dateStr = `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
      const isCurrent = v.version === currentVersion;
      return `<option value="${v.version}" ${isCurrent ? "selected" : ""}>v${v.version} (${dateStr})${isCurrent ? " ✓当前" : ""}</option>`;
    })
    .join("");
}

/**
 * 更新生成按钮状态
 * @param {HTMLButtonElement} btn - 按钮元素
 * @param {boolean} hasImage - 是否已有图片/视频
 * @param {boolean} loading - 是否加载中
 */
export function updateGenerateButton(btn, hasImage, loading = false) {
  // 避免多次调用导致 className 不断累积 hover/bg 类
  btn.classList.remove(
    "bg-green-600",
    "bg-blue-600",
    "bg-gray-600",
    "hover:bg-green-700",
    "hover:bg-blue-700",
    "hover:bg-gray-700",
  );

  if (loading) {
    btn.disabled = true;
    btn.innerHTML =
      '<svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    btn.classList.add("bg-gray-600");
  } else {
    btn.disabled = false;
    if (hasImage) {
      btn.innerHTML = "<span>重新生成</span>";
      btn.classList.add("bg-blue-600", "hover:bg-blue-700");
    } else {
      btn.innerHTML = "<span>生成</span>";
      btn.classList.add("bg-green-600", "hover:bg-green-700");
    }
  }
}

/**
 * 显示/隐藏还原按钮
 */
function updateRestoreButton(restoreBtn, versionSelect, currentVersion) {
  const selectedVersion = parseInt(versionSelect.value);
  if (selectedVersion && selectedVersion !== currentVersion) {
    restoreBtn.classList.remove("hidden");
  } else {
    restoreBtn.classList.add("hidden");
  }
}

/**
 * Veo 视频生成仅支持 4/6/8 秒，其他值将被归一化到最近的可用值（向上取整，最大 8）
 */
function normalizeVeoDurationSeconds(value, fallback = 6) {
  const num = parseInt(value);
  if (!Number.isFinite(num)) return fallback;
  if (num <= 4) return 4;
  if (num <= 6) return 6;
  return 8;
}

// ==================== 片段模态框版本和生成 ====================

/**
 * 初始化片段模态框的版本和生成功能
 */
export async function initSegmentVersionControls(segmentId, scriptFile, hasStoryboard, hasVideo) {
  // 加载版本列表
  const storyboardVersions = await loadVersions("storyboards", segmentId);
  const videoVersions = await loadVersions("videos", segmentId);

  // 渲染分镜图版本选择器
  const storyboardSelect = document.getElementById("segment-storyboard-version");
  renderVersionSelector(storyboardSelect, storyboardVersions.versions, storyboardVersions.current_version);

  // 渲染视频版本选择器
  const videoSelect = document.getElementById("segment-video-version");
  renderVersionSelector(videoSelect, videoVersions.versions, videoVersions.current_version);

  // 更新生成按钮
  const storyboardBtn = document.getElementById("segment-generate-storyboard-btn");
  const videoBtn = document.getElementById("segment-generate-video-btn");
  updateGenerateButton(storyboardBtn, hasStoryboard);
  updateGenerateButton(videoBtn, hasVideo);

  // 版本选择器事件
  storyboardSelect.onchange = () => void handleSegmentVersionChange("storyboard", segmentId);
  videoSelect.onchange = () => void handleSegmentVersionChange("video", segmentId);

  // 生成按钮事件
  storyboardBtn.onclick = () => void generateSegmentStoryboard(segmentId, scriptFile);
  videoBtn.onclick = () => void generateSegmentVideo(segmentId, scriptFile);

  // 还原按钮事件
  document.getElementById("segment-restore-storyboard-btn").onclick = () => void restoreSegmentVersion("storyboards", segmentId);
  document.getElementById("segment-restore-video-btn").onclick = () => void restoreSegmentVersion("videos", segmentId);

  // 初始化还原按钮状态
  updateRestoreButton(document.getElementById("segment-restore-storyboard-btn"), storyboardSelect, storyboardVersions.current_version);
  updateRestoreButton(document.getElementById("segment-restore-video-btn"), videoSelect, videoVersions.current_version);
}

/**
 * 处理片段版本选择变更
 */
async function handleSegmentVersionChange(type, segmentId) {
  const resourceType = type === "storyboard" ? "storyboards" : "videos";
  const versionSelect = document.getElementById(`segment-${type}-version`);
  const restoreBtn = document.getElementById(`segment-restore-${type}-btn`);
  const promptEl = document.getElementById(`segment-${type}-version-prompt`);
  const previewContainer = document.getElementById(`segment-${type === "storyboard" ? "storyboard" : "video"}`);

  const selectedVersion = parseInt(versionSelect.value);
  const versionData = state.currentVersions[resourceType][segmentId];

  if (!selectedVersion || !versionData) {
    promptEl.classList.add("hidden");
    return;
  }

  // 找到选中的版本
  const version = versionData.versions.find((v) => v.version === selectedVersion);
  if (version) {
    // 显示版本 prompt
    promptEl.textContent = `版本 prompt: ${version.prompt?.substring(0, 100) || ""}...`;
    promptEl.classList.remove("hidden");

    // 更新预览图
    if (type === "storyboard") {
      const url = `${API.getFileUrl(state.projectName, version.file)}?t=${Date.now()}`;
      previewContainer.innerHTML = `
                <div class="relative group w-full h-full">
                    <img src="${url}" class="w-full h-full object-cover cursor-pointer" onclick="openLightbox('${url}', '分镜图 v${selectedVersion}')">
                </div>`;
    } else {
      const url = `${API.getFileUrl(state.projectName, version.file)}?t=${Date.now()}`;
      previewContainer.innerHTML = `<video src="${url}" controls class="w-full h-full"></video>`;
    }
  }

  // 更新还原按钮
  updateRestoreButton(restoreBtn, versionSelect, versionData.current_version);
}

/**
 * 生成片段分镜图
 */
async function generateSegmentStoryboard(segmentId, scriptFile) {
  const promptResult = collectImagePrompt("segment");
  if (!promptResult.ok) {
    alert(`分镜图 Prompt 格式错误: ${promptResult.error}`);
    return;
  }
  const prompt = promptResult.value;

  const btn = document.getElementById("segment-generate-storyboard-btn");
  const loadingEl = document.getElementById("segment-storyboard-loading");
  const hadStoryboard = !!document.getElementById("segment-storyboard").querySelector("img");
  let succeeded = false;

  try {
    updateGenerateButton(btn, hadStoryboard, true);
    loadingEl.classList.remove("hidden");

    const result = await API.generateStoryboard(state.projectName, segmentId, prompt, scriptFile);
    succeeded = true;

    // 刷新预览和版本列表
    state.cacheBuster = Date.now();
    await initSegmentVersionControls(
      segmentId,
      scriptFile,
      true,
      !!state.currentEditingSegment?.segment?.generated_assets?.video_clip,
    );

    // 更新预览
    const storyboardUrl = `${API.getFileUrl(state.projectName, result.file_path)}?t=${state.cacheBuster}`;
    document.getElementById("segment-storyboard").innerHTML = `
            <div class="relative group w-full h-full">
                <img src="${storyboardUrl}" class="w-full h-full object-cover cursor-pointer" onclick="openLightbox('${storyboardUrl}', '分镜图 ${segmentId}')">
            </div>`;

    alert(`分镜图生成成功！版本: v${result.version}`);
  } catch (error) {
    alert("生成失败: " + error.message);
  } finally {
    updateGenerateButton(btn, succeeded || hadStoryboard, false);
    loadingEl.classList.add("hidden");
  }
}

/**
 * 生成片段视频
 */
async function generateSegmentVideo(segmentId, scriptFile) {
  const promptResult = collectVideoPrompt("segment");
  if (!promptResult.ok) {
    alert(`视频 Prompt 格式错误: ${promptResult.error}`);
    return;
  }
  const prompt = promptResult.value;

  const duration = parseInt(document.getElementById("segment-duration").value) || 4;
  const btn = document.getElementById("segment-generate-video-btn");
  const loadingEl = document.getElementById("segment-video-loading");
  const hadVideo = !!document.getElementById("segment-video").querySelector("video");
  let succeeded = false;

  try {
    updateGenerateButton(btn, hadVideo, true);
    loadingEl.classList.remove("hidden");

    const result = await API.generateVideo(state.projectName, segmentId, prompt, scriptFile, duration);
    succeeded = true;

    // 刷新版本列表
    state.cacheBuster = Date.now();
    await initSegmentVersionControls(segmentId, scriptFile, true, true);

    // 更新预览
    const videoUrl = `${API.getFileUrl(state.projectName, result.file_path)}?t=${state.cacheBuster}`;
    document.getElementById("segment-video").innerHTML = `<video src="${videoUrl}" controls class="w-full h-full"></video>`;

    alert(`视频生成成功！版本: v${result.version}`);
  } catch (error) {
    alert("生成失败: " + error.message);
  } finally {
    updateGenerateButton(btn, succeeded || hadVideo, false);
    loadingEl.classList.add("hidden");
  }
}

/**
 * 还原片段版本
 */
async function restoreSegmentVersion(resourceType, segmentId) {
  const type = resourceType === "storyboards" ? "storyboard" : "video";
  const versionSelect = document.getElementById(`segment-${type}-version`);
  const selectedVersion = parseInt(versionSelect.value);

  if (!selectedVersion) return;
  if (!confirm(`确定要还原到 v${selectedVersion} 吗？`)) return;

  try {
    await API.restoreVersion(state.projectName, resourceType, segmentId, selectedVersion);

    // 刷新
    state.cacheBuster = Date.now();
    const scriptFile = document.getElementById("segment-script-file").value;
    await initSegmentVersionControls(segmentId, scriptFile, true, true);

    alert(`已还原到 v${selectedVersion}`);
  } catch (error) {
    alert("还原失败: " + error.message);
  }
}

// ==================== 场景模态框版本和生成（类似片段） ====================

export async function initSceneVersionControls(sceneId, scriptFile, hasStoryboard, hasVideo) {
  const storyboardVersions = await loadVersions("storyboards", sceneId);
  const videoVersions = await loadVersions("videos", sceneId);

  renderVersionSelector(document.getElementById("scene-storyboard-version"), storyboardVersions.versions, storyboardVersions.current_version);
  renderVersionSelector(document.getElementById("scene-video-version"), videoVersions.versions, videoVersions.current_version);

  const storyboardBtn = document.getElementById("scene-generate-storyboard-btn");
  const videoBtn = document.getElementById("scene-generate-video-btn");
  updateGenerateButton(storyboardBtn, hasStoryboard);
  updateGenerateButton(videoBtn, hasVideo);

  document.getElementById("scene-storyboard-version").onchange = () => void handleSceneVersionChange("storyboard", sceneId);
  document.getElementById("scene-video-version").onchange = () => void handleSceneVersionChange("video", sceneId);

  storyboardBtn.onclick = () => void generateSceneStoryboard(sceneId, scriptFile);
  videoBtn.onclick = () => void generateSceneVideo(sceneId, scriptFile);

  document.getElementById("scene-restore-storyboard-btn").onclick = () => void restoreSceneVersion("storyboards", sceneId);
  document.getElementById("scene-restore-video-btn").onclick = () => void restoreSceneVersion("videos", sceneId);

  updateRestoreButton(
    document.getElementById("scene-restore-storyboard-btn"),
    document.getElementById("scene-storyboard-version"),
    storyboardVersions.current_version,
  );
  updateRestoreButton(document.getElementById("scene-restore-video-btn"), document.getElementById("scene-video-version"), videoVersions.current_version);
}

async function handleSceneVersionChange(type, sceneId) {
  const resourceType = type === "storyboard" ? "storyboards" : "videos";
  const versionSelect = document.getElementById(`scene-${type}-version`);
  const restoreBtn = document.getElementById(`scene-restore-${type}-btn`);
  const promptEl = document.getElementById(`scene-${type}-version-prompt`);
  const previewContainer = document.getElementById(`scene-${type === "storyboard" ? "storyboard" : "video"}`);

  const selectedVersion = parseInt(versionSelect.value);
  const versionData = state.currentVersions[resourceType][sceneId];

  if (!selectedVersion || !versionData) {
    promptEl.classList.add("hidden");
    return;
  }

  const version = versionData.versions.find((v) => v.version === selectedVersion);
  if (version) {
    promptEl.textContent = `版本 prompt: ${version.prompt?.substring(0, 100) || ""}...`;
    promptEl.classList.remove("hidden");

    if (type === "storyboard") {
      const url = `${API.getFileUrl(state.projectName, version.file)}?t=${Date.now()}`;
      previewContainer.innerHTML = `<div class="relative group w-full h-full"><img src="${url}" class="w-full h-full object-contain cursor-pointer" onclick="openLightbox('${url}', '分镜图 v${selectedVersion}')"></div>`;
    } else {
      const url = `${API.getFileUrl(state.projectName, version.file)}?t=${Date.now()}`;
      previewContainer.innerHTML = `<video src="${url}" controls class="w-full h-full"></video>`;
    }
  }

  updateRestoreButton(restoreBtn, versionSelect, versionData.current_version);
}

async function generateSceneStoryboard(sceneId, scriptFile) {
  const promptResult = collectImagePrompt("scene");
  if (!promptResult.ok) {
    alert(`分镜图 Prompt 格式错误: ${promptResult.error}`);
    return;
  }
  const prompt = promptResult.value;

  const btn = document.getElementById("scene-generate-storyboard-btn");
  const loadingEl = document.getElementById("scene-storyboard-loading");
  const hadStoryboard = !!document.getElementById("scene-storyboard").querySelector("img");
  let succeeded = false;

  try {
    updateGenerateButton(btn, hadStoryboard, true);
    loadingEl.classList.remove("hidden");
    const result = await API.generateStoryboard(state.projectName, sceneId, prompt, scriptFile);
    succeeded = true;
    state.cacheBuster = Date.now();
    await initSceneVersionControls(sceneId, scriptFile, true, !!document.getElementById("scene-video").querySelector("video"));
    const url = `${API.getFileUrl(state.projectName, result.file_path)}?t=${state.cacheBuster}`;
    document.getElementById("scene-storyboard").innerHTML = `<div class="relative group w-full h-full"><img src="${url}" class="w-full h-full object-contain cursor-pointer" onclick="openLightbox('${url}', '分镜图 ${sceneId}')"></div>`;
    alert(`分镜图生成成功！版本: v${result.version}`);
  } catch (error) {
    alert("生成失败: " + error.message);
  } finally {
    updateGenerateButton(btn, succeeded || hadStoryboard, false);
    loadingEl.classList.add("hidden");
  }
}

async function generateSceneVideo(sceneId, scriptFile) {
  const promptResult = collectVideoPrompt("scene");
  if (!promptResult.ok) {
    alert(`视频 Prompt 格式错误: ${promptResult.error}`);
    return;
  }
  const prompt = promptResult.value;

  const durationInput = document.getElementById("scene-duration");
  const duration = normalizeVeoDurationSeconds(durationInput.value, 6);
  durationInput.value = String(duration);
  const btn = document.getElementById("scene-generate-video-btn");
  const loadingEl = document.getElementById("scene-video-loading");
  const hadVideo = !!document.getElementById("scene-video").querySelector("video");
  let succeeded = false;

  try {
    updateGenerateButton(btn, hadVideo, true);
    loadingEl.classList.remove("hidden");
    const result = await API.generateVideo(state.projectName, sceneId, prompt, scriptFile, duration);
    succeeded = true;
    state.cacheBuster = Date.now();
    await initSceneVersionControls(sceneId, scriptFile, true, true);
    const url = `${API.getFileUrl(state.projectName, result.file_path)}?t=${state.cacheBuster}`;
    document.getElementById("scene-video").innerHTML = `<video src="${url}" controls class="w-full h-full"></video>`;
    alert(`视频生成成功！版本: v${result.version}`);
  } catch (error) {
    alert("生成失败: " + error.message);
  } finally {
    updateGenerateButton(btn, succeeded || hadVideo, false);
    loadingEl.classList.add("hidden");
  }
}

async function restoreSceneVersion(resourceType, sceneId) {
  const type = resourceType === "storyboards" ? "storyboard" : "video";
  const versionSelect = document.getElementById(`scene-${type}-version`);
  const selectedVersion = parseInt(versionSelect.value);
  if (!selectedVersion) return;
  if (!confirm(`确定要还原到 v${selectedVersion} 吗？`)) return;

  try {
    await API.restoreVersion(state.projectName, resourceType, sceneId, selectedVersion);
    state.cacheBuster = Date.now();
    const scriptFile = document.getElementById("scene-script-file").value;
    await initSceneVersionControls(sceneId, scriptFile, true, true);
    alert(`已还原到 v${selectedVersion}`);
  } catch (error) {
    alert("还原失败: " + error.message);
  }
}

// ==================== 人物设计图版本和生成 ====================

export async function initCharacterVersionControls(charName, hasImage) {
  const versions = await loadVersions("characters", charName);
  renderVersionSelector(document.getElementById("char-image-version"), versions.versions, versions.current_version);

  const btn = document.getElementById("char-generate-btn");
  updateGenerateButton(btn, hasImage);

  document.getElementById("char-image-version").onchange = () => void handleCharacterVersionChange(charName);
  btn.onclick = () => void generateCharacterImage(charName);
  document.getElementById("char-restore-btn").onclick = () => void restoreCharacterVersion(charName);

  updateRestoreButton(document.getElementById("char-restore-btn"), document.getElementById("char-image-version"), versions.current_version);
}

async function handleCharacterVersionChange(charName) {
  const versionSelect = document.getElementById("char-image-version");
  const restoreBtn = document.getElementById("char-restore-btn");
  const promptEl = document.getElementById("char-image-version-prompt");
  const previewEl = document.getElementById("char-image-preview");

  const selectedVersion = parseInt(versionSelect.value);
  const versionData = state.currentVersions.characters[charName];

  if (!selectedVersion || !versionData) {
    promptEl.classList.add("hidden");
    return;
  }

  const version = versionData.versions.find((v) => v.version === selectedVersion);
  if (version) {
    promptEl.textContent = `版本 prompt: ${version.prompt?.substring(0, 80) || ""}...`;
    promptEl.classList.remove("hidden");

    const url = `${API.getFileUrl(state.projectName, version.file)}?t=${Date.now()}`;
    previewEl.querySelector("img").src = url;
    previewEl.classList.remove("hidden");
  }

  updateRestoreButton(restoreBtn, versionSelect, versionData.current_version);
}

async function generateCharacterImage(charName) {
  const prompt = document.getElementById("char-description").value;
  if (!prompt.trim()) {
    alert("请输入人物描述");
    return;
  }

  const btn = document.getElementById("char-generate-btn");
  const loadingEl = document.getElementById("char-image-loading");
  const hadImage = !document.getElementById("char-image-preview").classList.contains("hidden");
  let succeeded = false;

  try {
    updateGenerateButton(btn, hadImage, true);
    loadingEl.classList.remove("hidden");
    const result = await API.generateCharacter(state.projectName, charName, prompt);
    succeeded = true;
    state.cacheBuster = Date.now();
    await initCharacterVersionControls(charName, true);
    const url = `${API.getFileUrl(state.projectName, result.file_path)}?t=${state.cacheBuster}`;
    const previewEl = document.getElementById("char-image-preview");
    previewEl.querySelector("img").src = url;
    previewEl.classList.remove("hidden");
    alert(`人物设计图生成成功！版本: v${result.version}`);
  } catch (error) {
    alert("生成失败: " + error.message);
  } finally {
    updateGenerateButton(btn, succeeded || hadImage, false);
    loadingEl.classList.add("hidden");
  }
}

async function restoreCharacterVersion(charName) {
  const versionSelect = document.getElementById("char-image-version");
  const selectedVersion = parseInt(versionSelect.value);
  if (!selectedVersion) return;
  if (!confirm(`确定要还原到 v${selectedVersion} 吗？`)) return;

  try {
    const result = await API.restoreVersion(state.projectName, "characters", charName, selectedVersion);
    document.getElementById("char-description").value = result.prompt || "";
    state.cacheBuster = Date.now();
    await initCharacterVersionControls(charName, true);
    alert(`已还原到 v${selectedVersion}`);
  } catch (error) {
    alert("还原失败: " + error.message);
  }
}

// ==================== 线索设计图版本和生成 ====================

export async function initClueVersionControls(clueName, hasImage) {
  const versions = await loadVersions("clues", clueName);
  renderVersionSelector(document.getElementById("clue-image-version"), versions.versions, versions.current_version);

  const btn = document.getElementById("clue-generate-btn");
  updateGenerateButton(btn, hasImage);

  document.getElementById("clue-image-version").onchange = () => void handleClueVersionChange(clueName);
  btn.onclick = () => void generateClueImage(clueName);
  document.getElementById("clue-restore-btn").onclick = () => void restoreClueVersion(clueName);

  updateRestoreButton(document.getElementById("clue-restore-btn"), document.getElementById("clue-image-version"), versions.current_version);
}

async function handleClueVersionChange(clueName) {
  const versionSelect = document.getElementById("clue-image-version");
  const restoreBtn = document.getElementById("clue-restore-btn");
  const promptEl = document.getElementById("clue-image-version-prompt");
  const previewEl = document.getElementById("clue-image-preview");

  const selectedVersion = parseInt(versionSelect.value);
  const versionData = state.currentVersions.clues[clueName];

  if (!selectedVersion || !versionData) {
    promptEl.classList.add("hidden");
    return;
  }

  const version = versionData.versions.find((v) => v.version === selectedVersion);
  if (version) {
    promptEl.textContent = `版本 prompt: ${version.prompt?.substring(0, 80) || ""}...`;
    promptEl.classList.remove("hidden");

    const url = `${API.getFileUrl(state.projectName, version.file)}?t=${Date.now()}`;
    previewEl.querySelector("img").src = url;
    previewEl.classList.remove("hidden");
  }

  updateRestoreButton(restoreBtn, versionSelect, versionData.current_version);
}

async function generateClueImage(clueName) {
  const prompt = document.getElementById("clue-description").value;
  if (!prompt.trim()) {
    alert("请输入线索描述");
    return;
  }

  const btn = document.getElementById("clue-generate-btn");
  const loadingEl = document.getElementById("clue-image-loading");
  const hadImage = !document.getElementById("clue-image-preview").classList.contains("hidden");
  let succeeded = false;

  try {
    updateGenerateButton(btn, hadImage, true);
    loadingEl.classList.remove("hidden");
    const result = await API.generateClue(state.projectName, clueName, prompt);
    succeeded = true;
    state.cacheBuster = Date.now();
    await initClueVersionControls(clueName, true);
    const url = `${API.getFileUrl(state.projectName, result.file_path)}?t=${state.cacheBuster}`;
    const previewEl = document.getElementById("clue-image-preview");
    previewEl.querySelector("img").src = url;
    previewEl.classList.remove("hidden");
    alert(`线索设计图生成成功！版本: v${result.version}`);
  } catch (error) {
    alert("生成失败: " + error.message);
  } finally {
    updateGenerateButton(btn, succeeded || hadImage, false);
    loadingEl.classList.add("hidden");
  }
}

async function restoreClueVersion(clueName) {
  const versionSelect = document.getElementById("clue-image-version");
  const selectedVersion = parseInt(versionSelect.value);
  if (!selectedVersion) return;
  if (!confirm(`确定要还原到 v${selectedVersion} 吗？`)) return;

  try {
    const result = await API.restoreVersion(state.projectName, "clues", clueName, selectedVersion);
    document.getElementById("clue-description").value = result.prompt || "";
    state.cacheBuster = Date.now();
    await initClueVersionControls(clueName, true);
    alert(`已还原到 v${selectedVersion}`);
  } catch (error) {
    alert("还原失败: " + error.message);
  }
}

