/**
 * Prompt editors (structured) for segment/scene modals.
 *
 * Mirrors logic in `lib/prompt_utils.py` to avoid extra backend endpoints.
 */

// 与 lib/prompt_utils.py 保持一致（前端不依赖后端返回，避免额外接口）
const SHOT_TYPE_OPTIONS = [
  "Extreme Close-up",
  "Close-up",
  "Medium Close-up",
  "Medium Shot",
  "Medium Long Shot",
  "Long Shot",
  "Extreme Long Shot",
  "Over-the-shoulder",
  "Point-of-view",
];

const CAMERA_MOTION_OPTIONS = [
  "Static",
  "Pan Left",
  "Pan Right",
  "Tilt Up",
  "Tilt Down",
  "Zoom In",
  "Zoom Out",
  "Tracking Shot",
];

const SHOT_TYPE_ZH = {
  "Extreme Close-up": "极特写",
  "Close-up": "特写",
  "Medium Close-up": "中近景",
  "Medium Shot": "中景",
  "Medium Long Shot": "中远景",
  "Long Shot": "远景",
  "Extreme Long Shot": "极远景",
  "Over-the-shoulder": "越肩镜头",
  "Point-of-view": "主观视角（POV）",
};

const CAMERA_MOTION_ZH = {
  Static: "固定镜头",
  "Pan Left": "左摇",
  "Pan Right": "右摇",
  "Tilt Up": "上摇",
  "Tilt Down": "下摇",
  "Zoom In": "推近（变焦）",
  "Zoom Out": "拉远（变焦）",
  "Tracking Shot": "跟拍（移动镜头）",
};

const DEFAULT_SHOT_TYPE = "Medium Shot";
const DEFAULT_CAMERA_MOTION = "Static";

/**
 * 提取 prompt 的完整文本（用于预览等场景）
 */
export function getPromptText(prompt) {
  if (!prompt) return "";
  if (typeof prompt === "string") return prompt;
  if (typeof prompt !== "object") return "";
  return prompt.scene || prompt.action || "";
}

/**
 * 获取 prompt 预览文本（用于卡片展示）
 */
export function getPromptPreview(prompt, maxLength = 40) {
  const text = getPromptText(prompt);
  return text.substring(0, maxLength);
}

function canonicalizeEnumValue(value, options) {
  const text = (value ?? "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  return options.find((o) => o.toLowerCase() === lower) || text;
}

function populateSelectOptions(selectEl, options, zhMap = null) {
  if (!selectEl) return;
  const existingValues = new Set(Array.from(selectEl.options).map((o) => o.value));
  options.forEach((value) => {
    if (existingValues.has(value)) return;
    const opt = document.createElement("option");
    opt.value = value;
    const zh = zhMap ? zhMap[value] : null;
    opt.textContent = zh ? `${zh}（${value}）` : value;
    selectEl.appendChild(opt);
  });
}

function setSelectValueWithCustomOption(selectEl, value) {
  if (!selectEl) return;
  selectEl.querySelectorAll('option[data-custom="1"]').forEach((o) => o.remove());
  const text = (value ?? "").trim();
  if (text && !Array.from(selectEl.options).some((o) => o.value === text)) {
    const opt = document.createElement("option");
    opt.value = text;
    opt.textContent = `自定义：${text}`;
    opt.dataset.custom = "1";
    const insertBefore = selectEl.querySelector('option[value=""]')?.nextSibling || selectEl.firstChild;
    selectEl.insertBefore(opt, insertBefore);
  }
  selectEl.value = text;
}

function clearDialogueList(prefix) {
  const container = document.getElementById(`${prefix}-video-dialogue-list`);
  if (!container) return;
  container.innerHTML = "";
}

function addDialogueRow(prefix, speaker = "", line = "") {
  const container = document.getElementById(`${prefix}-video-dialogue-list`);
  if (!container) return;

  const row = document.createElement("div");
  row.className = "prompt-dialogue-row flex items-center space-x-2";
  row.innerHTML = `
        <input type="text" class="dialogue-speaker w-24 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white text-sm" placeholder="角色">
        <input type="text" class="dialogue-line flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white text-sm" placeholder="台词">
        <button type="button" class="dialogue-remove px-2 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-xs">删除</button>
    `;

  row.querySelector(".dialogue-speaker").value = speaker;
  row.querySelector(".dialogue-line").value = line;
  row.querySelector(".dialogue-remove").onclick = () => row.remove();

  container.appendChild(row);
}

function readDialogueList(prefix) {
  const container = document.getElementById(`${prefix}-video-dialogue-list`);
  if (!container) return [];
  const rows = Array.from(container.querySelectorAll(".prompt-dialogue-row"));
  return rows
    .map((row) => {
      const speaker = row.querySelector(".dialogue-speaker")?.value?.trim() || "";
      const line = row.querySelector(".dialogue-line")?.value?.trim() || "";
      return { speaker, line };
    })
    .filter((d) => d.speaker || d.line);
}

export function setImagePromptEditor(prefix, imagePrompt) {
  const sceneEl = document.getElementById(`${prefix}-image-scene`);
  const shotTypeEl = document.getElementById(`${prefix}-image-shot-type`);
  const lightingEl = document.getElementById(`${prefix}-image-lighting`);
  const ambianceEl = document.getElementById(`${prefix}-image-ambiance`);

  if (!sceneEl || !shotTypeEl || !lightingEl || !ambianceEl) return;

  if (typeof imagePrompt === "object" && imagePrompt && imagePrompt.scene) {
    sceneEl.value = imagePrompt.scene || "";
    const shot =
      canonicalizeEnumValue(imagePrompt.composition?.shot_type, SHOT_TYPE_OPTIONS) || DEFAULT_SHOT_TYPE;
    setSelectValueWithCustomOption(shotTypeEl, shot);
    lightingEl.value = imagePrompt.composition?.lighting || "";
    ambianceEl.value = imagePrompt.composition?.ambiance || "";
    return;
  }

  // 兼容旧格式：字符串 prompt 直接放到 scene 字段
  sceneEl.value = typeof imagePrompt === "string" ? imagePrompt : "";
  setSelectValueWithCustomOption(shotTypeEl, DEFAULT_SHOT_TYPE);
  lightingEl.value = "";
  ambianceEl.value = "";
}

export function collectImagePrompt(prefix) {
  const scene = document.getElementById(`${prefix}-image-scene`)?.value?.trim() || "";
  const shotTypeRaw = document.getElementById(`${prefix}-image-shot-type`)?.value || "";
  const lighting = document.getElementById(`${prefix}-image-lighting`)?.value?.trim() || "";
  const ambiance = document.getElementById(`${prefix}-image-ambiance`)?.value?.trim() || "";

  if (!scene) {
    return { ok: false, error: "Scene 不能为空" };
  }

  const shot_type = shotTypeRaw.trim() || DEFAULT_SHOT_TYPE;
  return {
    ok: true,
    value: {
      scene,
      composition: { shot_type, lighting, ambiance },
    },
  };
}

export function setVideoPromptEditor(prefix, videoPrompt) {
  const actionEl = document.getElementById(`${prefix}-video-action`);
  const cameraMotionEl = document.getElementById(`${prefix}-video-camera-motion`);
  const ambianceAudioEl = document.getElementById(`${prefix}-video-ambiance-audio`);

  if (!actionEl || !cameraMotionEl || !ambianceAudioEl) return;

  clearDialogueList(prefix);

  if (typeof videoPrompt === "object" && videoPrompt && videoPrompt.action) {
    actionEl.value = videoPrompt.action || "";
    const motion =
      canonicalizeEnumValue(videoPrompt.camera_motion, CAMERA_MOTION_OPTIONS) || DEFAULT_CAMERA_MOTION;
    setSelectValueWithCustomOption(cameraMotionEl, motion);
    ambianceAudioEl.value = videoPrompt.ambiance_audio || "";
    (videoPrompt.dialogue || []).forEach((d) => addDialogueRow(prefix, d.speaker || "", d.line || ""));
    return;
  }

  // 兼容旧格式：字符串 prompt 直接放到 action 字段
  actionEl.value = typeof videoPrompt === "string" ? videoPrompt : "";
  setSelectValueWithCustomOption(cameraMotionEl, DEFAULT_CAMERA_MOTION);
  ambianceAudioEl.value = "";
}

export function collectVideoPrompt(prefix) {
  const action = document.getElementById(`${prefix}-video-action`)?.value?.trim() || "";
  const cameraMotionRaw = document.getElementById(`${prefix}-video-camera-motion`)?.value || "";
  const ambiance_audio = document.getElementById(`${prefix}-video-ambiance-audio`)?.value?.trim() || "";
  const dialogue = readDialogueList(prefix);

  if (!action) {
    return { ok: false, error: "Action 不能为空" };
  }

  const camera_motion = cameraMotionRaw.trim() || DEFAULT_CAMERA_MOTION;
  return {
    ok: true,
    value: { action, camera_motion, ambiance_audio, dialogue },
  };
}

export function initPromptEditors() {
  populateSelectOptions(document.getElementById("segment-image-shot-type"), SHOT_TYPE_OPTIONS, SHOT_TYPE_ZH);
  populateSelectOptions(document.getElementById("scene-image-shot-type"), SHOT_TYPE_OPTIONS, SHOT_TYPE_ZH);
  populateSelectOptions(
    document.getElementById("segment-video-camera-motion"),
    CAMERA_MOTION_OPTIONS,
    CAMERA_MOTION_ZH,
  );
  populateSelectOptions(
    document.getElementById("scene-video-camera-motion"),
    CAMERA_MOTION_OPTIONS,
    CAMERA_MOTION_ZH,
  );

  const segmentAdd = document.getElementById("segment-video-dialogue-add");
  if (segmentAdd) segmentAdd.onclick = () => addDialogueRow("segment");
  const sceneAdd = document.getElementById("scene-video-dialogue-add");
  if (sceneAdd) sceneAdd.onclick = () => addDialogueRow("scene");
}

