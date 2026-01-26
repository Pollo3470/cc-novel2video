/**
 * 项目列表页逻辑
 */

document.addEventListener('DOMContentLoaded', () => {
    loadProjects();
    setupEventListeners();
});

/**
 * 加载项目列表
 */
async function loadProjects() {
    const container = document.getElementById('projects-grid');
    const loading = document.getElementById('loading');

    try {
        loading.classList.remove('hidden');
        container.innerHTML = '';

        const data = await API.listProjects();
        const projects = data.projects || [];

        if (projects.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <h3 class="mt-2 text-sm font-medium text-gray-300">暂无项目</h3>
                    <p class="mt-1 text-sm text-gray-500">点击"新建项目"开始创建</p>
                </div>
            `;
            return;
        }

        projects.forEach(project => {
            container.appendChild(createProjectCard(project));
        });

    } catch (error) {
        console.error('加载项目失败:', error);
        container.innerHTML = `
            <div class="col-span-full text-center py-12 text-red-400">
                <p>加载失败: ${error.message}</p>
                <button onclick="loadProjects()" class="mt-4 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700">
                    重试
                </button>
            </div>
        `;
    } finally {
        loading.classList.add('hidden');
    }
}

/**
 * 创建项目卡片
 */
function createProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow cursor-pointer group';
    card.onclick = () => window.location.href = `project.html?name=${encodeURIComponent(project.name)}`;

    const progress = project.progress || {};
    const chars = progress.characters || { total: 0, completed: 0 };
    const storyboards = progress.storyboards || { total: 0, completed: 0 };
    const videos = progress.videos || { total: 0, completed: 0 };

    const phaseLabels = {
        'script': '剧本阶段',
        'characters': '人物阶段',
        'clues': '线索阶段',
        'storyboard': '分镜阶段',
        'video': '视频阶段',
        'compose': '后期阶段',
        'completed': '已完成',
        'empty': '未开始',
        'unknown': '未知',
        'error': '错误'
    };

    card.innerHTML = `
        <!-- 缩略图 -->
        <div class="aspect-video bg-gray-700 relative overflow-hidden">
            ${project.thumbnail
                ? `<img src="${project.thumbnail}" alt="${project.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">`
                : `<div class="w-full h-full flex items-center justify-center">
                     <svg class="h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                     </svg>
                   </div>`
            }
            <!-- 状态标签 -->
            <div class="absolute top-2 right-2">
                <span class="px-2 py-1 text-xs rounded-full ${getPhaseClass(project.current_phase)}">
                    ${phaseLabels[project.current_phase] || project.current_phase}
                </span>
            </div>
        </div>

        <!-- 信息 -->
        <div class="p-4">
            <h3 class="text-lg font-semibold text-white truncate">${project.title || project.name}</h3>
            <p class="text-sm text-gray-400 mt-1 truncate">${project.style || '未设置风格'}</p>

            <!-- 进度条 -->
            <div class="mt-4 space-y-2">
                ${createProgressBar('人物', chars.completed, chars.total, 'bg-purple-500')}
                ${createProgressBar('分镜', storyboards.completed, storyboards.total, 'bg-blue-500')}
                ${createProgressBar('视频', videos.completed, videos.total, 'bg-green-500')}
            </div>
        </div>
    `;

    return card;
}

/**
 * 创建进度条
 */
function createProgressBar(label, completed, total, colorClass) {
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return `
        <div class="flex items-center text-xs">
            <span class="w-12 text-gray-500">${label}</span>
            <div class="flex-1 bg-gray-700 rounded-full h-2 mx-2">
                <div class="${colorClass} h-2 rounded-full transition-all duration-300" style="width: ${percent}%"></div>
            </div>
            <span class="w-16 text-right text-gray-400">${completed}/${total}</span>
        </div>
    `;
}

/**
 * 获取阶段对应的样式类
 */
function getPhaseClass(phase) {
    const classes = {
        'script': 'bg-yellow-600 text-yellow-100',
        'characters': 'bg-purple-600 text-purple-100',
        'clues': 'bg-pink-600 text-pink-100',
        'storyboard': 'bg-blue-600 text-blue-100',
        'video': 'bg-green-600 text-green-100',
        'compose': 'bg-teal-600 text-teal-100',
        'completed': 'bg-green-700 text-green-100',
        'empty': 'bg-gray-600 text-gray-300',
        'error': 'bg-red-600 text-red-100'
    };
    return classes[phase] || 'bg-gray-600 text-gray-300';
}

/**
 * 设置事件监听
 */
function setupEventListeners() {
    // 刷新按钮
    document.getElementById('refresh-btn').onclick = loadProjects;

    // 新建项目按钮
    document.getElementById('new-project-btn').onclick = () => {
        document.getElementById('new-project-modal').classList.remove('hidden');
        document.getElementById('project-name').focus();
    };

    // 关闭模态框
    document.getElementById('close-modal-btn').onclick = closeModal;
    document.getElementById('cancel-btn').onclick = closeModal;

    // 点击模态框背景关闭
    document.getElementById('new-project-modal').onclick = (e) => {
        if (e.target.id === 'new-project-modal') {
            closeModal();
        }
    };

    // 创建项目表单
    document.getElementById('create-project-form').onsubmit = async (e) => {
        e.preventDefault();
        await createProject();
    };

    // ESC 键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

/**
 * 关闭模态框
 */
function closeModal() {
    document.getElementById('new-project-modal').classList.add('hidden');
    document.getElementById('create-project-form').reset();
}

/**
 * 创建项目
 */
async function createProject() {
    const name = document.getElementById('project-name').value.trim();
    const title = document.getElementById('project-title').value.trim() || name;
    const style = document.getElementById('project-style').value.trim();

    if (!name) {
        alert('请输入项目名称');
        return;
    }

    const submitBtn = document.getElementById('submit-btn');
    const originalText = submitBtn.textContent;

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = '创建中...';

        await API.createProject(name, title, style);
        closeModal();
        loadProjects();

    } catch (error) {
        alert('创建失败: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}
