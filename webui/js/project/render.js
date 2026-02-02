import { state } from "./state.js";
import { getPromptText } from "./prompt_editors.js";

function getPhaseClass(phase) {
  const classes = {
    script: "bg-yellow-600 text-yellow-100",
    characters: "bg-purple-600 text-purple-100",
    clues: "bg-pink-600 text-pink-100",
    storyboard: "bg-blue-600 text-blue-100",
    video: "bg-green-600 text-green-100",
    compose: "bg-teal-600 text-teal-100",
    completed: "bg-green-700 text-green-100",
  };
  return classes[phase] || "bg-gray-600 text-gray-300";
}

/**
 * 渲染项目头部
 */
export function renderProjectHeader() {
  const project = state.currentProject;
  if (!project) return;

  document.title = `${project.title} - 视频项目管理`;
  document.getElementById("project-title").textContent = project.title || state.projectName;

  const phaseLabels = {
    script: "剧本阶段",
    characters: "人物阶段",
    clues: "线索阶段",
    storyboard: "分镜阶段",
    video: "视频阶段",
    compose: "后期阶段",
    completed: "已完成",
  };

  const phaseEl = document.getElementById("project-phase");
  const phase = project.status?.current_phase || "unknown";
  phaseEl.textContent = phaseLabels[phase] || phase;
  phaseEl.className = `px-2 py-1 text-xs rounded-full ${getPhaseClass(phase)}`;
}

/**
 * 更新画面比例提示
 */
export function updateAspectRatioHint(contentMode) {
  const hint = document.getElementById("aspect-ratio-hint");
  if (!hint) return;

  if (contentMode === "narration") {
    hint.textContent = "分镜/视频: 9:16 | 设计图/宫格: 16:9";
  } else {
    hint.textContent = "所有资源: 16:9 横屏";
  }
}

/**
 * 渲染概览页
 */
export function renderOverview() {
  const project = state.currentProject;
  if (!project) return;

  // 填充表单
  document.getElementById("edit-title").value = project.title || "";

  // 设置视觉风格（预设选项：Photographic / Anime / 3D Animation）
  const styleSelect = document.getElementById("edit-style");
  const validStyles = ["Photographic", "Anime", "3D Animation"];
  const currentStyle = project.style || "Photographic";
  // 如果当前风格不在预设选项中，默认使用 Photographic
  styleSelect.value = validStyles.includes(currentStyle) ? currentStyle : "Photographic";

  // 设置内容模式
  const contentMode = project.content_mode || "narration";
  const contentModeSelect = document.getElementById("edit-content-mode");
  if (contentModeSelect) {
    contentModeSelect.value = contentMode;
    updateAspectRatioHint(contentMode);
    contentModeSelect.onchange = () => updateAspectRatioHint(contentModeSelect.value);
  }

  // 渲染故事概述
  renderOverviewSection();

  // 渲染进度统计
  const progress = project.status?.progress || {};
  const stats = [
    { label: "人物", ...progress.characters, color: "purple" },
    { label: "线索", ...progress.clues, color: "pink" },
    { label: "分镜", ...progress.storyboards, color: "blue" },
    { label: "视频", ...progress.videos, color: "green" },
  ];

  const container = document.getElementById("progress-stats");
  container.innerHTML = stats
    .map((stat) => {
      const completed = stat.completed || 0;
      const total = stat.total || 0;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      return `
            <div class="bg-gray-700 rounded-lg p-4 text-center">
                <div class="text-3xl font-bold text-${stat.color}-400">${completed}/${total}</div>
                <div class="text-sm text-gray-400 mt-1">${stat.label}</div>
                <div class="w-full bg-gray-600 rounded-full h-2 mt-2">
                    <div class="bg-${stat.color}-500 h-2 rounded-full" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    })
    .join("");
}

/**
 * 渲染故事概述区域
 */
export function renderOverviewSection() {
  const overview = state.currentProject?.overview || {};
  const emptyState = document.getElementById("overview-empty-state");
  const form = document.getElementById("overview-form");

  // 检查是否有概述内容
  const hasOverview = overview.synopsis || overview.genre || overview.theme || overview.world_setting;

  if (hasOverview) {
    emptyState.classList.add("hidden");
    form.classList.remove("hidden");

    // 填充表单
    document.getElementById("edit-synopsis").value = overview.synopsis || "";
    document.getElementById("edit-genre").value = overview.genre || "";
    document.getElementById("edit-theme").value = overview.theme || "";
    document.getElementById("edit-world-setting").value = overview.world_setting || "";
  } else {
    emptyState.classList.remove("hidden");
    form.classList.add("hidden");
  }
}

/**
 * 渲染人物列表
 */
export function renderCharacters() {
  const container = document.getElementById("characters-grid");
  const characters = state.currentProject?.characters || {};

  if (Object.keys(characters).length === 0) {
    container.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-500">
                <p>暂无人物</p>
                <p class="text-sm mt-2">点击"添加人物"开始创建</p>
            </div>
        `;
    return;
  }

  container.innerHTML = Object.entries(characters)
    .map(([name, char]) => {
      const imageUrl = char.character_sheet
        ? `${API.getFileUrl(state.projectName, char.character_sheet)}?t=${state.cacheBuster}`
        : null;

      return `
            <div class="bg-gray-800 rounded-lg overflow-hidden">
                <div class="aspect-portrait-3-4 bg-gray-700 relative group">
                    ${
                      imageUrl
                        ? `<img src="${imageUrl}" alt="${name}" class="w-full h-full object-cover">
                           <button onclick="event.stopPropagation(); openLightbox('${imageUrl}', '${name}')"
                                   class="absolute top-2 right-2 p-1.5 bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-opacity-70"
                                   title="放大查看">
                               <svg class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                               </svg>
                           </button>`
                        : `<div class="w-full h-full flex items-center justify-center">
                             <svg class="h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                             </svg>
                           </div>`
                    }
                </div>
                <div class="p-4">
                    <h3 class="font-semibold text-white">${name}</h3>
                    <p class="text-sm text-gray-400 mt-1 line-clamp-2">${char.description || "暂无描述"}</p>
                    <p class="text-xs text-gray-500 mt-2">声音: ${char.voice_style || "未设置"}</p>
                    <div class="flex space-x-2 mt-4">
                        <button onclick="editCharacter('${name}')" class="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">编辑</button>
                        <button onclick="deleteCharacter('${name}')" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors">删除</button>
                    </div>
                </div>
            </div>
        `;
    })
    .join("");
}

/**
 * 渲染线索列表
 */
export function renderClues() {
  const container = document.getElementById("clues-grid");
  const clues = state.currentProject?.clues || {};

  if (Object.keys(clues).length === 0) {
    container.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-500">
                <p>暂无线索</p>
                <p class="text-sm mt-2">点击"添加线索"开始创建</p>
            </div>
        `;
    return;
  }

  container.innerHTML = Object.entries(clues)
    .map(([name, clue]) => {
      const imageUrl = clue.clue_sheet ? `${API.getFileUrl(state.projectName, clue.clue_sheet)}?t=${state.cacheBuster}` : null;

      const typeClass = clue.type === "location" ? "bg-blue-600" : "bg-gray-600";
      const typeLabel = clue.type === "location" ? "地点" : clue.type === "prop" ? "道具" : "其他";
      const importanceClass = clue.importance === "major" ? "text-yellow-400" : "text-gray-400";

      return `
            <div class="bg-gray-800 rounded-lg overflow-hidden">
                <div class="aspect-video bg-gray-700 relative group">
                    ${
                      imageUrl
                        ? `<img src="${imageUrl}" alt="${name}" class="w-full h-full object-cover">
                           <button onclick="event.stopPropagation(); openLightbox('${imageUrl}', '${name}')"
                                   class="absolute top-2 right-2 p-1.5 bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-opacity-70"
                                   title="放大查看">
                               <svg class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                               </svg>
                           </button>`
                        : `<div class="w-full h-full flex items-center justify-center">
                             <svg class="h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                             </svg>
                           </div>`
                    }
                    <span class="absolute top-2 right-2 px-2 py-0.5 text-xs rounded ${typeClass}">${typeLabel}</span>
                </div>
                <div class="p-4">
                    <div class="flex items-center justify-between">
                        <h3 class="font-semibold text-white">${name}</h3>
                        <span class="text-xs ${importanceClass}">${clue.importance === "major" ? "★ 主要" : "次要"}</span>
                    </div>
                    <p class="text-sm text-gray-400 mt-1 line-clamp-2">${clue.description || "暂无描述"}</p>
                    <div class="flex space-x-2 mt-4">
                        <button onclick="editClue('${name}')" class="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">编辑</button>
                        <button onclick="deleteClue('${name}')" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors">删除</button>
                    </div>
                </div>
            </div>
        `;
    })
    .join("");
}

/**
 * 渲染剧集列表
 */
export function renderEpisodes() {
  const container = document.getElementById("episodes-list");
  const episodes = state.currentProject?.episodes || [];

  if (episodes.length === 0) {
    container.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <p>暂无剧集</p>
                <p class="text-sm mt-2">系统会自动调用 novel-to-storyboard-script agent 生成剧本</p>
            </div>
        `;
    return;
  }

  container.innerHTML = episodes
    .map((ep) => {
      const scriptFile = ep.script_file?.replace("scripts/", "") || "";
      const script = state.currentScripts[scriptFile] || {};
      const contentMode = script.content_mode || state.currentProject.content_mode || "narration";
      const isNarrationMode = contentMode === "narration" && script.segments;
      const items = isNarrationMode ? script.segments || [] : script.scenes || [];
      const episodeNum = ep.episode.toString();
      const drafts = state.currentDrafts[episodeNum] || [];

      const statusClass = {
        draft: "bg-gray-600",
        in_production: "bg-yellow-600",
        completed: "bg-green-600",
      }[ep.status] || "bg-gray-600";

      const modeLabel = isNarrationMode ? "说书模式" : "剧集动画";
      const itemLabel = isNarrationMode ? "片段" : "场景";

      return `
            <div class="bg-gray-800 rounded-lg overflow-hidden">
                <div class="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-750" onclick="toggleEpisode(this)">
                    <div class="flex items-center space-x-4">
                        <span class="text-xl font-bold text-gray-400">E${ep.episode}</span>
                        <div>
                            <h3 class="font-semibold text-white">${ep.title || `第 ${ep.episode} 集`}</h3>
                            <p class="text-sm text-gray-400">${items.length} 个${itemLabel} · ${modeLabel}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-4">
                        <span class="px-2 py-1 text-xs rounded ${statusClass}">${
                          ep.status === "completed" ? "已完成" : ep.status === "in_production" ? "制作中" : "草稿"
                        }</span>
                        <svg class="h-5 w-5 text-gray-400 transform transition-transform episode-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>
                <div class="episode-content hidden border-t border-gray-700">
                    ${renderDraftsSection(episodeNum, drafts, contentMode)}
                    <div class="p-4">
                        ${isNarrationMode ? renderNarrationContent(script, scriptFile) : renderDramaContent(script, scriptFile)}
                    </div>
                </div>
            </div>
        `;
    })
    .join("");
}

/**
 * 渲染说书模式内容（直接显示片段列表，无多宫格图）
 */
function renderNarrationContent(script, scriptFile) {
  const segments = script.segments || [];

  return `
        <h4 class="text-sm font-medium text-gray-400 mb-3">片段列表</h4>
        <div class="segment-grid">
            ${segments.map((seg) => renderSegmentCard(seg, scriptFile)).join("")}
        </div>
    `;
}

/**
 * 渲染剧集动画模式内容（场景列表）
 */
function renderDramaContent(script, scriptFile) {
  const scenes = script.scenes || [];

  return `
        <h4 class="text-sm font-medium text-gray-400 mb-3">场景列表</h4>
        <div class="scene-grid">
            ${scenes.map((scene) => renderSceneCard(scene, scriptFile)).join("")}
        </div>
    `;
}

/**
 * 渲染多宫格图区域（仅 drama 模式使用）
 */
function renderGridImages(items, contentMode = "drama") {
  // narration 模式不渲染多宫格图
  if (contentMode === "narration") {
    return "";
  }

  // 按 storyboard_grid 分组
  const gridGroups = {};
  items.forEach((item) => {
    const grid = item.generated_assets?.storyboard_grid;
    if (grid) {
      if (!gridGroups[grid]) {
        gridGroups[grid] = [];
      }
      gridGroups[grid].push(item.scene_id || item.segment_id);
    }
  });

  if (Object.keys(gridGroups).length === 0) {
    return "";
  }

  return `
        <div class="mb-6 p-4 bg-gray-750 rounded-lg">
            <h4 class="text-sm font-medium text-gray-400 mb-3">📋 多宫格预览图</h4>
            <div class="grid grid-cols-3 gap-4">
                ${Object.entries(gridGroups)
                  .map(([gridPath, segmentIds]) => {
                    const gridUrl = `${API.getFileUrl(state.projectName, gridPath)}?t=${state.cacheBuster}`;
                    return `
                        <div class="bg-gray-800 rounded-lg overflow-hidden">
                            <img src="${gridUrl}"
                                 class="w-full aspect-video object-cover cursor-pointer hover:opacity-80"
                                 onclick="openLightbox('${gridUrl}', '多宫格预览图')">
                            <div class="p-2 text-xs text-gray-400">
                                包含: ${segmentIds.join(", ")}
                            </div>
                        </div>
                    `;
                  })
                  .join("")}
            </div>
        </div>
    `;
}

/**
 * 渲染片段卡片（说书模式）
 */
function renderSegmentCard(segment, scriptFile) {
  const assets = segment.generated_assets || {};
  const storyboardUrl = assets.storyboard_image ? `${API.getFileUrl(state.projectName, assets.storyboard_image)}?t=${state.cacheBuster}` : null;

  const statusClass =
    {
      completed: "bg-green-600",
      storyboard_ready: "bg-blue-600",
      in_progress: "bg-yellow-600",
      pending: "bg-gray-600",
    }[assets.status] || "bg-gray-600";

  const displayText = segment.novel_text || getPromptText(segment.image_prompt) || "无描述";
  const previewText = displayText.substring(0, 40);
  const needsEllipsis = displayText.length > 40;

  return `
        <div class="segment-card bg-gray-700 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
             onclick="editSegment('${segment.segment_id}', '${scriptFile}')">
            <div class="aspect-portrait bg-gray-800 relative">
                ${
                  storyboardUrl
                    ? `<img src="${storyboardUrl}" alt="${segment.segment_id}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full flex items-center justify-center text-gray-600">
                         <span class="text-2xl">🎬</span>
                       </div>`
                }
                <div class="absolute top-2 left-2 px-2 py-0.5 text-xs rounded ${statusClass}">${segment.segment_id}</div>
                <div class="absolute bottom-2 right-2 px-2 py-0.5 bg-black bg-opacity-70 text-xs rounded">${segment.duration_seconds || 4}s</div>
                ${segment.segment_break ? `<div class="absolute bottom-2 left-2 px-2 py-0.5 bg-orange-600 text-xs rounded">转场</div>` : ""}
            </div>
            <div class="p-2">
                <p class="text-xs text-gray-400 line-clamp-2">${previewText}${needsEllipsis ? "..." : ""}</p>
            </div>
        </div>
    `;
}

/**
 * 渲染草稿区域
 * @param {string} episodeNum - 剧集编号
 * @param {Array} drafts - 草稿文件列表
 * @param {string} contentMode - 内容模式 ('narration' 或 'drama')
 */
function renderDraftsSection(episodeNum, drafts, contentMode) {
  // 根据 content_mode 选择不同的文件命名
  // narration 模式：3 步流程（无宫格切分步骤）
  // drama 模式：3 步流程
  const stepInfo =
    contentMode === "narration"
      ? [
          { num: 1, name: "片段拆分（含 segment_break）", file: "step1_segments.md", color: "blue" },
          { num: 2, name: "角色表/线索表", file: "step2_character_clue_tables.md", color: "green" },
          // Step 3 输出直接是 scripts/episode_N.json，不在草稿中显示
        ]
      : [
          { num: 1, name: "规范化剧本", file: "step1_normalized_script.md", color: "blue" },
          { num: 2, name: "镜头预算表", file: "step2_shot_budget.md", color: "green" },
          { num: 3, name: "角色表/线索表", file: "step3_character_clue_tables.md", color: "purple" },
        ];

  const draftFiles = drafts.map((d) => d.name);

  return `
        <div class="p-4 bg-gray-750 border-b border-gray-700">
            <h4 class="text-sm font-medium text-gray-400 mb-3">📝 剧本草稿</h4>
            <div class="flex flex-wrap gap-2">
                ${stepInfo
                  .map((step) => {
                    const exists = draftFiles.includes(step.file);
                    const bgClass = exists ? `bg-${step.color}-600 hover:bg-${step.color}-700` : "bg-gray-700 hover:bg-gray-600";
                    const icon = exists ? "✓" : "○";

                    return `
                        <button
                            onclick="openDraftModal(${episodeNum}, ${step.num}, ${exists}, '${contentMode}')"
                            class="flex items-center space-x-2 px-3 py-2 ${bgClass} rounded-lg text-sm transition-colors"
                        >
                            <span>${icon}</span>
                            <span>Step ${step.num}: ${step.name}</span>
                        </button>
                    `;
                  })
                  .join("")}
            </div>
        </div>
    `;
}

/**
 * 渲染场景卡片
 */
function renderSceneCard(scene, scriptFile) {
  const assets = scene.generated_assets || {};
  const storyboardUrl = assets.storyboard_image ? `${API.getFileUrl(state.projectName, assets.storyboard_image)}?t=${state.cacheBuster}` : null;
  const videoUrl = assets.video_clip ? `${API.getFileUrl(state.projectName, assets.video_clip)}?t=${state.cacheBuster}` : null;

  const statusClass =
    {
      completed: "bg-green-600",
      in_progress: "bg-yellow-600",
      pending: "bg-gray-600",
    }[assets.status] || "bg-gray-600";

  return `
        <div class="bg-gray-700 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all" onclick="editScene('${scene.scene_id}', '${scriptFile}')">
            <div class="aspect-video bg-gray-800 relative">
                ${
                  storyboardUrl
                    ? `<img src="${storyboardUrl}" alt="${scene.scene_id}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full flex items-center justify-center text-gray-600">
                         <span>${scene.scene_id}</span>
                       </div>`
                }
                ${videoUrl ? `<div class="absolute bottom-2 right-2 px-2 py-0.5 bg-green-600 text-xs rounded">🎬</div>` : ""}
                <div class="absolute top-2 left-2 px-2 py-0.5 text-xs rounded ${statusClass}">${scene.scene_id}</div>
                ${scene.segment_break ? `<div class="absolute top-2 right-2 px-2 py-0.5 bg-orange-600 text-xs rounded">转场</div>` : ""}
            </div>
            <div class="p-2">
                <p class="text-xs text-gray-400 truncate">${scene.dialogue?.text || scene.visual?.description || "无描述"}</p>
                <p class="text-xs text-gray-500 mt-1">${scene.duration_seconds || 6}秒</p>
            </div>
        </div>
    `;
}

/**
 * 更新计数
 */
export function updateCounts() {
  document.getElementById("characters-count").textContent = Object.keys(state.currentProject?.characters || {}).length;
  document.getElementById("clues-count").textContent = Object.keys(state.currentProject?.clues || {}).length;
  document.getElementById("episodes-count").textContent = (state.currentProject?.episodes || []).length;
}

