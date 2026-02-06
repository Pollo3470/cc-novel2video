(function () {
  if (window.showToast) {
    return;
  }

  const nativeAlert = window.alert.bind(window);
  const state = {
    container: null,
    recent: new Map(),
    active: [],
  };

  const STYLE_ID = "app-toast-style";
  const CONTAINER_ID = "app-toast-container";
  const MAX_ACTIVE = 6;
  const DEFAULT_DURATION_MS = 3200;
  const ERROR_DURATION_MS = 5200;
  const DEDUPE_WINDOW_MS = 1200;

  function inferType(text) {
    if (/失败|错误|error|failed|invalid|超时|异常|未指定/i.test(text)) {
      return "error";
    }
    if (/请输入|请填写|注意|警告|warning/i.test(text)) {
      return "warning";
    }
    if (/入队|复用|排队|等待|queued|running/i.test(text)) {
      return "info";
    }
    if (/成功|已|完成|创建|删除|保存|还原/i.test(text)) {
      return "success";
    }
    return "info";
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
#${CONTAINER_ID} {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 100000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(380px, calc(100vw - 24px));
  pointer-events: none;
}

.app-toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 12px 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.32);
  background: rgba(22, 26, 33, 0.96);
  color: #f3f4f6;
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.app-toast.show {
  opacity: 1;
  transform: translateY(0);
}

.app-toast.hide {
  opacity: 0;
  transform: translateY(-8px);
}

.app-toast__text {
  flex: 1;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}

.app-toast__close {
  border: 0;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
}

.app-toast__close:hover {
  color: #f3f4f6;
}

.app-toast--info {
  border-left: 4px solid #38bdf8;
}

.app-toast--success {
  border-left: 4px solid #4ade80;
}

.app-toast--warning {
  border-left: 4px solid #fbbf24;
}

.app-toast--error {
  border-left: 4px solid #f87171;
}
`;
    document.head.appendChild(style);
  }

  function ensureContainer() {
    if (state.container && document.body.contains(state.container)) {
      return state.container;
    }

    if (!document.body) {
      return null;
    }

    ensureStyle();
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "false");
    document.body.appendChild(container);
    state.container = container;
    return container;
  }

  function removeToast(toast) {
    if (!toast || toast.dataset.removing === "1") {
      return;
    }

    toast.dataset.removing = "1";
    toast.classList.remove("show");
    toast.classList.add("hide");
    window.setTimeout(() => {
      const idx = state.active.indexOf(toast);
      if (idx >= 0) {
        state.active.splice(idx, 1);
      }
      toast.remove();
    }, 220);
  }

  function showToast(message, options = {}) {
    const text = String(message ?? "").trim();
    if (!text) {
      return;
    }

    const type = options.type || inferType(text);
    const dedupeKey = options.dedupeKey || `${type}:${text}`;
    const now = Date.now();
    const lastShownAt = state.recent.get(dedupeKey);

    if (lastShownAt && now - lastShownAt < DEDUPE_WINDOW_MS) {
      return;
    }
    state.recent.set(dedupeKey, now);

    const container = ensureContainer();
    if (!container) {
      nativeAlert(text);
      return;
    }

    const toast = document.createElement("div");
    toast.className = `app-toast app-toast--${type}`;
    toast.setAttribute("role", "status");

    const textEl = document.createElement("div");
    textEl.className = "app-toast__text";
    textEl.textContent = text;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "app-toast__close";
    closeBtn.setAttribute("aria-label", "关闭通知");
    closeBtn.textContent = "×";

    toast.appendChild(textEl);
    toast.appendChild(closeBtn);
    container.appendChild(toast);
    state.active.push(toast);

    if (state.active.length > MAX_ACTIVE) {
      removeToast(state.active[0]);
    }

    window.requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    const duration = Number(options.duration || (type === "error" ? ERROR_DURATION_MS : DEFAULT_DURATION_MS));
    const timer = window.setTimeout(() => {
      removeToast(toast);
    }, duration);

    closeBtn.addEventListener("click", () => {
      window.clearTimeout(timer);
      removeToast(toast);
    });
  }

  window.showToast = showToast;
  window.__nativeAlert = nativeAlert;
  window.alert = function alertAsToast(message) {
    showToast(message);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensureContainer();
    });
  } else {
    ensureContainer();
  }
})();
