import { state } from "./state.js";
import { loadProject } from "./actions_project.js";
import { closeAllModals } from "./ui.js";
import { collectImagePrompt, collectVideoPrompt, setImagePromptEditor, setVideoPromptEditor } from "./prompt_editors.js";
import { initSceneVersionControls, initSegmentVersionControls, updateGenerateButton } from "./versions.js";

// ==================== 场景管理 ====================

/**
 * 编辑片段（说书模式）
 */
export async function editSegment(segmentId, scriptFile) {
  const script = state.currentScripts[scriptFile];
  if (!script) return;

  const segment = script.segments?.find((s) => s.segment_id === segmentId);
  if (!segment) return;

  state.currentEditingSegment = { segmentId, scriptFile, segment };

  const modal = document.getElementById("segment-modal");
  document.getElementById("segment-modal-id").textContent = segmentId;
  document.getElementById("segment-id").value = segmentId;
  document.getElementById("segment-script-file").value = scriptFile;

  // 填充表单
  document.getElementById("segment-novel-text").textContent = segment.novel_text || "（无原文）";
  document.getElementById("segment-duration").value = segment.duration_seconds || 4;
  setImagePromptEditor("segment", segment.image_prompt);
  setVideoPromptEditor("segment", segment.video_prompt);
  document.getElementById("segment-break").value = segment.segment_break ? "true" : "false";

  // 显示分镜图预览
  const assets = segment.generated_assets || {};
  const storyboardContainer = document.getElementById("segment-storyboard");
  const hasStoryboard = !!assets.storyboard_image;
  const storyboardLoading = document.getElementById("segment-storyboard-loading");
  const videoLoading = document.getElementById("segment-video-loading");

  storyboardLoading?.classList.add("hidden");
  videoLoading?.classList.add("hidden");

  if (hasStoryboard) {
    const storyboardUrl = `${API.getFileUrl(state.projectName, assets.storyboard_image)}?t=${state.cacheBuster}`;
    storyboardContainer.innerHTML = `
            <div class="relative group w-full h-full">
                <img src="${storyboardUrl}" class="w-full h-full object-cover cursor-pointer" onclick="openLightbox('${storyboardUrl}', '分镜图 ${segmentId}')">
                <button onclick="openLightbox('${storyboardUrl}', '分镜图 ${segmentId}')"
                        class="absolute top-2 right-2 p-1.5 bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-opacity-70"
                        title="放大查看">
                    <svg class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                </button>
            </div>`;
  } else {
    storyboardContainer.innerHTML = '<span class="text-gray-500">暂无分镜图</span>';
  }

  // 显示视频预览
  const videoContainer = document.getElementById("segment-video");
  const hasVideo = !!assets.video_clip;
  updateGenerateButton(document.getElementById("segment-generate-storyboard-btn"), hasStoryboard, false);
  updateGenerateButton(document.getElementById("segment-generate-video-btn"), hasVideo, false);
  if (hasVideo) {
    videoContainer.innerHTML = `<video src="${API.getFileUrl(state.projectName, assets.video_clip)}?t=${state.cacheBuster}" controls class="w-full h-full"></video>`;
  } else {
    videoContainer.innerHTML = '<span class="text-gray-500">暂无视频</span>';
  }

  modal.classList.remove("hidden");

  // 初始化版本控制
  await initSegmentVersionControls(segmentId, scriptFile, hasStoryboard, hasVideo);
}

/**
 * 保存片段
 */
export async function saveSegment() {
  const segmentId = document.getElementById("segment-id").value;
  const scriptFile = document.getElementById("segment-script-file").value;

  const imagePromptResult = collectImagePrompt("segment");
  if (!imagePromptResult.ok) {
    alert(`分镜图 Prompt 格式错误: ${imagePromptResult.error}`);
    return;
  }

  const videoPromptResult = collectVideoPrompt("segment");
  if (!videoPromptResult.ok) {
    alert(`视频 Prompt 格式错误: ${videoPromptResult.error}`);
    return;
  }

  const updates = {
    script_file: scriptFile,
    duration_seconds: parseInt(document.getElementById("segment-duration").value) || 4,
    segment_break: document.getElementById("segment-break").value === "true",
    image_prompt: imagePromptResult.value,
    video_prompt: videoPromptResult.value,
  };

  try {
    await API.updateSegment(state.projectName, segmentId, updates);
    closeAllModals();
    state.currentEditingSegment = null;
    await loadProject();
  } catch (error) {
    alert("保存失败: " + error.message);
  }
}

export async function editScene(sceneId, scriptFile) {
  const script = state.currentScripts[scriptFile];
  if (!script) return;

  const scene = script.scenes?.find((s) => s.scene_id === sceneId);
  if (!scene) return;

  const modal = document.getElementById("scene-modal");
  document.getElementById("scene-modal-title").textContent = `编辑场景 ${sceneId}`;
  document.getElementById("scene-id").value = sceneId;
  document.getElementById("scene-script-file").value = scriptFile;

  // 填充表单
  document.getElementById("scene-duration").value = scene.duration_seconds || 6;
  document.getElementById("scene-segment-break").value = scene.segment_break ? "true" : "false";
  setImagePromptEditor("scene", scene.image_prompt);
  setVideoPromptEditor("scene", scene.video_prompt);

  // 显示预览
  const assets = scene.generated_assets || {};
  const storyboardContainer = document.getElementById("scene-storyboard");
  const videoContainer = document.getElementById("scene-video");
  const hasStoryboard = !!assets.storyboard_image;
  const hasVideo = !!assets.video_clip;
  const storyboardLoading = document.getElementById("scene-storyboard-loading");
  const videoLoading = document.getElementById("scene-video-loading");

  storyboardLoading?.classList.add("hidden");
  videoLoading?.classList.add("hidden");
  updateGenerateButton(document.getElementById("scene-generate-storyboard-btn"), hasStoryboard, false);
  updateGenerateButton(document.getElementById("scene-generate-video-btn"), hasVideo, false);

  if (hasStoryboard) {
    const storyboardUrl = `${API.getFileUrl(state.projectName, assets.storyboard_image)}?t=${state.cacheBuster}`;
    storyboardContainer.innerHTML = `
            <div class="relative group w-full h-full">
                <img src="${storyboardUrl}" class="w-full h-full object-contain cursor-pointer" onclick="openLightbox('${storyboardUrl}', '分镜图 ${sceneId}')">
                <button onclick="openLightbox('${storyboardUrl}', '分镜图 ${sceneId}')"
                        class="absolute top-2 right-2 p-1.5 bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-opacity-70"
                        title="放大查看">
                    <svg class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                </button>
            </div>`;
  } else {
    storyboardContainer.innerHTML = '<span class="text-gray-500">暂无分镜图</span>';
  }

  if (hasVideo) {
    videoContainer.innerHTML = `<video src="${API.getFileUrl(state.projectName, assets.video_clip)}?t=${state.cacheBuster}" controls class="w-full h-full"></video>`;
  } else {
    videoContainer.innerHTML = '<span class="text-gray-500">暂无视频</span>';
  }

  modal.classList.remove("hidden");

  // 初始化版本控制
  await initSceneVersionControls(sceneId, scriptFile, hasStoryboard, hasVideo);
}

export async function saveScene() {
  const sceneId = document.getElementById("scene-id").value;
  const scriptFile = document.getElementById("scene-script-file").value;

  const imagePromptResult = collectImagePrompt("scene");
  if (!imagePromptResult.ok) {
    alert(`分镜图 Prompt 格式错误: ${imagePromptResult.error}`);
    return;
  }

  const videoPromptResult = collectVideoPrompt("scene");
  if (!videoPromptResult.ok) {
    alert(`视频 Prompt 格式错误: ${videoPromptResult.error}`);
    return;
  }

  const updates = {
    duration_seconds: parseInt(document.getElementById("scene-duration").value) || 6,
    segment_break: document.getElementById("scene-segment-break").value === "true",
    image_prompt: imagePromptResult.value,
    video_prompt: videoPromptResult.value,
  };

  try {
    await API.updateScene(state.projectName, sceneId, scriptFile, updates);
    closeAllModals();
    await loadProject();
  } catch (error) {
    alert("保存失败: " + error.message);
  }
}
