/**
 * 费用统计页面
 */

// 状态
let currentPage = 1;
const pageSize = 20;
let totalRecords = 0;

// DOM 元素
const statCost = document.getElementById('stat-cost');
const statImage = document.getElementById('stat-image');
const statVideo = document.getElementById('stat-video');
const statTotal = document.getElementById('stat-total');
const statFailed = document.getElementById('stat-failed');

const filterProject = document.getElementById('filter-project');
const filterType = document.getElementById('filter-type');
const filterStatus = document.getElementById('filter-status');
const filterStartDate = document.getElementById('filter-start-date');
const filterEndDate = document.getElementById('filter-end-date');

const callsTableBody = document.getElementById('calls-table-body');
const paginationTotal = document.getElementById('pagination-total');
const currentPageSpan = document.getElementById('current-page');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const emptyState = document.getElementById('empty-state');

/**
 * 获取当前筛选条件
 */
function getFilters() {
    return {
        projectName: filterProject.value || undefined,
        callType: filterType.value || undefined,
        status: filterStatus.value || undefined,
        startDate: filterStartDate.value || undefined,
        endDate: filterEndDate.value || undefined,
        page: currentPage,
        pageSize: pageSize,
    };
}

/**
 * 加载统计数据
 */
async function loadStats() {
    try {
        const filters = getFilters();
        const stats = await API.getUsageStats({
            projectName: filters.projectName,
            startDate: filters.startDate,
            endDate: filters.endDate,
        });

        statCost.textContent = `$${stats.total_cost.toFixed(2)}`;
        statImage.textContent = stats.image_count;
        statVideo.textContent = stats.video_count;
        statTotal.textContent = stats.total_count;
        statFailed.textContent = stats.failed_count;
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

/**
 * 加载项目列表（用于筛选下拉框）
 */
async function loadProjects() {
    try {
        const result = await API.getUsageProjects();
        const projects = result.projects || [];

        // 清空并重建选项
        filterProject.innerHTML = '<option value="">全部项目</option>';
        projects.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            filterProject.appendChild(option);
        });
    } catch (error) {
        console.error('加载项目列表失败:', error);
    }
}

/**
 * 格式化日期时间
 */
function parseDateTime(value) {
    if (!value) return null;

    // SQLite CURRENT_TIMESTAMP: "YYYY-MM-DD HH:MM:SS"
    // Python datetime.isoformat(): "YYYY-MM-DDTHH:MM:SS(.ffffff)"
    let normalized = String(value);
    if (normalized.includes(' ') && !normalized.includes('T')) {
        normalized = normalized.replace(' ', 'T');
    }
    // JS Date 对小数秒支持通常为最多 3 位（毫秒），超过则截断
    normalized = normalized.replace(/(\.\d{3})\d+/, '$1');

    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
    const date = parseDateTime(value);
    if (!date) return '-';
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * 格式化耗时
 */
function formatDuration(ms) {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
}

/**
 * 创建状态徽章
 */
function createStatusBadge(status) {
    const colors = {
        success: 'bg-green-500/20 text-green-400',
        failed: 'bg-red-500/20 text-red-400',
        pending: 'bg-yellow-500/20 text-yellow-400',
    };
    const labels = {
        success: '成功',
        failed: '失败',
        pending: '进行中',
    };
    const colorClass = colors[status] || 'bg-gray-500/20 text-gray-400';
    const label = labels[status] || status;

    return `<span class="px-2 py-1 text-xs rounded ${colorClass}">${label}</span>`;
}

/**
 * 创建类型徽章
 */
function createTypeBadge(callType) {
    const colors = {
        image: 'bg-blue-500/20 text-blue-400',
        video: 'bg-purple-500/20 text-purple-400',
    };
    const labels = {
        image: '图片',
        video: '视频',
    };
    const colorClass = colors[callType] || 'bg-gray-500/20 text-gray-400';
    const label = labels[callType] || callType;

    return `<span class="px-2 py-1 text-xs rounded ${colorClass}">${label}</span>`;
}

/**
 * 加载调用记录
 */
async function loadCalls() {
    try {
        const filters = getFilters();
        const result = await API.getUsageCalls(filters);

        totalRecords = result.total;
        paginationTotal.textContent = totalRecords;
        currentPageSpan.textContent = currentPage;

        // 更新分页按钮状态
        const totalPages = Math.ceil(totalRecords / pageSize);
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;

        // 渲染表格
        if (result.items.length === 0) {
            callsTableBody.innerHTML = '';
            emptyState.classList.remove('hidden');
            callsTableBody.parentElement.parentElement.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            callsTableBody.parentElement.parentElement.classList.remove('hidden');
            renderCalls(result.items);
        }
    } catch (error) {
        console.error('加载调用记录失败:', error);
    }
}

/**
 * 渲染调用记录表格
 */
function renderCalls(calls) {
    callsTableBody.innerHTML = calls.map(call => `
        <tr class="hover:bg-gray-700/50">
            <td class="px-4 py-3 text-sm text-gray-300">${formatDateTime(call.started_at || call.created_at)}</td>
            <td class="px-4 py-3 text-sm text-white">${call.project_name}</td>
            <td class="px-4 py-3">${createTypeBadge(call.call_type)}</td>
            <td class="px-4 py-3">${createStatusBadge(call.status)}</td>
            <td class="px-4 py-3 text-sm text-gray-300">${call.resolution || '-'}</td>
            <td class="px-4 py-3 text-sm text-gray-300">${call.duration_seconds ? call.duration_seconds + 's' : '-'}</td>
            <td class="px-4 py-3 text-sm text-gray-300">${formatDuration(call.duration_ms)}</td>
            <td class="px-4 py-3 text-sm text-right ${call.cost_usd > 0 ? 'text-green-400' : 'text-gray-500'}">
                ${call.cost_usd > 0 ? '$' + call.cost_usd.toFixed(3) : '-'}
            </td>
        </tr>
    `).join('');
}

/**
 * 刷新数据
 */
async function refresh() {
    await Promise.all([loadStats(), loadCalls()]);
}

/**
 * 应用筛选
 */
function applyFilter() {
    currentPage = 1;
    refresh();
}

/**
 * 重置筛选
 */
function resetFilter() {
    filterProject.value = '';
    filterType.value = '';
    filterStatus.value = '';
    filterStartDate.value = '';
    filterEndDate.value = '';
    currentPage = 1;
    refresh();
}

// 事件绑定
document.getElementById('refresh-btn').addEventListener('click', refresh);
document.getElementById('apply-filter-btn').addEventListener('click', applyFilter);
document.getElementById('reset-filter-btn').addEventListener('click', resetFilter);

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        loadCalls();
    }
});

nextPageBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(totalRecords / pageSize);
    if (currentPage < totalPages) {
        currentPage++;
        loadCalls();
    }
});

// 初始化
async function init() {
    await loadProjects();
    await refresh();
}

init();
