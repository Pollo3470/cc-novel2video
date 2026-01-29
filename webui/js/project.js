/**
 * 项目详情页逻辑
 */

let currentProject = null;
let currentScripts = {};
let currentDrafts = {};
let projectName = null;
let cacheBuster = Date.now();

document.addEventListener('DOMContentLoaded', () => {
    // 从 URL 获取项目名称
    const params = new URLSearchParams(window.location.search);
    projectName = params.get('name');

    if (!projectName) {
        alert('未指定项目');
        window.location.href = '/';
        return;
    }

    loadProject();
    setupEventListeners();
});

/**
 * 加载项目数据
 */
async function loadProject() {
    cacheBuster = Date.now(); // 更新缓存标记
    const loading = document.getElementById('loading');

    try {
        loading.classList.remove('hidden');

        const data = await API.getProject(projectName);
        currentProject = data.project;
        currentScripts = data.scripts || {};

        // 加载草稿数据
        try {
            const draftsData = await API.listDrafts(projectName);
            currentDrafts = draftsData.drafts || {};
        } catch (e) {
            console.log('No drafts found:', e);
            currentDrafts = {};
        }

        renderProjectHeader();
        renderOverview();
        renderCharacters();
        renderClues();
        renderEpisodes();
        renderSourceFiles();
        updateCounts();

    } catch (error) {
        console.error('加载项目失败:', error);
        alert('加载项目失败: ' + error.message);
        window.location.href = '/';
    } finally {
        loading.classList.add('hidden');
    }
}

/**
 * 渲染项目头部
 */
function renderProjectHeader() {
    document.title = `${currentProject.title} - 视频项目管理`;
    document.getElementById('project-title').textContent = currentProject.title || projectName;

    const phaseLabels = {
        'script': '剧本阶段',
        'characters': '人物阶段',
        'clues': '线索阶段',
        'storyboard': '分镜阶段',
        'video': '视频阶段',
        'compose': '后期阶段',
        'completed': '已完成'
    };

    const phaseEl = document.getElementById('project-phase');
    const phase = currentProject.status?.current_phase || 'unknown';
    phaseEl.textContent = phaseLabels[phase] || phase;
    phaseEl.className = `px-2 py-1 text-xs rounded-full ${getPhaseClass(phase)}`;
}

/**
 * 更新画面比例提示
 */
function updateAspectRatioHint(contentMode) {
    const hint = document.getElementById('aspect-ratio-hint');
    if (hint) {
        if (contentMode === 'narration') {
            hint.textContent = '分镜/视频: 9:16 | 设计图/宫格: 16:9';
        } else {
            hint.textContent = '所有资源: 16:9 横屏';
        }
    }
}

/**
 * 渲染概览页
 */
function renderOverview() {
    // 填充表单
    document.getElementById('edit-title').value = currentProject.title || '';
    document.getElementById('edit-style').value = currentProject.style || '';

    // 设置内容模式
    const contentMode = currentProject.content_mode || 'narration';
    const contentModeSelect = document.getElementById('edit-content-mode');
    if (contentModeSelect) {
        contentModeSelect.value = contentMode;
        updateAspectRatioHint(contentMode);
        contentModeSelect.onchange = () => updateAspectRatioHint(contentModeSelect.value);
    }

    // 渲染故事概述
    renderOverviewSection();

    // 渲染进度统计
    const progress = currentProject.status?.progress || {};
    const stats = [
        { label: '人物', ...progress.characters, color: 'purple' },
        { label: '线索', ...progress.clues, color: 'pink' },
        { label: '分镜', ...progress.storyboards, color: 'blue' },
        { label: '视频', ...progress.videos, color: 'green' }
    ];

    const container = document.getElementById('progress-stats');
    container.innerHTML = stats.map(stat => {
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
    }).join('');
}

/**
 * 渲染故事概述区域
 */
function renderOverviewSection() {
    const overview = currentProject.overview || {};
    const emptyState = document.getElementById('overview-empty-state');
    const form = document.getElementById('overview-form');

    // 检查是否有概述内容
    const hasOverview = overview.synopsis || overview.genre || overview.theme || overview.world_setting;

    if (hasOverview) {
        emptyState.classList.add('hidden');
        form.classList.remove('hidden');

        // 填充表单
        document.getElementById('edit-synopsis').value = overview.synopsis || '';
        document.getElementById('edit-genre').value = overview.genre || '';
        document.getElementById('edit-theme').value = overview.theme || '';
        document.getElementById('edit-world-setting').value = overview.world_setting || '';
    } else {
        emptyState.classList.remove('hidden');
        form.classList.add('hidden');
    }
}

/**
 * 渲染人物列表
 */
function renderCharacters() {
    const container = document.getElementById('characters-grid');
    const characters = currentProject.characters || {};

    if (Object.keys(characters).length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-500">
                <p>暂无人物</p>
                <p class="text-sm mt-2">点击"添加人物"开始创建</p>
            </div>
        `;
        return;
    }

    container.innerHTML = Object.entries(characters).map(([name, char]) => {
        const imageUrl = char.character_sheet
            ? `${API.getFileUrl(projectName, char.character_sheet)}?t=${cacheBuster}`
            : null;

        return `
            <div class="bg-gray-800 rounded-lg overflow-hidden">
                <div class="aspect-video bg-gray-700 relative group">
                    ${imageUrl
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
                    <p class="text-sm text-gray-400 mt-1 line-clamp-2">${char.description || '暂无描述'}</p>
                    ${char.voice_style ? `<p class="text-xs text-gray-500 mt-2">🎤 ${char.voice_style}</p>` : ''}
                    <div class="flex space-x-2 mt-4">
                        <button onclick="editCharacter('${name}')" class="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">编辑</button>
                        <button onclick="deleteCharacter('${name}')" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors">删除</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * 渲染线索列表
 */
function renderClues() {
    const container = document.getElementById('clues-grid');
    const clues = currentProject.clues || {};

    if (Object.keys(clues).length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-500">
                <p>暂无线索</p>
                <p class="text-sm mt-2">点击"添加线索"开始创建</p>
            </div>
        `;
        return;
    }

    container.innerHTML = Object.entries(clues).map(([name, clue]) => {
        const imageUrl = clue.clue_sheet
            ? `${API.getFileUrl(projectName, clue.clue_sheet)}?t=${cacheBuster}`
            : null;

        const typeLabel = clue.type === 'prop' ? '道具' : '场景';
        const typeClass = clue.type === 'prop' ? 'bg-yellow-600' : 'bg-teal-600';
        const importanceClass = clue.importance === 'major' ? 'text-pink-400' : 'text-gray-500';

        return `
            <div class="bg-gray-800 rounded-lg overflow-hidden">
                <div class="aspect-video bg-gray-700 relative group">
                    ${imageUrl
                        ? `<img src="${imageUrl}" alt="${name}" class="w-full h-full object-cover">
                           <button onclick="event.stopPropagation(); openLightbox('${imageUrl}', '${name}')"
                                   class="absolute top-2 left-2 p-1.5 bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-opacity-70"
                                   title="放大查看">
                               <svg class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                               </svg>
                           </button>`
                        : `<div class="w-full h-full flex items-center justify-center">
                             <svg class="h-12 w-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                             </svg>
                           </div>`
                    }
                    <span class="absolute top-2 right-2 px-2 py-0.5 text-xs rounded ${typeClass}">${typeLabel}</span>
                </div>
                <div class="p-4">
                    <div class="flex items-center justify-between">
                        <h3 class="font-semibold text-white">${name}</h3>
                        <span class="text-xs ${importanceClass}">${clue.importance === 'major' ? '★ 主要' : '次要'}</span>
                    </div>
                    <p class="text-sm text-gray-400 mt-1 line-clamp-2">${clue.description || '暂无描述'}</p>
                    <div class="flex space-x-2 mt-4">
                        <button onclick="editClue('${name}')" class="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">编辑</button>
                        <button onclick="deleteClue('${name}')" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors">删除</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * 渲染剧集列表
 */
function renderEpisodes() {
    const container = document.getElementById('episodes-list');
    const episodes = currentProject.episodes || [];

    if (episodes.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <p>暂无剧集</p>
                <p class="text-sm mt-2">系统会自动调用 novel-to-storyboard-script agent 生成剧本</p>
            </div>
        `;
        return;
    }

    container.innerHTML = episodes.map(ep => {
        const scriptFile = ep.script_file?.replace('scripts/', '') || '';
        const script = currentScripts[scriptFile] || {};
        const contentMode = script.content_mode || currentProject.content_mode || 'narration';
        const isNarrationMode = contentMode === 'narration' && script.segments;
        const items = isNarrationMode ? (script.segments || []) : (script.scenes || []);
        const episodeNum = ep.episode.toString();
        const drafts = currentDrafts[episodeNum] || [];

        const statusClass = {
            'draft': 'bg-gray-600',
            'in_production': 'bg-yellow-600',
            'completed': 'bg-green-600'
        }[ep.status] || 'bg-gray-600';

        const modeLabel = isNarrationMode ? '说书模式' : '剧集动画';
        const itemLabel = isNarrationMode ? '片段' : '场景';

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
                        <span class="px-2 py-1 text-xs rounded ${statusClass}">${ep.status === 'completed' ? '已完成' : ep.status === 'in_production' ? '制作中' : '草稿'}</span>
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
    }).join('');
}

/**
 * 渲染说书模式内容（直接显示片段列表，无多宫格图）
 */
function renderNarrationContent(script, scriptFile) {
    const segments = script.segments || [];

    return `
        <h4 class="text-sm font-medium text-gray-400 mb-3">片段列表</h4>
        <div class="segment-grid">
            ${segments.map(seg => renderSegmentCard(seg, scriptFile)).join('')}
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
            ${scenes.map(scene => renderSceneCard(scene, scriptFile)).join('')}
        </div>
    `;
}

/**
 * 渲染多宫格图区域（仅 drama 模式使用）
 */
function renderGridImages(items, contentMode = 'drama') {
    // narration 模式不渲染多宫格图
    if (contentMode === 'narration') {
        return '';
    }

    // 按 storyboard_grid 分组
    const gridGroups = {};
    items.forEach(item => {
        const grid = item.generated_assets?.storyboard_grid;
        if (grid) {
            if (!gridGroups[grid]) {
                gridGroups[grid] = [];
            }
            gridGroups[grid].push(item.scene_id || item.segment_id);
        }
    });

    if (Object.keys(gridGroups).length === 0) {
        return '';
    }

    return `
        <div class="mb-6 p-4 bg-gray-750 rounded-lg">
            <h4 class="text-sm font-medium text-gray-400 mb-3">📋 多宫格预览图</h4>
            <div class="grid grid-cols-3 gap-4">
                ${Object.entries(gridGroups).map(([gridPath, segmentIds]) => {
                    const gridUrl = `${API.getFileUrl(projectName, gridPath)}?t=${cacheBuster}`;
                    return `
                        <div class="bg-gray-800 rounded-lg overflow-hidden">
                            <img src="${gridUrl}"
                                 class="w-full aspect-video object-cover cursor-pointer hover:opacity-80"
                                 onclick="openLightbox('${gridUrl}', '多宫格预览图')">
                            <div class="p-2 text-xs text-gray-400">
                                包含: ${segmentIds.join(', ')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

/**
 * 渲染片段卡片（说书模式）
 */
function renderSegmentCard(segment, scriptFile) {
    const assets = segment.generated_assets || {};
    const storyboardUrl = assets.storyboard_image
        ? `${API.getFileUrl(projectName, assets.storyboard_image)}?t=${cacheBuster}`
        : null;

    const statusClass = {
        'completed': 'bg-green-600',
        'storyboard_ready': 'bg-blue-600',
        'in_progress': 'bg-yellow-600',
        'pending': 'bg-gray-600'
    }[assets.status] || 'bg-gray-600';

    return `
        <div class="segment-card bg-gray-700 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
             onclick="editSegment('${segment.segment_id}', '${scriptFile}')">
            <div class="aspect-portrait bg-gray-800 relative">
                ${storyboardUrl
                    ? `<img src="${storyboardUrl}" alt="${segment.segment_id}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full flex items-center justify-center text-gray-600">
                         <span class="text-2xl">🎬</span>
                       </div>`
                }
                <div class="absolute top-2 left-2 px-2 py-0.5 text-xs rounded ${statusClass}">${segment.segment_id}</div>
                <div class="absolute bottom-2 right-2 px-2 py-0.5 bg-black bg-opacity-70 text-xs rounded">${segment.duration_seconds || 4}s</div>
                ${segment.segment_break ? `<div class="absolute bottom-2 left-2 px-2 py-0.5 bg-orange-600 text-xs rounded">转场</div>` : ''}
            </div>
            <div class="p-2">
                <p class="text-xs text-gray-400 line-clamp-2">${segment.novel_text?.substring(0, 40) || segment.image_prompt?.substring(0, 40) || '无描述'}${(segment.novel_text?.length > 40 || segment.image_prompt?.length > 40) ? '...' : ''}</p>
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
    const stepInfo = contentMode === 'narration' ? [
        { num: 1, name: '片段拆分（含 segment_break）', file: 'step1_segments.md', color: 'blue' },
        { num: 2, name: '角色表/线索表', file: 'step2_character_clue_tables.md', color: 'green' }
        // Step 3 输出直接是 scripts/episode_N.json，不在草稿中显示
    ] : [
        { num: 1, name: '规范化剧本', file: 'step1_normalized_script.md', color: 'blue' },
        { num: 2, name: '镜头预算表', file: 'step2_shot_budget.md', color: 'green' },
        { num: 3, name: '角色表/线索表', file: 'step3_character_clue_tables.md', color: 'purple' }
    ];

    const draftFiles = drafts.map(d => d.name);

    return `
        <div class="p-4 bg-gray-750 border-b border-gray-700">
            <h4 class="text-sm font-medium text-gray-400 mb-3">📝 剧本草稿</h4>
            <div class="flex flex-wrap gap-2">
                ${stepInfo.map(step => {
                    const exists = draftFiles.includes(step.file);
                    const bgClass = exists ? `bg-${step.color}-600 hover:bg-${step.color}-700` : 'bg-gray-700 hover:bg-gray-600';
                    const icon = exists ? '✓' : '○';

                    return `
                        <button
                            onclick="openDraftModal(${episodeNum}, ${step.num}, ${exists}, '${contentMode}')"
                            class="flex items-center space-x-2 px-3 py-2 ${bgClass} rounded-lg text-sm transition-colors"
                        >
                            <span>${icon}</span>
                            <span>Step ${step.num}: ${step.name}</span>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

/**
 * 渲染场景卡片
 */
function renderSceneCard(scene, scriptFile) {
    const assets = scene.generated_assets || {};
    const storyboardUrl = assets.storyboard_image
        ? `${API.getFileUrl(projectName, assets.storyboard_image)}?t=${cacheBuster}`
        : null;
    const videoUrl = assets.video_clip
        ? `${API.getFileUrl(projectName, assets.video_clip)}?t=${cacheBuster}`
        : null;

    const statusClass = {
        'completed': 'bg-green-600',
        'in_progress': 'bg-yellow-600',
        'pending': 'bg-gray-600'
    }[assets.status] || 'bg-gray-600';

    return `
        <div class="bg-gray-700 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all" onclick="editScene('${scene.scene_id}', '${scriptFile}')">
            <div class="aspect-video bg-gray-800 relative">
                ${storyboardUrl
                    ? `<img src="${storyboardUrl}" alt="${scene.scene_id}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full flex items-center justify-center text-gray-600">
                         <span>${scene.scene_id}</span>
                       </div>`
                }
                ${videoUrl ? `<div class="absolute bottom-2 right-2 px-2 py-0.5 bg-green-600 text-xs rounded">🎬</div>` : ''}
                <div class="absolute top-2 left-2 px-2 py-0.5 text-xs rounded ${statusClass}">${scene.scene_id}</div>
                ${scene.segment_break ? `<div class="absolute top-2 right-2 px-2 py-0.5 bg-orange-600 text-xs rounded">转场</div>` : ''}
            </div>
            <div class="p-2">
                <p class="text-xs text-gray-400 truncate">${scene.dialogue?.text || scene.visual?.description || '无描述'}</p>
                <p class="text-xs text-gray-500 mt-1">${scene.duration_seconds || 6}秒</p>
            </div>
        </div>
    `;
}

/**
 * 更新计数
 */
function updateCounts() {
    document.getElementById('characters-count').textContent = Object.keys(currentProject.characters || {}).length;
    document.getElementById('clues-count').textContent = Object.keys(currentProject.clues || {}).length;
    document.getElementById('episodes-count').textContent = (currentProject.episodes || []).length;
}

/**
 * 切换剧集展开/折叠
 */
function toggleEpisode(header) {
    const content = header.nextElementSibling;
    const arrow = header.querySelector('.episode-arrow');
    content.classList.toggle('hidden');
    arrow.classList.toggle('rotate-180');
}

/**
 * 设置事件监听
 */
function setupEventListeners() {
    // Tab 切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => switchTab(btn.dataset.tab);
    });

    // 刷新按钮
    document.getElementById('refresh-btn').onclick = loadProject;

    // 删除项目
    document.getElementById('delete-btn').onclick = deleteProject;

    // 项目信息表单
    document.getElementById('project-info-form').onsubmit = async (e) => {
        e.preventDefault();
        await saveProjectInfo();
    };

    // 故事概述表单
    document.getElementById('overview-form').onsubmit = async (e) => {
        e.preventDefault();
        await saveOverview();
    };

    // 重新生成概述按钮
    document.getElementById('regenerate-overview-btn').onclick = regenerateOverview;

    // 人物模态框
    document.getElementById('add-character-btn').onclick = () => openCharacterModal();
    document.getElementById('character-form').onsubmit = (e) => {
        e.preventDefault();
        saveCharacter();
    };

    // 线索模态框
    document.getElementById('add-clue-btn').onclick = () => openClueModal();
    document.getElementById('clue-form').onsubmit = (e) => {
        e.preventDefault();
        saveClue();
    };

    // 场景模态框
    document.getElementById('scene-form').onsubmit = (e) => {
        e.preventDefault();
        saveScene();
    };

    // 片段模态框（说书模式）
    document.getElementById('segment-form').onsubmit = (e) => {
        e.preventDefault();
        saveSegment();
    };

    // 关闭模态框
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = closeAllModals;
    });

    // 点击背景关闭模态框
    ['character-modal', 'clue-modal', 'scene-modal', 'segment-modal', 'source-modal', 'draft-modal'].forEach(id => {
        document.getElementById(id).onclick = (e) => {
            if (e.target.id === id) closeAllModals();
        };
    });

    // Lightbox 关闭事件
    document.getElementById('image-lightbox').onclick = (e) => {
        if (e.target.id === 'image-lightbox') closeLightbox();
    };
    document.getElementById('lightbox-close-btn').onclick = closeLightbox;

    // ESC 键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
            closeLightbox();
        }
    });

    // 图片上传
    setupImageUpload('char-image-drop', 'char-image-input', 'char-image-preview');
    setupImageUpload('clue-image-drop', 'clue-image-input', 'clue-image-preview');

    // Source 文件管理
    document.getElementById('new-source-btn').onclick = newSourceFile;
    document.getElementById('source-upload-input').onchange = handleSourceUpload;
    document.getElementById('source-form').onsubmit = (e) => {
        e.preventDefault();
        saveSourceFile();
    };

    // 草稿模态框
    document.getElementById('draft-form').onsubmit = (e) => {
        e.preventDefault();
        saveDraft();
    };

    // 草稿编辑/预览模式切换
    document.getElementById('draft-mode-edit').onclick = () => toggleDraftMode('edit');
    document.getElementById('draft-mode-preview').onclick = () => toggleDraftMode('preview');
}

/**
 * 切换 Tab
 */
function switchTab(tabName) {
    // 更新按钮样式
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.className = 'tab-btn w-full flex items-center space-x-3 px-4 py-3 rounded-lg bg-blue-600 text-white';
        } else {
            btn.className = 'tab-btn w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white';
        }
    });

    // 显示对应内容
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
}

/**
 * 保存项目信息
 */
async function saveProjectInfo() {
    try {
        const contentModeSelect = document.getElementById('edit-content-mode');
        const updates = {
            title: document.getElementById('edit-title').value.trim(),
            style: document.getElementById('edit-style').value.trim(),
            content_mode: contentModeSelect ? contentModeSelect.value : 'narration'
        };

        await API.updateProject(projectName, updates);
        currentProject.title = updates.title;
        currentProject.style = updates.style;
        currentProject.content_mode = updates.content_mode;
        renderProjectHeader();
        alert('保存成功');
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

/**
 * 删除项目
 */
async function deleteProject() {
    if (!confirm(`确定要删除项目 "${currentProject.title}" 吗？此操作不可恢复！`)) {
        return;
    }

    try {
        await API.deleteProject(projectName);
        alert('项目已删除');
        window.location.href = '/';
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// ==================== 人物管理 ====================

async function openCharacterModal(charName = null) {
    const modal = document.getElementById('character-modal');
    const form = document.getElementById('character-form');
    const title = document.getElementById('character-modal-title');

    form.reset();
    document.getElementById('char-image-preview').classList.add('hidden');
    document.getElementById('char-image-version-prompt').classList.add('hidden');

    let hasImage = false;

    if (charName && currentProject.characters[charName]) {
        const char = currentProject.characters[charName];
        title.textContent = '编辑人物';
        document.getElementById('char-edit-mode').value = 'edit';
        document.getElementById('char-original-name').value = charName;
        document.getElementById('char-name').value = charName;
        document.getElementById('char-description').value = char.description || '';
        document.getElementById('char-voice').value = char.voice_style || '';

        if (char.character_sheet) {
            const preview = document.getElementById('char-image-preview');
            preview.querySelector('img').src = `${API.getFileUrl(projectName, char.character_sheet)}?t=${cacheBuster}`;
            preview.classList.remove('hidden');
            hasImage = true;
        }

        // 初始化版本控制
        await initCharacterVersionControls(charName, hasImage);
    } else {
        title.textContent = '添加人物';
        document.getElementById('char-edit-mode').value = 'add';
        document.getElementById('char-original-name').value = '';

        // 重置版本选择器
        document.getElementById('char-image-version').innerHTML = '<option value="">无版本</option>';
        updateGenerateButton(document.getElementById('char-generate-btn'), false);
        document.getElementById('char-restore-btn').classList.add('hidden');
    }

    modal.classList.remove('hidden');
}

function editCharacter(name) {
    openCharacterModal(name);
}

async function saveCharacter() {
    const mode = document.getElementById('char-edit-mode').value;
    const originalName = document.getElementById('char-original-name').value;
    const name = document.getElementById('char-name').value.trim();
    const description = document.getElementById('char-description').value.trim();
    const voiceStyle = document.getElementById('char-voice').value.trim();
    const imageInput = document.getElementById('char-image-input');

    if (!name || !description) {
        alert('请填写必填字段');
        return;
    }

    try {
        // 如果有新图片，先上传
        let characterSheet = null;
        if (imageInput.files.length > 0) {
            const result = await API.uploadFile(projectName, 'character', imageInput.files[0], name);
            characterSheet = result.path;
        }

        if (mode === 'add') {
            await API.addCharacter(projectName, name, description, voiceStyle);
            if (characterSheet) {
                await API.updateCharacter(projectName, name, { character_sheet: characterSheet });
            }
        } else {
            // 编辑模式
            if (originalName !== name) {
                // 名称变更，需要先删除旧的再添加新的
                await API.deleteCharacter(projectName, originalName);
                await API.addCharacter(projectName, name, description, voiceStyle);
            } else {
                await API.updateCharacter(projectName, name, { description, voice_style: voiceStyle });
            }
            if (characterSheet) {
                await API.updateCharacter(projectName, name, { character_sheet: characterSheet });
            }
        }

        closeAllModals();
        await loadProject();
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

async function deleteCharacter(name) {
    if (!confirm(`确定要删除人物 "${name}" 吗？`)) return;

    try {
        await API.deleteCharacter(projectName, name);
        await loadProject();
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// ==================== 线索管理 ====================

async function openClueModal(clueName = null) {
    const modal = document.getElementById('clue-modal');
    const form = document.getElementById('clue-form');
    const title = document.getElementById('clue-modal-title');

    form.reset();
    document.getElementById('clue-image-preview').classList.add('hidden');
    document.getElementById('clue-image-version-prompt').classList.add('hidden');

    let hasImage = false;

    if (clueName && currentProject.clues[clueName]) {
        const clue = currentProject.clues[clueName];
        title.textContent = '编辑线索';
        document.getElementById('clue-edit-mode').value = 'edit';
        document.getElementById('clue-original-name').value = clueName;
        document.getElementById('clue-name').value = clueName;
        document.getElementById('clue-type').value = clue.type || 'prop';
        document.getElementById('clue-importance').value = clue.importance || 'major';
        document.getElementById('clue-description').value = clue.description || '';

        if (clue.clue_sheet) {
            const preview = document.getElementById('clue-image-preview');
            preview.querySelector('img').src = `${API.getFileUrl(projectName, clue.clue_sheet)}?t=${cacheBuster}`;
            preview.classList.remove('hidden');
            hasImage = true;
        }

        // 初始化版本控制
        await initClueVersionControls(clueName, hasImage);
    } else {
        title.textContent = '添加线索';
        document.getElementById('clue-edit-mode').value = 'add';
        document.getElementById('clue-original-name').value = '';

        // 重置版本选择器
        document.getElementById('clue-image-version').innerHTML = '<option value="">无版本</option>';
        updateGenerateButton(document.getElementById('clue-generate-btn'), false);
        document.getElementById('clue-restore-btn').classList.add('hidden');
    }

    modal.classList.remove('hidden');
}

function editClue(name) {
    openClueModal(name);
}

async function saveClue() {
    const mode = document.getElementById('clue-edit-mode').value;
    const originalName = document.getElementById('clue-original-name').value;
    const name = document.getElementById('clue-name').value.trim();
    const clueType = document.getElementById('clue-type').value;
    const importance = document.getElementById('clue-importance').value;
    const description = document.getElementById('clue-description').value.trim();
    const imageInput = document.getElementById('clue-image-input');

    if (!name || !description) {
        alert('请填写必填字段');
        return;
    }

    try {
        // 如果有新图片，先上传
        let clueSheet = null;
        if (imageInput.files.length > 0) {
            const result = await API.uploadFile(projectName, 'clue', imageInput.files[0], name);
            clueSheet = result.path;
        }

        if (mode === 'add') {
            await API.addClue(projectName, name, clueType, description, importance);
            if (clueSheet) {
                await API.updateClue(projectName, name, { clue_sheet: clueSheet });
            }
        } else {
            if (originalName !== name) {
                await API.deleteClue(projectName, originalName);
                await API.addClue(projectName, name, clueType, description, importance);
            } else {
                await API.updateClue(projectName, name, { clue_type: clueType, description, importance });
            }
            if (clueSheet) {
                await API.updateClue(projectName, name, { clue_sheet: clueSheet });
            }
        }

        closeAllModals();
        await loadProject();
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

async function deleteClue(name) {
    if (!confirm(`确定要删除线索 "${name}" 吗？`)) return;

    try {
        await API.deleteClue(projectName, name);
        await loadProject();
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// ==================== 场景管理 ====================

let currentEditingSegment = null;

/**
 * 编辑片段（说书模式）
 */
async function editSegment(segmentId, scriptFile) {
    const script = currentScripts[scriptFile];
    if (!script) return;

    const segment = script.segments?.find(s => s.segment_id === segmentId);
    if (!segment) return;

    currentEditingSegment = { segmentId, scriptFile, segment };

    const modal = document.getElementById('segment-modal');
    document.getElementById('segment-modal-id').textContent = segmentId;
    document.getElementById('segment-id').value = segmentId;
    document.getElementById('segment-script-file').value = scriptFile;

    // 填充表单
    document.getElementById('segment-novel-text').textContent = segment.novel_text || '（无原文）';
    document.getElementById('segment-duration').value = segment.duration_seconds || 4;
    document.getElementById('segment-image-prompt').value = segment.image_prompt || '';
    document.getElementById('segment-video-prompt').value = segment.video_prompt || '';
    document.getElementById('segment-break').value = segment.segment_break ? 'true' : 'false';

    // 显示分镜图预览
    const assets = segment.generated_assets || {};
    const storyboardContainer = document.getElementById('segment-storyboard');
    const hasStoryboard = !!assets.storyboard_image;

    if (hasStoryboard) {
        const storyboardUrl = `${API.getFileUrl(projectName, assets.storyboard_image)}?t=${cacheBuster}`;
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
    const videoContainer = document.getElementById('segment-video');
    const hasVideo = !!assets.video_clip;
    if (hasVideo) {
        videoContainer.innerHTML = `<video src="${API.getFileUrl(projectName, assets.video_clip)}?t=${cacheBuster}" controls class="w-full h-full"></video>`;
    } else {
        videoContainer.innerHTML = '<span class="text-gray-500">暂无视频</span>';
    }

    modal.classList.remove('hidden');

    // 初始化版本控制
    await initSegmentVersionControls(segmentId, scriptFile, hasStoryboard, hasVideo);
}

/**
 * 保存片段
 */
async function saveSegment() {
    const segmentId = document.getElementById('segment-id').value;
    const scriptFile = document.getElementById('segment-script-file').value;

    const updates = {
        script_file: scriptFile,
        duration_seconds: parseInt(document.getElementById('segment-duration').value) || 4,
        segment_break: document.getElementById('segment-break').value === 'true',
        image_prompt: document.getElementById('segment-image-prompt').value,
        video_prompt: document.getElementById('segment-video-prompt').value
    };

    try {
        await API.updateSegment(projectName, segmentId, updates);
        closeAllModals();
        currentEditingSegment = null;
        await loadProject();
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

async function editScene(sceneId, scriptFile) {
    const script = currentScripts[scriptFile];
    if (!script) return;

    const scene = script.scenes?.find(s => s.scene_id === sceneId);
    if (!scene) return;

    const modal = document.getElementById('scene-modal');
    document.getElementById('scene-modal-title').textContent = `编辑场景 ${sceneId}`;
    document.getElementById('scene-id').value = sceneId;
    document.getElementById('scene-script-file').value = scriptFile;

    // 填充表单
    document.getElementById('scene-duration').value = scene.duration_seconds || 6;
    document.getElementById('scene-segment-break').value = scene.segment_break ? 'true' : 'false';
    document.getElementById('scene-image-prompt').value = scene.image_prompt || '';
    document.getElementById('scene-video-prompt').value = scene.video_prompt || '';

    // 显示预览
    const assets = scene.generated_assets || {};
    const storyboardContainer = document.getElementById('scene-storyboard');
    const videoContainer = document.getElementById('scene-video');
    const hasStoryboard = !!assets.storyboard_image;
    const hasVideo = !!assets.video_clip;

    if (hasStoryboard) {
        const storyboardUrl = `${API.getFileUrl(projectName, assets.storyboard_image)}?t=${cacheBuster}`;
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
        videoContainer.innerHTML = `<video src="${API.getFileUrl(projectName, assets.video_clip)}?t=${cacheBuster}" controls class="w-full h-full"></video>`;
    } else {
        videoContainer.innerHTML = '<span class="text-gray-500">暂无视频</span>';
    }

    modal.classList.remove('hidden');

    // 初始化版本控制
    await initSceneVersionControls(sceneId, scriptFile, hasStoryboard, hasVideo);
}

async function saveScene() {
    const sceneId = document.getElementById('scene-id').value;
    const scriptFile = document.getElementById('scene-script-file').value;

    const updates = {
        duration_seconds: parseInt(document.getElementById('scene-duration').value) || 6,
        segment_break: document.getElementById('scene-segment-break').value === 'true',
        image_prompt: document.getElementById('scene-image-prompt').value,
        video_prompt: document.getElementById('scene-video-prompt').value
    };

    try {
        await API.updateScene(projectName, sceneId, scriptFile, updates);
        closeAllModals();
        await loadProject();
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

// ==================== 工具函数 ====================

function closeAllModals() {
    document.querySelectorAll('[id$="-modal"]').forEach(modal => {
        modal.classList.add('hidden');
    });
}

function getPhaseClass(phase) {
    const classes = {
        'script': 'bg-yellow-600 text-yellow-100',
        'characters': 'bg-purple-600 text-purple-100',
        'clues': 'bg-pink-600 text-pink-100',
        'storyboard': 'bg-blue-600 text-blue-100',
        'video': 'bg-green-600 text-green-100',
        'compose': 'bg-teal-600 text-teal-100',
        'completed': 'bg-green-700 text-green-100'
    };
    return classes[phase] || 'bg-gray-600 text-gray-300';
}

function setupImageUpload(dropZoneId, inputId, previewId) {
    const dropZone = document.getElementById(dropZoneId);
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    dropZone.onclick = () => input.click();

    input.onchange = (e) => {
        if (e.target.files.length > 0) {
            showPreview(e.target.files[0], preview);
        }
    };

    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    };

    dropZone.ondragleave = () => {
        dropZone.classList.remove('dragover');
    };

    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            input.files = e.dataTransfer.files;
            showPreview(e.dataTransfer.files[0], preview);
        }
    };
}

function showPreview(file, previewEl) {
    const reader = new FileReader();
    reader.onload = (e) => {
        previewEl.querySelector('img').src = e.target.result;
        previewEl.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

// ==================== Lightbox ====================

/**
 * 打开图片放大查看
 */
function openLightbox(imageUrl, title) {
    const lightbox = document.getElementById('image-lightbox');
    document.getElementById('lightbox-image').src = imageUrl;
    document.getElementById('lightbox-title').textContent = title || '';
    lightbox.classList.remove('hidden');
}

/**
 * 关闭图片放大查看
 */
function closeLightbox() {
    document.getElementById('image-lightbox').classList.add('hidden');
}

// ==================== Source 文件管理 ====================

/**
 * 渲染源文件列表
 */
async function renderSourceFiles() {
    const container = document.getElementById('source-files-list');
    try {
        const data = await API.listFiles(projectName);
        const files = data.files?.source || [];

        if (files.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">暂无源文件，点击「新建」或「上传」添加</p>';
            return;
        }

        container.innerHTML = files.map(file => `
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
        `).join('');
    } catch (error) {
        container.innerHTML = '<p class="text-red-400 text-sm">加载失败: ' + error.message + '</p>';
    }
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * 新建源文件
 */
function newSourceFile() {
    document.getElementById('source-modal-title').textContent = '新建源文件';
    document.getElementById('source-original-name').value = '';
    document.getElementById('source-filename').value = '';
    document.getElementById('source-filename').disabled = false;
    document.getElementById('source-content').value = '';
    document.getElementById('source-modal').classList.remove('hidden');
}

/**
 * 编辑源文件
 */
async function editSourceFile(filename) {
    try {
        const content = await API.getSourceContent(projectName, filename);
        document.getElementById('source-modal-title').textContent = `编辑: ${filename}`;
        document.getElementById('source-original-name').value = filename;
        document.getElementById('source-filename').value = filename;
        document.getElementById('source-filename').disabled = true;
        document.getElementById('source-content').value = content;
        document.getElementById('source-modal').classList.remove('hidden');
    } catch (error) {
        alert('加载文件失败: ' + error.message);
    }
}

/**
 * 保存源文件
 */
async function saveSourceFile() {
    const filename = document.getElementById('source-filename').value.trim();
    const content = document.getElementById('source-content').value;

    if (!filename) {
        alert('请输入文件名');
        return;
    }

    // 确保文件名以 .txt 或 .md 结尾
    let finalFilename = filename;
    if (!filename.endsWith('.txt') && !filename.endsWith('.md')) {
        finalFilename = filename + '.txt';
    }

    try {
        await API.saveSourceFile(projectName, finalFilename, content);
        closeAllModals();
        await renderSourceFiles();
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

/**
 * 删除源文件
 */
async function deleteSourceFile(filename) {
    if (!confirm(`确定要删除 "${filename}" 吗？`)) return;

    try {
        await API.deleteSourceFile(projectName, filename);
        await renderSourceFiles();
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

/**
 * 处理源文件上传
 */
async function handleSourceUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        await API.uploadFile(projectName, 'source', file);
        await renderSourceFiles();
        e.target.value = ''; // 重置 input

        // 上传成功后尝试自动生成概述
        await tryAutoGenerateOverview();
    } catch (error) {
        alert('上传失败: ' + error.message);
    }
}

// ==================== 草稿管理 ====================

/**
 * 切换草稿编辑/预览模式
 * @param {string} mode - 'edit' 或 'preview'
 */
function toggleDraftMode(mode) {
    const textarea = document.getElementById('draft-content');
    const preview = document.getElementById('draft-preview');
    const editBtn = document.getElementById('draft-mode-edit');
    const previewBtn = document.getElementById('draft-mode-preview');

    if (mode === 'edit') {
        textarea.classList.remove('hidden');
        preview.classList.add('hidden');
        editBtn.classList.remove('bg-gray-600', 'text-gray-300');
        editBtn.classList.add('bg-blue-600', 'text-white');
        previewBtn.classList.remove('bg-blue-600', 'text-white');
        previewBtn.classList.add('bg-gray-600', 'text-gray-300');
    } else {
        textarea.classList.add('hidden');
        preview.classList.remove('hidden');
        preview.innerHTML = marked.parse(textarea.value || '*无内容*');
        editBtn.classList.remove('bg-blue-600', 'text-white');
        editBtn.classList.add('bg-gray-600', 'text-gray-300');
        previewBtn.classList.remove('bg-gray-600', 'text-gray-300');
        previewBtn.classList.add('bg-blue-600', 'text-white');
    }
}

/**
 * 打开草稿编辑模态框
 * @param {number} episode - 剧集编号
 * @param {number} stepNum - 步骤编号 (1, 2, 3)
 * @param {boolean} exists - 草稿文件是否存在
 * @param {string} contentMode - 内容模式 ('narration' 或 'drama')
 */
async function openDraftModal(episode, stepNum, exists, contentMode) {
    const modal = document.getElementById('draft-modal');
    // 根据 content_mode 选择不同的步骤名称
    const stepNames = contentMode === 'narration' ? {
        1: '片段拆分',
        2: '宫格切分规划',
        3: '角色表/线索表'
    } : {
        1: '规范化剧本',
        2: '镜头预算表',
        3: '角色表/线索表'
    };

    document.getElementById('draft-modal-title').textContent = `Step ${stepNum}: ${stepNames[stepNum]} (第 ${episode} 集)`;
    document.getElementById('draft-episode').value = episode;
    document.getElementById('draft-step').value = stepNum;

    if (exists) {
        try {
            const content = await API.getDraftContent(projectName, episode, stepNum);
            document.getElementById('draft-content').value = content;
            // 有内容时默认显示预览模式
            if (content && content.trim()) {
                toggleDraftMode('preview');
            } else {
                toggleDraftMode('edit');
            }
        } catch (error) {
            document.getElementById('draft-content').value = '';
            toggleDraftMode('edit');
            console.error('加载草稿失败:', error);
        }
    } else {
        document.getElementById('draft-content').value = '';
        // 无内容时默认显示编辑模式
        toggleDraftMode('edit');
    }

    modal.classList.remove('hidden');
}

/**
 * 保存草稿
 */
async function saveDraft() {
    const episode = document.getElementById('draft-episode').value;
    const stepNum = document.getElementById('draft-step').value;
    const content = document.getElementById('draft-content').value;

    try {
        await API.saveDraft(projectName, episode, stepNum, content);
        closeAllModals();
        await loadProject();
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

// ==================== 项目概述管理 ====================

/**
 * 保存项目概述（手动编辑）
 */
async function saveOverview() {
    try {
        const updates = {
            synopsis: document.getElementById('edit-synopsis').value.trim(),
            genre: document.getElementById('edit-genre').value.trim(),
            theme: document.getElementById('edit-theme').value.trim(),
            world_setting: document.getElementById('edit-world-setting').value.trim()
        };

        await API.updateOverview(projectName, updates);

        // 更新本地数据
        if (!currentProject.overview) {
            currentProject.overview = {};
        }
        Object.assign(currentProject.overview, updates);

        alert('概述已保存');
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

/**
 * 重新生成项目概述
 */
async function regenerateOverview() {
    if (!confirm('确定要重新生成项目概述吗？这将覆盖当前内容。')) {
        return;
    }

    const btn = document.getElementById('regenerate-overview-btn');
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

        const result = await API.generateOverview(projectName);

        // 更新本地数据
        currentProject.overview = result.overview;

        // 重新渲染
        renderOverviewSection();

        alert('概述已重新生成');
    } catch (error) {
        alert('生成失败: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

/**
 * 上传源文件后自动生成概述（如果概述为空）
 */
async function tryAutoGenerateOverview() {
    // 检查是否已有概述
    const overview = currentProject.overview || {};
    const hasOverview = overview.synopsis || overview.genre || overview.theme || overview.world_setting;

    if (hasOverview) {
        return; // 已有概述，不自动生成
    }

    // 检查是否有源文件
    try {
        const data = await API.listFiles(projectName);
        const sourceFiles = data.files?.source || [];

        if (sourceFiles.length === 0) {
            return; // 没有源文件
        }

        // 自动生成概述
        console.log('检测到源文件，自动生成项目概述...');

        const btn = document.getElementById('regenerate-overview-btn');
        const originalContent = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = `
            <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>自动生成中...</span>
        `;

        const result = await API.generateOverview(projectName);
        currentProject.overview = result.overview;
        renderOverviewSection();

        btn.disabled = false;
        btn.innerHTML = originalContent;

        console.log('项目概述已自动生成');
    } catch (error) {
        console.error('自动生成概述失败:', error);
    }
}

// ==================== 版本管理与生成功能 ====================

/**
 * 当前版本缓存
 */
let currentVersions = {
    storyboards: {},
    videos: {},
    characters: {},
    clues: {}
};

/**
 * 加载资源版本列表
 * @param {string} resourceType - 资源类型
 * @param {string} resourceId - 资源 ID
 */
async function loadVersions(resourceType, resourceId) {
    try {
        const data = await API.getVersions(projectName, resourceType, resourceId);
        currentVersions[resourceType][resourceId] = data;
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

    selectEl.innerHTML = versions.map(v => {
        const date = new Date(v.created_at);
        const dateStr = `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        const isCurrent = v.version === currentVersion;
        return `<option value="${v.version}" ${isCurrent ? 'selected' : ''}>v${v.version} (${dateStr})${isCurrent ? ' ✓当前' : ''}</option>`;
    }).join('');
}

/**
 * 更新生成按钮状态
 * @param {HTMLButtonElement} btn - 按钮元素
 * @param {boolean} hasImage - 是否已有图片/视频
 * @param {boolean} loading - 是否加载中
 */
function updateGenerateButton(btn, hasImage, loading = false) {
    // 避免多次调用导致 className 不断累积 hover/bg 类
    btn.classList.remove(
        'bg-green-600', 'bg-blue-600', 'bg-gray-600',
        'hover:bg-green-700', 'hover:bg-blue-700', 'hover:bg-gray-700'
    );

    if (loading) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
        btn.classList.add('bg-gray-600');
    } else {
        btn.disabled = false;
        if (hasImage) {
            btn.innerHTML = '<span>重新生成</span>';
            btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        } else {
            btn.innerHTML = '<span>生成</span>';
            btn.classList.add('bg-green-600', 'hover:bg-green-700');
        }
    }
}

/**
 * 显示/隐藏还原按钮
 */
function updateRestoreButton(restoreBtn, versionSelect, currentVersion) {
    const selectedVersion = parseInt(versionSelect.value);
    if (selectedVersion && selectedVersion !== currentVersion) {
        restoreBtn.classList.remove('hidden');
    } else {
        restoreBtn.classList.add('hidden');
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
async function initSegmentVersionControls(segmentId, scriptFile, hasStoryboard, hasVideo) {
    // 加载版本列表
    const storyboardVersions = await loadVersions('storyboards', segmentId);
    const videoVersions = await loadVersions('videos', segmentId);

    // 渲染分镜图版本选择器
    const storyboardSelect = document.getElementById('segment-storyboard-version');
    renderVersionSelector(storyboardSelect, storyboardVersions.versions, storyboardVersions.current_version);

    // 渲染视频版本选择器
    const videoSelect = document.getElementById('segment-video-version');
    renderVersionSelector(videoSelect, videoVersions.versions, videoVersions.current_version);

    // 更新生成按钮
    const storyboardBtn = document.getElementById('segment-generate-storyboard-btn');
    const videoBtn = document.getElementById('segment-generate-video-btn');
    updateGenerateButton(storyboardBtn, hasStoryboard);
    updateGenerateButton(videoBtn, hasVideo);

    // 版本选择器事件
    storyboardSelect.onchange = () => handleSegmentVersionChange('storyboard', segmentId);
    videoSelect.onchange = () => handleSegmentVersionChange('video', segmentId);

    // 生成按钮事件
    storyboardBtn.onclick = () => generateSegmentStoryboard(segmentId, scriptFile);
    videoBtn.onclick = () => generateSegmentVideo(segmentId, scriptFile);

    // 还原按钮事件
    document.getElementById('segment-restore-storyboard-btn').onclick = () => restoreSegmentVersion('storyboards', segmentId);
    document.getElementById('segment-restore-video-btn').onclick = () => restoreSegmentVersion('videos', segmentId);

    // 初始化还原按钮状态
    updateRestoreButton(
        document.getElementById('segment-restore-storyboard-btn'),
        storyboardSelect,
        storyboardVersions.current_version
    );
    updateRestoreButton(
        document.getElementById('segment-restore-video-btn'),
        videoSelect,
        videoVersions.current_version
    );
}

/**
 * 处理片段版本选择变更
 */
async function handleSegmentVersionChange(type, segmentId) {
    const resourceType = type === 'storyboard' ? 'storyboards' : 'videos';
    const versionSelect = document.getElementById(`segment-${type}-version`);
    const restoreBtn = document.getElementById(`segment-restore-${type}-btn`);
    const promptEl = document.getElementById(`segment-${type}-version-prompt`);
    const previewContainer = document.getElementById(`segment-${type === 'storyboard' ? 'storyboard' : 'video'}`);

    const selectedVersion = parseInt(versionSelect.value);
    const versionData = currentVersions[resourceType][segmentId];

    if (!selectedVersion || !versionData) {
        promptEl.classList.add('hidden');
        return;
    }

    // 找到选中的版本
    const version = versionData.versions.find(v => v.version === selectedVersion);
    if (version) {
        // 显示版本 prompt
        promptEl.textContent = `版本 prompt: ${version.prompt?.substring(0, 100) || ''}...`;
        promptEl.classList.remove('hidden');

        // 更新预览图
        if (type === 'storyboard') {
            const url = `${API.getFileUrl(projectName, version.file)}?t=${Date.now()}`;
            previewContainer.innerHTML = `
                <div class="relative group w-full h-full">
                    <img src="${url}" class="w-full h-full object-cover cursor-pointer" onclick="openLightbox('${url}', '分镜图 v${selectedVersion}')">
                </div>`;
        } else {
            const url = `${API.getFileUrl(projectName, version.file)}?t=${Date.now()}`;
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
    const prompt = document.getElementById('segment-image-prompt').value;
    if (!prompt.trim()) {
        alert('请输入分镜图 Prompt');
        return;
    }

    const btn = document.getElementById('segment-generate-storyboard-btn');
    const loadingEl = document.getElementById('segment-storyboard-loading');
    const hadStoryboard = !!document.getElementById('segment-storyboard').querySelector('img');
    let succeeded = false;

    try {
        updateGenerateButton(btn, hadStoryboard, true);
        loadingEl.classList.remove('hidden');

        const result = await API.generateStoryboard(projectName, segmentId, prompt, scriptFile);
        succeeded = true;

        // 刷新预览和版本列表
        cacheBuster = Date.now();
        await initSegmentVersionControls(segmentId, scriptFile, true, !!currentEditingSegment?.segment?.generated_assets?.video_clip);

        // 更新预览
        const storyboardUrl = `${API.getFileUrl(projectName, result.file_path)}?t=${cacheBuster}`;
        document.getElementById('segment-storyboard').innerHTML = `
            <div class="relative group w-full h-full">
                <img src="${storyboardUrl}" class="w-full h-full object-cover cursor-pointer" onclick="openLightbox('${storyboardUrl}', '分镜图 ${segmentId}')">
            </div>`;

        alert(`分镜图生成成功！版本: v${result.version}`);
    } catch (error) {
        alert('生成失败: ' + error.message);
    } finally {
        updateGenerateButton(btn, succeeded || hadStoryboard, false);
        loadingEl.classList.add('hidden');
    }
}

/**
 * 生成片段视频
 */
async function generateSegmentVideo(segmentId, scriptFile) {
    const prompt = document.getElementById('segment-video-prompt').value;
    if (!prompt.trim()) {
        alert('请输入视频 Prompt');
        return;
    }

    const duration = parseInt(document.getElementById('segment-duration').value) || 4;
    const btn = document.getElementById('segment-generate-video-btn');
    const loadingEl = document.getElementById('segment-video-loading');
    const hadVideo = !!document.getElementById('segment-video').querySelector('video');
    let succeeded = false;

    try {
        updateGenerateButton(btn, hadVideo, true);
        loadingEl.classList.remove('hidden');

        const result = await API.generateVideo(projectName, segmentId, prompt, scriptFile, duration);
        succeeded = true;

        // 刷新版本列表
        cacheBuster = Date.now();
        await initSegmentVersionControls(segmentId, scriptFile, true, true);

        // 更新预览
        const videoUrl = `${API.getFileUrl(projectName, result.file_path)}?t=${cacheBuster}`;
        document.getElementById('segment-video').innerHTML = `<video src="${videoUrl}" controls class="w-full h-full"></video>`;

        alert(`视频生成成功！版本: v${result.version}`);
    } catch (error) {
        alert('生成失败: ' + error.message);
    } finally {
        updateGenerateButton(btn, succeeded || hadVideo, false);
        loadingEl.classList.add('hidden');
    }
}

/**
 * 还原片段版本
 */
async function restoreSegmentVersion(resourceType, segmentId) {
    const type = resourceType === 'storyboards' ? 'storyboard' : 'video';
    const versionSelect = document.getElementById(`segment-${type}-version`);
    const selectedVersion = parseInt(versionSelect.value);

    if (!selectedVersion) return;

    if (!confirm(`确定要还原到 v${selectedVersion} 吗？`)) return;

    try {
        const result = await API.restoreVersion(projectName, resourceType, segmentId, selectedVersion);

        // 将还原的 prompt 填充到编辑框
        if (resourceType === 'storyboards') {
            document.getElementById('segment-image-prompt').value = result.prompt || '';
        } else {
            document.getElementById('segment-video-prompt').value = result.prompt || '';
        }

        // 刷新
        cacheBuster = Date.now();
        const scriptFile = document.getElementById('segment-script-file').value;
        await initSegmentVersionControls(segmentId, scriptFile, true, true);

        alert(`已还原到 v${selectedVersion}`);
    } catch (error) {
        alert('还原失败: ' + error.message);
    }
}

// ==================== 场景模态框版本和生成（类似片段） ====================

async function initSceneVersionControls(sceneId, scriptFile, hasStoryboard, hasVideo) {
    const storyboardVersions = await loadVersions('storyboards', sceneId);
    const videoVersions = await loadVersions('videos', sceneId);

    renderVersionSelector(document.getElementById('scene-storyboard-version'), storyboardVersions.versions, storyboardVersions.current_version);
    renderVersionSelector(document.getElementById('scene-video-version'), videoVersions.versions, videoVersions.current_version);

    const storyboardBtn = document.getElementById('scene-generate-storyboard-btn');
    const videoBtn = document.getElementById('scene-generate-video-btn');
    updateGenerateButton(storyboardBtn, hasStoryboard);
    updateGenerateButton(videoBtn, hasVideo);

    document.getElementById('scene-storyboard-version').onchange = () => handleSceneVersionChange('storyboard', sceneId);
    document.getElementById('scene-video-version').onchange = () => handleSceneVersionChange('video', sceneId);

    storyboardBtn.onclick = () => generateSceneStoryboard(sceneId, scriptFile);
    videoBtn.onclick = () => generateSceneVideo(sceneId, scriptFile);

    document.getElementById('scene-restore-storyboard-btn').onclick = () => restoreSceneVersion('storyboards', sceneId);
    document.getElementById('scene-restore-video-btn').onclick = () => restoreSceneVersion('videos', sceneId);

    updateRestoreButton(document.getElementById('scene-restore-storyboard-btn'), document.getElementById('scene-storyboard-version'), storyboardVersions.current_version);
    updateRestoreButton(document.getElementById('scene-restore-video-btn'), document.getElementById('scene-video-version'), videoVersions.current_version);
}

async function handleSceneVersionChange(type, sceneId) {
    const resourceType = type === 'storyboard' ? 'storyboards' : 'videos';
    const versionSelect = document.getElementById(`scene-${type}-version`);
    const restoreBtn = document.getElementById(`scene-restore-${type}-btn`);
    const promptEl = document.getElementById(`scene-${type}-version-prompt`);
    const previewContainer = document.getElementById(`scene-${type === 'storyboard' ? 'storyboard' : 'video'}`);

    const selectedVersion = parseInt(versionSelect.value);
    const versionData = currentVersions[resourceType][sceneId];

    if (!selectedVersion || !versionData) {
        promptEl.classList.add('hidden');
        return;
    }

    const version = versionData.versions.find(v => v.version === selectedVersion);
    if (version) {
        promptEl.textContent = `版本 prompt: ${version.prompt?.substring(0, 100) || ''}...`;
        promptEl.classList.remove('hidden');

        if (type === 'storyboard') {
            const url = `${API.getFileUrl(projectName, version.file)}?t=${Date.now()}`;
            previewContainer.innerHTML = `<div class="relative group w-full h-full"><img src="${url}" class="w-full h-full object-contain cursor-pointer" onclick="openLightbox('${url}', '分镜图 v${selectedVersion}')"></div>`;
        } else {
            const url = `${API.getFileUrl(projectName, version.file)}?t=${Date.now()}`;
            previewContainer.innerHTML = `<video src="${url}" controls class="w-full h-full"></video>`;
        }
    }

    updateRestoreButton(restoreBtn, versionSelect, versionData.current_version);
}

async function generateSceneStoryboard(sceneId, scriptFile) {
    const prompt = document.getElementById('scene-image-prompt').value;
    if (!prompt.trim()) { alert('请输入分镜图 Prompt'); return; }

    const btn = document.getElementById('scene-generate-storyboard-btn');
    const loadingEl = document.getElementById('scene-storyboard-loading');
    const hadStoryboard = !!document.getElementById('scene-storyboard').querySelector('img');
    let succeeded = false;

    try {
        updateGenerateButton(btn, hadStoryboard, true);
        loadingEl.classList.remove('hidden');
        const result = await API.generateStoryboard(projectName, sceneId, prompt, scriptFile);
        succeeded = true;
        cacheBuster = Date.now();
        await initSceneVersionControls(sceneId, scriptFile, true, !!document.getElementById('scene-video').querySelector('video'));
        const url = `${API.getFileUrl(projectName, result.file_path)}?t=${cacheBuster}`;
        document.getElementById('scene-storyboard').innerHTML = `<div class="relative group w-full h-full"><img src="${url}" class="w-full h-full object-contain cursor-pointer" onclick="openLightbox('${url}', '分镜图 ${sceneId}')"></div>`;
        alert(`分镜图生成成功！版本: v${result.version}`);
    } catch (error) {
        alert('生成失败: ' + error.message);
    } finally {
        updateGenerateButton(btn, succeeded || hadStoryboard, false);
        loadingEl.classList.add('hidden');
    }
}

async function generateSceneVideo(sceneId, scriptFile) {
    const prompt = document.getElementById('scene-video-prompt').value;
    if (!prompt.trim()) { alert('请输入视频 Prompt'); return; }

    const durationInput = document.getElementById('scene-duration');
    const duration = normalizeVeoDurationSeconds(durationInput.value, 6);
    durationInput.value = String(duration);
    const btn = document.getElementById('scene-generate-video-btn');
    const loadingEl = document.getElementById('scene-video-loading');
    const hadVideo = !!document.getElementById('scene-video').querySelector('video');
    let succeeded = false;

    try {
        updateGenerateButton(btn, hadVideo, true);
        loadingEl.classList.remove('hidden');
        const result = await API.generateVideo(projectName, sceneId, prompt, scriptFile, duration);
        succeeded = true;
        cacheBuster = Date.now();
        await initSceneVersionControls(sceneId, scriptFile, true, true);
        const url = `${API.getFileUrl(projectName, result.file_path)}?t=${cacheBuster}`;
        document.getElementById('scene-video').innerHTML = `<video src="${url}" controls class="w-full h-full"></video>`;
        alert(`视频生成成功！版本: v${result.version}`);
    } catch (error) {
        alert('生成失败: ' + error.message);
    } finally {
        updateGenerateButton(btn, succeeded || hadVideo, false);
        loadingEl.classList.add('hidden');
    }
}

async function restoreSceneVersion(resourceType, sceneId) {
    const type = resourceType === 'storyboards' ? 'storyboard' : 'video';
    const versionSelect = document.getElementById(`scene-${type}-version`);
    const selectedVersion = parseInt(versionSelect.value);
    if (!selectedVersion) return;
    if (!confirm(`确定要还原到 v${selectedVersion} 吗？`)) return;

    try {
        const result = await API.restoreVersion(projectName, resourceType, sceneId, selectedVersion);
        if (resourceType === 'storyboards') {
            document.getElementById('scene-image-prompt').value = result.prompt || '';
        } else {
            document.getElementById('scene-video-prompt').value = result.prompt || '';
        }
        cacheBuster = Date.now();
        const scriptFile = document.getElementById('scene-script-file').value;
        await initSceneVersionControls(sceneId, scriptFile, true, true);
        alert(`已还原到 v${selectedVersion}`);
    } catch (error) {
        alert('还原失败: ' + error.message);
    }
}

// ==================== 人物设计图版本和生成 ====================

async function initCharacterVersionControls(charName, hasImage) {
    const versions = await loadVersions('characters', charName);
    renderVersionSelector(document.getElementById('char-image-version'), versions.versions, versions.current_version);

    const btn = document.getElementById('char-generate-btn');
    updateGenerateButton(btn, hasImage);

    document.getElementById('char-image-version').onchange = () => handleCharacterVersionChange(charName);
    btn.onclick = () => generateCharacterImage(charName);
    document.getElementById('char-restore-btn').onclick = () => restoreCharacterVersion(charName);

    updateRestoreButton(document.getElementById('char-restore-btn'), document.getElementById('char-image-version'), versions.current_version);
}

async function handleCharacterVersionChange(charName) {
    const versionSelect = document.getElementById('char-image-version');
    const restoreBtn = document.getElementById('char-restore-btn');
    const promptEl = document.getElementById('char-image-version-prompt');
    const previewEl = document.getElementById('char-image-preview');

    const selectedVersion = parseInt(versionSelect.value);
    const versionData = currentVersions.characters[charName];

    if (!selectedVersion || !versionData) {
        promptEl.classList.add('hidden');
        return;
    }

    const version = versionData.versions.find(v => v.version === selectedVersion);
    if (version) {
        promptEl.textContent = `版本 prompt: ${version.prompt?.substring(0, 80) || ''}...`;
        promptEl.classList.remove('hidden');

        const url = `${API.getFileUrl(projectName, version.file)}?t=${Date.now()}`;
        previewEl.querySelector('img').src = url;
        previewEl.classList.remove('hidden');
    }

    updateRestoreButton(restoreBtn, versionSelect, versionData.current_version);
}

async function generateCharacterImage(charName) {
    const prompt = document.getElementById('char-description').value;
    if (!prompt.trim()) { alert('请输入人物描述'); return; }

    const btn = document.getElementById('char-generate-btn');
    const loadingEl = document.getElementById('char-image-loading');
    const hadImage = !document.getElementById('char-image-preview').classList.contains('hidden');
    let succeeded = false;

    try {
        updateGenerateButton(btn, hadImage, true);
        loadingEl.classList.remove('hidden');
        const result = await API.generateCharacter(projectName, charName, prompt);
        succeeded = true;
        cacheBuster = Date.now();
        await initCharacterVersionControls(charName, true);
        const url = `${API.getFileUrl(projectName, result.file_path)}?t=${cacheBuster}`;
        const previewEl = document.getElementById('char-image-preview');
        previewEl.querySelector('img').src = url;
        previewEl.classList.remove('hidden');
        alert(`人物设计图生成成功！版本: v${result.version}`);
    } catch (error) {
        alert('生成失败: ' + error.message);
    } finally {
        updateGenerateButton(btn, succeeded || hadImage, false);
        loadingEl.classList.add('hidden');
    }
}

async function restoreCharacterVersion(charName) {
    const versionSelect = document.getElementById('char-image-version');
    const selectedVersion = parseInt(versionSelect.value);
    if (!selectedVersion) return;
    if (!confirm(`确定要还原到 v${selectedVersion} 吗？`)) return;

    try {
        const result = await API.restoreVersion(projectName, 'characters', charName, selectedVersion);
        document.getElementById('char-description').value = result.prompt || '';
        cacheBuster = Date.now();
        await initCharacterVersionControls(charName, true);
        alert(`已还原到 v${selectedVersion}`);
    } catch (error) {
        alert('还原失败: ' + error.message);
    }
}

// ==================== 线索设计图版本和生成 ====================

async function initClueVersionControls(clueName, hasImage) {
    const versions = await loadVersions('clues', clueName);
    renderVersionSelector(document.getElementById('clue-image-version'), versions.versions, versions.current_version);

    const btn = document.getElementById('clue-generate-btn');
    updateGenerateButton(btn, hasImage);

    document.getElementById('clue-image-version').onchange = () => handleClueVersionChange(clueName);
    btn.onclick = () => generateClueImage(clueName);
    document.getElementById('clue-restore-btn').onclick = () => restoreClueVersion(clueName);

    updateRestoreButton(document.getElementById('clue-restore-btn'), document.getElementById('clue-image-version'), versions.current_version);
}

async function handleClueVersionChange(clueName) {
    const versionSelect = document.getElementById('clue-image-version');
    const restoreBtn = document.getElementById('clue-restore-btn');
    const promptEl = document.getElementById('clue-image-version-prompt');
    const previewEl = document.getElementById('clue-image-preview');

    const selectedVersion = parseInt(versionSelect.value);
    const versionData = currentVersions.clues[clueName];

    if (!selectedVersion || !versionData) {
        promptEl.classList.add('hidden');
        return;
    }

    const version = versionData.versions.find(v => v.version === selectedVersion);
    if (version) {
        promptEl.textContent = `版本 prompt: ${version.prompt?.substring(0, 80) || ''}...`;
        promptEl.classList.remove('hidden');

        const url = `${API.getFileUrl(projectName, version.file)}?t=${Date.now()}`;
        previewEl.querySelector('img').src = url;
        previewEl.classList.remove('hidden');
    }

    updateRestoreButton(restoreBtn, versionSelect, versionData.current_version);
}

async function generateClueImage(clueName) {
    const prompt = document.getElementById('clue-description').value;
    if (!prompt.trim()) { alert('请输入线索描述'); return; }

    const btn = document.getElementById('clue-generate-btn');
    const loadingEl = document.getElementById('clue-image-loading');
    const hadImage = !document.getElementById('clue-image-preview').classList.contains('hidden');
    let succeeded = false;

    try {
        updateGenerateButton(btn, hadImage, true);
        loadingEl.classList.remove('hidden');
        const result = await API.generateClue(projectName, clueName, prompt);
        succeeded = true;
        cacheBuster = Date.now();
        await initClueVersionControls(clueName, true);
        const url = `${API.getFileUrl(projectName, result.file_path)}?t=${cacheBuster}`;
        const previewEl = document.getElementById('clue-image-preview');
        previewEl.querySelector('img').src = url;
        previewEl.classList.remove('hidden');
        alert(`线索设计图生成成功！版本: v${result.version}`);
    } catch (error) {
        alert('生成失败: ' + error.message);
    } finally {
        updateGenerateButton(btn, succeeded || hadImage, false);
        loadingEl.classList.add('hidden');
    }
}

async function restoreClueVersion(clueName) {
    const versionSelect = document.getElementById('clue-image-version');
    const selectedVersion = parseInt(versionSelect.value);
    if (!selectedVersion) return;
    if (!confirm(`确定要还原到 v${selectedVersion} 吗？`)) return;

    try {
        const result = await API.restoreVersion(projectName, 'clues', clueName, selectedVersion);
        document.getElementById('clue-description').value = result.prompt || '';
        cacheBuster = Date.now();
        await initClueVersionControls(clueName, true);
        alert(`已还原到 v${selectedVersion}`);
    } catch (error) {
        alert('还原失败: ' + error.message);
    }
}
