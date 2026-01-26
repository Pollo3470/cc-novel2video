/**
 * 项目详情页逻辑
 */

let currentProject = null;
let currentScripts = {};
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
    document.title = `${currentProject.title} - 漫剧项目管理`;
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
 * 渲染概览页
 */
function renderOverview() {
    // 填充表单
    document.getElementById('edit-title').value = currentProject.title || '';
    document.getElementById('edit-style').value = currentProject.style || '';

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
                <p class="text-sm mt-2">使用 /novel-to-script 命令生成剧本</p>
            </div>
        `;
        return;
    }

    container.innerHTML = episodes.map(ep => {
        const scriptFile = ep.script_file?.replace('scripts/', '') || '';
        const script = currentScripts[scriptFile] || {};
        const scenes = script.scenes || [];

        const statusClass = {
            'draft': 'bg-gray-600',
            'in_production': 'bg-yellow-600',
            'completed': 'bg-green-600'
        }[ep.status] || 'bg-gray-600';

        return `
            <div class="bg-gray-800 rounded-lg overflow-hidden">
                <div class="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-750" onclick="toggleEpisode(this)">
                    <div class="flex items-center space-x-4">
                        <span class="text-xl font-bold text-gray-400">E${ep.episode}</span>
                        <div>
                            <h3 class="font-semibold text-white">${ep.title || `第 ${ep.episode} 集`}</h3>
                            <p class="text-sm text-gray-400">${ep.scenes_count || 0} 个场景</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-4">
                        <span class="px-2 py-1 text-xs rounded ${statusClass}">${ep.status === 'completed' ? '已完成' : ep.status === 'in_production' ? '制作中' : '草稿'}</span>
                        <svg class="h-5 w-5 text-gray-400 transform transition-transform episode-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>
                <div class="episode-content hidden border-t border-gray-700 p-4">
                    <div class="scene-grid">
                        ${scenes.map(scene => renderSceneCard(scene, scriptFile)).join('')}
                    </div>
                </div>
            </div>
        `;
    }).join('');
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

    // 关闭模态框
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = closeAllModals;
    });

    // 点击背景关闭模态框
    ['character-modal', 'clue-modal', 'scene-modal', 'source-modal'].forEach(id => {
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
        const updates = {
            title: document.getElementById('edit-title').value.trim(),
            style: document.getElementById('edit-style').value.trim()
        };

        await API.updateProject(projectName, updates);
        currentProject.title = updates.title;
        currentProject.style = updates.style;
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

function openCharacterModal(charName = null) {
    const modal = document.getElementById('character-modal');
    const form = document.getElementById('character-form');
    const title = document.getElementById('character-modal-title');

    form.reset();
    document.getElementById('char-image-preview').classList.add('hidden');

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
        }
    } else {
        title.textContent = '添加人物';
        document.getElementById('char-edit-mode').value = 'add';
        document.getElementById('char-original-name').value = '';
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

function openClueModal(clueName = null) {
    const modal = document.getElementById('clue-modal');
    const form = document.getElementById('clue-form');
    const title = document.getElementById('clue-modal-title');

    form.reset();
    document.getElementById('clue-image-preview').classList.add('hidden');

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
        }
    } else {
        title.textContent = '添加线索';
        document.getElementById('clue-edit-mode').value = 'add';
        document.getElementById('clue-original-name').value = '';
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

function editScene(sceneId, scriptFile) {
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
    document.getElementById('scene-visual-desc').value = scene.visual?.description || '';
    document.getElementById('scene-shot-type').value = scene.visual?.shot_type || '';
    document.getElementById('scene-mood').value = scene.visual?.mood || '';
    document.getElementById('scene-dialogue').value = scene.dialogue?.text || '';
    document.getElementById('scene-speaker').value = scene.dialogue?.speaker || '';

    // 显示预览
    const assets = scene.generated_assets || {};
    const storyboardContainer = document.getElementById('scene-storyboard');
    const videoContainer = document.getElementById('scene-video');

    if (assets.storyboard_image) {
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

    if (assets.video_clip) {
        videoContainer.innerHTML = `<video src="${API.getFileUrl(projectName, assets.video_clip)}?t=${cacheBuster}" controls class="w-full h-full"></video>`;
    } else {
        videoContainer.innerHTML = '<span class="text-gray-500">暂无视频</span>';
    }

    modal.classList.remove('hidden');
}

async function saveScene() {
    const sceneId = document.getElementById('scene-id').value;
    const scriptFile = document.getElementById('scene-script-file').value;

    const updates = {
        duration_seconds: parseInt(document.getElementById('scene-duration').value) || 6,
        segment_break: document.getElementById('scene-segment-break').value === 'true',
        visual: {
            description: document.getElementById('scene-visual-desc').value,
            shot_type: document.getElementById('scene-shot-type').value,
            mood: document.getElementById('scene-mood').value
        },
        dialogue: {
            text: document.getElementById('scene-dialogue').value,
            speaker: document.getElementById('scene-speaker').value
        }
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
    } catch (error) {
        alert('上传失败: ' + error.message);
    }
}
