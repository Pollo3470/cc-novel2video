import { state } from "./state.js";
import { applyStoryboardTaskResult, refreshSegmentTaskLoadingStates } from "./render.js";

const taskWaiters = new Map();

function isTerminalStatus(status) {
  return status === "succeeded" || status === "failed";
}

function normalizeStats(input) {
  const stats = input || {};
  return {
    queued: Number(stats.queued || 0),
    running: Number(stats.running || 0),
    succeeded: Number(stats.succeeded || 0),
    failed: Number(stats.failed || 0),
    total: Number(stats.total || 0),
  };
}

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

function upsertProjectTask(task) {
  const idx = state.projectTasks.findIndex((item) => item.task_id === task.task_id);
  if (idx >= 0) {
    state.projectTasks[idx] = task;
  } else {
    state.projectTasks.push(task);
  }

  state.projectTasks.sort((a, b) => {
    const ta = new Date(a.updated_at || a.queued_at || 0).getTime();
    const tb = new Date(b.updated_at || b.queued_at || 0).getTime();
    return tb - ta;
  });
}

function notifyWaiters(task) {
  const waiterMap = taskWaiters.get(task.task_id);
  if (!waiterMap || waiterMap.size === 0) return;

  const terminal = isTerminalStatus(task.status);
  waiterMap.forEach((waiter) => {
    try {
      if (typeof waiter.onUpdate === "function") {
        waiter.onUpdate(task);
      }
      if (terminal && task.status === "succeeded" && typeof waiter.onSuccess === "function") {
        waiter.onSuccess(task);
      }
      if (terminal && task.status === "failed" && typeof waiter.onFailed === "function") {
        waiter.onFailed(task);
      }
    } catch (err) {
      console.error("任务回调执行失败:", err);
    }
  });

  if (terminal) {
    taskWaiters.delete(task.task_id);
  }
}

function updateTaskStatsFromList() {
  const stats = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    total: state.projectTasks.length,
  };

  state.projectTasks.forEach((task) => {
    if (task.status in stats) {
      stats[task.status] += 1;
    }
  });

  state.taskStats = normalizeStats(stats);
}

export function renderProjectTaskQueue() {
  if (!document.getElementById("project-task-list")) return;

  const taskCountBadge = document.getElementById("tasks-count");
  const activeCount = state.projectTasks.filter((task) => task.status === "queued" || task.status === "running").length;
  if (taskCountBadge) taskCountBadge.textContent = String(activeCount);

  const queuedEl = document.getElementById("project-queue-stat-queued");
  const runningEl = document.getElementById("project-queue-stat-running");
  const succeededEl = document.getElementById("project-queue-stat-succeeded");
  const failedEl = document.getElementById("project-queue-stat-failed");

  if (queuedEl) queuedEl.textContent = String(state.taskStats.queued || 0);
  if (runningEl) runningEl.textContent = String(state.taskStats.running || 0);
  if (succeededEl) succeededEl.textContent = String(state.taskStats.succeeded || 0);
  if (failedEl) failedEl.textContent = String(state.taskStats.failed || 0);

  const rows = document.getElementById("project-task-list");
  const empty = document.getElementById("project-task-empty");
  if (!rows || !empty) return;

  if (!state.projectTasks.length) {
    rows.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  rows.innerHTML = state.projectTasks
    .map((task) => {
      const message = task.status === "failed"
        ? (task.error_message || "-")
        : (task.result?.file_path || "-");

      return `
        <tr class="border-b border-gray-700/70">
          <td class="px-3 py-2 text-xs text-gray-300 font-mono">${task.task_id.slice(0, 10)}</td>
          <td class="px-3 py-2 text-sm text-gray-200">${typeLabel(task.task_type)}</td>
          <td class="px-3 py-2 text-sm text-gray-300">${task.resource_id || "-"}</td>
          <td class="px-3 py-2 text-sm">
            <span class="px-2 py-1 text-xs rounded ${statusClass(task.status)}">${task.status}</span>
          </td>
          <td class="px-3 py-2 text-xs text-gray-400">${formatTime(task.started_at || task.queued_at)}</td>
          <td class="px-3 py-2 text-xs text-gray-400">${formatTime(task.finished_at)}</td>
          <td class="px-3 py-2 text-xs text-gray-400 max-w-[300px] truncate" title="${message.replace(/"/g, "&quot;")}">${message}</td>
        </tr>
      `;
    })
    .join("");
}

function applyTaskEvent(eventPayload) {
  if (eventPayload?.id !== undefined && eventPayload?.id !== null) {
    const parsed = Number(eventPayload.id);
    if (Number.isFinite(parsed) && parsed > 0) {
      state.taskStreamLastEventId = parsed;
    }
  }

  const task = eventPayload?.data;
  if (!task || task.project_name !== state.projectName) return;

  upsertProjectTask(task);
  updateTaskStatsFromList();
  applyStoryboardTaskResult(task);
  notifyWaiters(task);
  renderProjectTaskQueue();
  refreshSegmentTaskLoadingStates();
}

export async function refreshProjectTasksSnapshot() {
  if (!state.projectName) return;

  try {
    const [listResp, statsResp] = await Promise.all([
      API.listProjectTasks(state.projectName, { page: 1, pageSize: 500 }),
      API.getTaskStats(state.projectName),
    ]);

    state.projectTasks = Array.isArray(listResp.items) ? listResp.items : [];
    state.taskStats = normalizeStats(statsResp?.stats);
    renderProjectTaskQueue();
    refreshSegmentTaskLoadingStates();

    state.projectTasks.forEach((task) => {
      applyStoryboardTaskResult(task);
      if (isTerminalStatus(task.status)) {
        notifyWaiters(task);
      }
    });
  } catch (err) {
    console.error("加载项目任务列表失败:", err);
  }
}

export function startProjectTaskStream() {
  if (!state.projectName) return;
  if (state.taskStream) return;

  state.taskStream = API.openTaskStream({
    projectName: state.projectName,
    lastEventId: state.taskStreamLastEventId,
    onSnapshot: (payload) => {
      const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      state.projectTasks = tasks.filter((task) => task.project_name === state.projectName);
      state.taskStats = normalizeStats(payload.stats);

      const snapshotEventId = Number(payload.last_event_id || 0);
      if (Number.isFinite(snapshotEventId) && snapshotEventId > 0) {
        state.taskStreamLastEventId = snapshotEventId;
      }

      renderProjectTaskQueue();
      refreshSegmentTaskLoadingStates();

      state.projectTasks.forEach((task) => {
        applyStoryboardTaskResult(task);
        if (isTerminalStatus(task.status)) {
          notifyWaiters(task);
        }
      });
    },
    onTask: (payload) => {
      applyTaskEvent(payload);
    },
    onError: (event) => {
      console.warn("项目任务 SSE 连接异常（浏览器会自动重连）", event);
    },
  });
}

export function stopProjectTaskStream() {
  if (state.taskStream) {
    state.taskStream.close();
    state.taskStream = null;
  }
}

export function registerTaskWaiter(taskId, waiter) {
  if (!taskId) return;

  const normalizedWaiter = waiter || {};
  const waiterKey =
    normalizedWaiter.waiterKey ||
    normalizedWaiter.key ||
    `auto:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  let waiterMap = taskWaiters.get(taskId);
  if (!waiterMap) {
    waiterMap = new Map();
    taskWaiters.set(taskId, waiterMap);
  }
  waiterMap.set(waiterKey, normalizedWaiter);

  const existing = state.projectTasks.find((task) => task.task_id === taskId);
  if (existing) {
    notifyWaiters(existing);
  }
}
