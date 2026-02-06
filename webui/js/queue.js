const queueState = {
  tasks: new Map(),
  stats: {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    total: 0,
  },
  stream: null,
  lastEventId: 0,
};

let statsRefreshTimer = null;

function formatTime(timeString) {
  if (!timeString) return "-";
  const dt = new Date(timeString);
  if (Number.isNaN(dt.getTime())) return "-";
  return `${dt.getMonth() + 1}-${dt.getDate()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:${String(dt.getSeconds()).padStart(2, "0")}`;
}

function statusClass(status) {
  if (status === "queued") return "bg-yellow-600 text-yellow-100";
  if (status === "running") return "bg-blue-600 text-blue-100";
  if (status === "succeeded") return "bg-green-600 text-green-100";
  if (status === "failed") return "bg-red-600 text-red-100";
  return "bg-gray-600 text-gray-200";
}

function typeLabel(taskType) {
  const map = {
    storyboard: "分镜图",
    video: "视频",
    character: "人物图",
    clue: "线索图",
    storyboard_grid: "宫格图",
  };
  return map[taskType] || taskType;
}

function normalizeStats(input) {
  const data = input || {};
  return {
    queued: Number(data.queued || 0),
    running: Number(data.running || 0),
    succeeded: Number(data.succeeded || 0),
    failed: Number(data.failed || 0),
    total: Number(data.total || 0),
  };
}

function renderStats() {
  document.getElementById("stat-queued").textContent = String(queueState.stats.queued || 0);
  document.getElementById("stat-running").textContent = String(queueState.stats.running || 0);
  document.getElementById("stat-succeeded").textContent = String(queueState.stats.succeeded || 0);
  document.getElementById("stat-failed").textContent = String(queueState.stats.failed || 0);
}

function parseWindowMs(value) {
  if (value === "1h") return 60 * 60 * 1000;
  if (value === "24h") return 24 * 60 * 60 * 1000;
  if (value === "7d") return 7 * 24 * 60 * 60 * 1000;
  return null;
}

function getFilteredTasks() {
  const projectFilter = document.getElementById("filter-project").value;
  const statusFilter = document.getElementById("filter-status").value;
  const taskTypeFilter = document.getElementById("filter-task-type").value;
  const timeFilter = document.getElementById("filter-time").value;
  const windowMs = parseWindowMs(timeFilter);
  const now = Date.now();

  return Array.from(queueState.tasks.values())
    .filter((task) => {
      if (projectFilter && task.project_name !== projectFilter) return false;
      if (statusFilter && task.status !== statusFilter) return false;
      if (taskTypeFilter && task.task_type !== taskTypeFilter) return false;

      if (windowMs) {
        const baseTime = new Date(task.updated_at || task.queued_at || 0).getTime();
        if (!Number.isFinite(baseTime) || now - baseTime > windowMs) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const ta = new Date(a.updated_at || a.queued_at || 0).getTime();
      const tb = new Date(b.updated_at || b.queued_at || 0).getTime();
      return tb - ta;
    });
}

function renderTaskList() {
  const rows = document.getElementById("queue-task-list");
  const empty = document.getElementById("queue-empty");
  if (!rows || !empty) return;

  const tasks = getFilteredTasks();
  if (!tasks.length) {
    rows.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  rows.innerHTML = tasks
    .map((task) => {
      const message = task.status === "failed"
        ? (task.error_message || "-")
        : (task.result?.file_path || "-");
      return `
        <tr class="border-b border-gray-700/70">
          <td class="px-3 py-2 text-xs text-gray-300 font-mono">${task.task_id.slice(0, 10)}</td>
          <td class="px-3 py-2 text-sm text-gray-200">${task.project_name}</td>
          <td class="px-3 py-2 text-sm text-gray-300">${typeLabel(task.task_type)}</td>
          <td class="px-3 py-2 text-sm text-gray-300">${task.resource_id || "-"}</td>
          <td class="px-3 py-2 text-sm">
            <span class="px-2 py-1 text-xs rounded ${statusClass(task.status)}">${task.status}</span>
          </td>
          <td class="px-3 py-2 text-xs text-gray-400">${formatTime(task.started_at || task.queued_at)}</td>
          <td class="px-3 py-2 text-xs text-gray-400">${formatTime(task.finished_at)}</td>
          <td class="px-3 py-2 text-xs text-gray-400 max-w-[320px] truncate" title="${message.replace(/"/g, "&quot;")}">${message}</td>
        </tr>
      `;
    })
    .join("");
}

async function loadProjectsForFilter() {
  try {
    const data = await API.listProjects();
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const select = document.getElementById("filter-project");
    if (!select) return;

    const existingValue = select.value;
    select.innerHTML = `<option value="">全部项目</option>${projects
      .map((project) => `<option value="${project.name}">${project.title || project.name}</option>`)
      .join("")}`;
    if (existingValue) {
      select.value = existingValue;
    }
  } catch (err) {
    console.error("加载项目筛选列表失败:", err);
  }
}

async function refreshStats() {
  try {
    const data = await API.getTaskStats();
    queueState.stats = normalizeStats(data?.stats);
    renderStats();
  } catch (err) {
    console.error("刷新任务统计失败:", err);
  }
}

function scheduleRefreshStats() {
  if (statsRefreshTimer) return;
  statsRefreshTimer = setTimeout(async () => {
    statsRefreshTimer = null;
    await refreshStats();
  }, 400);
}

async function refreshSnapshot() {
  try {
    const [listData, statsData] = await Promise.all([
      API.listTasks({ page: 1, pageSize: 400 }),
      API.getTaskStats(),
    ]);

    queueState.tasks.clear();
    const items = Array.isArray(listData.items) ? listData.items : [];
    items.forEach((task) => queueState.tasks.set(task.task_id, task));
    queueState.stats = normalizeStats(statsData?.stats);

    renderStats();
    renderTaskList();
  } catch (err) {
    console.error("刷新任务快照失败:", err);
  }
}

function startStream() {
  if (queueState.stream) return;

  queueState.stream = API.openTaskStream({
    lastEventId: queueState.lastEventId,
    onSnapshot: (payload) => {
      queueState.tasks.clear();
      (payload.tasks || []).forEach((task) => queueState.tasks.set(task.task_id, task));
      queueState.stats = normalizeStats(payload.stats);

      const eventId = Number(payload.last_event_id || 0);
      if (Number.isFinite(eventId) && eventId > 0) {
        queueState.lastEventId = eventId;
      }

      renderStats();
      renderTaskList();
    },
    onTask: (payload) => {
      if (payload?.id !== undefined && payload?.id !== null) {
        const id = Number(payload.id);
        if (Number.isFinite(id) && id > 0) queueState.lastEventId = id;
      }
      const task = payload?.data;
      if (task?.task_id) {
        queueState.tasks.set(task.task_id, task);
        renderTaskList();
        scheduleRefreshStats();
      }
    },
    onError: (event) => {
      console.warn("全局任务 SSE 连接异常（浏览器会自动重连）", event);
    },
  });
}

function setupEvents() {
  ["filter-project", "filter-status", "filter-task-type", "filter-time"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", renderTaskList);
    }
  });

  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      void refreshSnapshot();
      void loadProjectsForFilter();
    };
  }

  window.addEventListener("beforeunload", () => {
    if (queueState.stream) {
      queueState.stream.close();
      queueState.stream = null;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupEvents();
  void loadProjectsForFilter();
  void refreshSnapshot();
  startStream();
});
