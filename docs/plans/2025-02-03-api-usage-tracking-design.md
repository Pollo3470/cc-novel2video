# API 调用记录与费用统计系统设计

> 创建日期：2025-02-03
> 状态：待实现

## 概述

为图片/视频生成 API 调用添加完整的记录与费用追踪功能，包括：
- 调用参数信息、调用时间、调用耗时、重试次数
- 基于分辨率/时长实时计算费用
- 失败记录（费用为 0）
- WebUI 费用统计查看与调用记录筛选

---

## 一、数据模型与存储

### 1.1 SQLite 数据库

**位置**：`projects/.api_usage.db`（全局唯一，存放在 projects 目录下）

**表结构：`api_calls`**

```sql
CREATE TABLE api_calls (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- 基础信息
    project_name    TEXT NOT NULL,           -- 项目名称
    call_type       TEXT NOT NULL,           -- 'image' | 'video'
    model           TEXT NOT NULL,           -- 模型名称

    -- 调用参数
    prompt          TEXT,                    -- 调用 prompt（可截断存储）
    resolution      TEXT,                    -- '720p' | '1080p' | '4k' | '1K' | '2K'
    duration_seconds INTEGER,                -- 视频时长（仅视频，单位：秒）
    aspect_ratio    TEXT,                    -- '9:16' | '16:9' 等
    generate_audio  BOOLEAN DEFAULT TRUE,    -- 是否生成音频（仅视频）

    -- 结果信息
    status          TEXT NOT NULL,           -- 'success' | 'failed'
    error_message   TEXT,                    -- 失败时的错误信息
    output_path     TEXT,                    -- 输出文件路径

    -- 性能指标
    started_at      DATETIME NOT NULL,       -- 调用开始时间
    finished_at     DATETIME,                -- 调用结束时间
    duration_ms     INTEGER,                 -- 调用耗时（毫秒）
    retry_count     INTEGER DEFAULT 0,       -- 重试次数

    -- 费用信息（实时计算并存储）
    cost_usd        REAL DEFAULT 0.0,        -- 费用（美元）

    -- 索引友好
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_project_name ON api_calls(project_name);
CREATE INDEX idx_call_type ON api_calls(call_type);
CREATE INDEX idx_status ON api_calls(status);
CREATE INDEX idx_created_at ON api_calls(created_at);
```

### 1.2 费用计算规则

基于 `docs/视频&图片生成费用表.md`：

**图片（gemini-3-pro-image-preview）**

| 输出分辨率 | Token 数 | 单价 | 单张图片成本 |
|-----------|----------|------|-------------|
| 1K / 2K | 1120 tokens | $120 / 1M tokens | $0.134 / 张 |
| 4K | 2000 tokens | $120 / 1M tokens | $0.24 / 张 |

> 注：输入图片（参考图）费用 $0.0011/张，暂不计入（相对较小）

**视频（Veo 3.1 Standard）**

| 分辨率 | generate_audio | 单价（$/秒） |
|--------|----------------|--------------|
| 720p / 1080p | true | $0.40 |
| 720p / 1080p | false | $0.20 |
| 4K | true | $0.60 |
| 4K | false | $0.40 |

**费用计算公式**：
- 图片：`cost = 0.134`（2K）或 `cost = 0.24`（4K）
- 视频：`cost = duration_seconds × 单价`

**失败记录**：`cost_usd = 0.0`

---

## 二、核心模块架构

### 2.1 新增模块

```
lib/
├── gemini_client.py      # 现有：API 调用
├── media_generator.py    # 现有：媒体生成中间层
├── usage_tracker.py      # 新增：调用记录与费用追踪
└── cost_calculator.py    # 新增：费用计算器
```

### 2.2 CostCalculator 类

**文件**：`lib/cost_calculator.py`

**职责**：
- 封装费用表逻辑
- 根据调用参数计算费用

```python
class CostCalculator:
    """费用计算器"""

    # 图片费用（美元/张）
    IMAGE_COST = {
        "1K": 0.134,
        "2K": 0.134,
        "4K": 0.24,
    }

    # 视频费用（美元/秒）
    VIDEO_COST = {
        # (resolution, generate_audio): cost_per_second
        ("720p", True): 0.40,
        ("720p", False): 0.20,
        ("1080p", True): 0.40,
        ("1080p", False): 0.20,
        ("4k", True): 0.60,
        ("4k", False): 0.40,
    }

    def calculate_image_cost(self, resolution: str = "2K") -> float:
        """计算图片生成费用"""
        return self.IMAGE_COST.get(resolution.upper(), 0.134)

    def calculate_video_cost(
        self,
        duration_seconds: int,
        resolution: str = "1080p",
        generate_audio: bool = True
    ) -> float:
        """计算视频生成费用"""
        resolution = resolution.lower()
        cost_per_second = self.VIDEO_COST.get(
            (resolution, generate_audio),
            0.40  # 默认 1080p 含音频
        )
        return duration_seconds * cost_per_second
```

### 2.3 UsageTracker 类

**文件**：`lib/usage_tracker.py`

**职责**：
- 管理 SQLite 数据库连接
- 提供 `start_call()` / `finish_call()` 方法记录调用
- 提供查询接口（按项目、时间、类型、状态筛选）
- 提供统计汇总接口

```python
class UsageTracker:
    """API 调用记录追踪器"""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._init_db()

    def start_call(
        self,
        project_name: str,
        call_type: str,  # 'image' | 'video'
        model: str,
        prompt: str = None,
        resolution: str = None,
        duration_seconds: int = None,
        aspect_ratio: str = None,
        generate_audio: bool = True,
    ) -> int:
        """记录调用开始，返回 call_id"""
        ...

    def finish_call(
        self,
        call_id: int,
        status: str,  # 'success' | 'failed'
        output_path: str = None,
        error_message: str = None,
        retry_count: int = 0,
    ) -> None:
        """记录调用结束，计算费用"""
        ...

    def get_stats(
        self,
        project_name: str = None,
        start_date: datetime = None,
        end_date: datetime = None,
    ) -> dict:
        """获取统计摘要"""
        # 返回：total_cost, image_count, video_count, failed_count
        ...

    def get_calls(
        self,
        project_name: str = None,
        call_type: str = None,
        status: str = None,
        start_date: datetime = None,
        end_date: datetime = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        """获取调用记录列表（分页）"""
        # 返回：items, total, page, page_size
        ...
```

### 2.4 集成方式

**修改 `GeminiClient.__init__`**：

```python
def __init__(self, ..., usage_tracker: UsageTracker = None, project_name: str = None):
    ...
    self.usage_tracker = usage_tracker
    self.project_name = project_name
```

**修改 `generate_image` / `generate_video` 方法**：

```python
def generate_video(self, ...):
    call_id = None
    retry_count = 0

    # 记录调用开始
    if self.usage_tracker and self.project_name:
        call_id = self.usage_tracker.start_call(
            project_name=self.project_name,
            call_type="video",
            model=self.VIDEO_MODEL,
            prompt=prompt[:500],  # 截断存储
            resolution=resolution,
            duration_seconds=int(duration_seconds),
            aspect_ratio=aspect_ratio,
            generate_audio=not ("music" in negative_prompt.lower()),  # 根据实际参数判断
        )

    try:
        # 执行 API 调用（with_retry 装饰器内部追踪 retry_count）
        result = self._do_generate_video(...)

        # 记录成功
        if self.usage_tracker and call_id:
            self.usage_tracker.finish_call(
                call_id=call_id,
                status="success",
                output_path=str(output_path) if output_path else None,
                retry_count=retry_count,
            )
        return result

    except Exception as e:
        # 记录失败
        if self.usage_tracker and call_id:
            self.usage_tracker.finish_call(
                call_id=call_id,
                status="failed",
                error_message=str(e)[:500],
                retry_count=retry_count,
            )
        raise
```

**修改 `MediaGenerator`**：

```python
class MediaGenerator:
    def __init__(self, project_path: Path, rate_limiter: RateLimiter = None):
        self.project_path = Path(project_path)
        self.project_name = self.project_path.name

        # 初始化 UsageTracker（全局数据库）
        db_path = self.project_path.parent / ".api_usage.db"
        self.usage_tracker = UsageTracker(db_path)

        # 传递给 GeminiClient
        self.gemini = GeminiClient(
            rate_limiter=rate_limiter,
            usage_tracker=self.usage_tracker,
            project_name=self.project_name,
        )
```

### 2.5 重试次数追踪

修改 `with_retry` 装饰器，通过上下文变量传递重试次数：

```python
import contextvars

# 上下文变量用于传递重试次数
retry_count_var = contextvars.ContextVar('retry_count', default=0)

def with_retry(...):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_attempts):
                retry_count_var.set(attempt)
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    ...
            raise last_error
        return wrapper
    return decorator
```

---

## 三、WebUI 后端 API

### 3.1 新增路由文件

**文件**：`webui/server/routers/usage.py`

```python
router = APIRouter()

@router.get("/usage/stats")
async def get_global_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """获取全局统计摘要"""
    # 返回：total_cost, image_count, video_count, failed_count
    ...

@router.get("/usage/stats/{project_name}")
async def get_project_stats(
    project_name: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """获取项目统计摘要"""
    ...

@router.get("/usage/calls")
async def get_calls(
    project_name: Optional[str] = None,
    call_type: Optional[str] = None,  # 'image' | 'video'
    status: Optional[str] = None,     # 'success' | 'failed'
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    """获取调用记录列表（支持筛选和分页）"""
    # 返回：items, total, page, page_size
    ...

@router.get("/usage/projects")
async def get_projects_list():
    """获取有调用记录的项目列表（用于筛选下拉框）"""
    ...
```

### 3.2 注册路由

**修改**：`webui/server/app.py`

```python
from webui.server.routers import projects, characters, clues, files, generate, versions, usage

app.include_router(usage.router, prefix="/api/v1", tags=["费用统计"])
```

---

## 四、WebUI 前端界面

### 4.1 全局费用统计页面

**文件**：`webui/usage.html`

```
┌─────────────────────────────────────────────────────────┐
│  视频项目管理  [首页] [费用统计]              🔄 刷新    │
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ 总费用    │ │ 图片调用  │ │ 视频调用  │ │ 失败次数  │   │
│  │ $156.78  │ │ 320 次   │ │ 89 次    │ │ 15 次    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
├─────────────────────────────────────────────────────────┤
│  筛选: [时间范围 ▼] [类型 ▼] [项目 ▼] [状态 ▼]  [重置]  │
├─────────────────────────────────────────────────────────┤
│  调用记录                                                │
│  ┌────┬────────┬──────┬────────┬──────┬──────┬───────┐ │
│  │时间│ 项目   │ 类型 │ 分辨率  │ 状态 │ 耗时  │ 费用  │ │
│  ├────┼────────┼──────┼────────┼──────┼──────┼───────┤ │
│  │... │ ...    │ 视频 │ 1080p  │ ✓    │ 45s  │ $3.20 │ │
│  │... │ ...    │ 图片 │ 2K     │ ✓    │ 8s   │ $0.13 │ │
│  │... │ ...    │ 视频 │ 1080p  │ ✗    │ 12s  │ $0.00 │ │
│  └────┴────────┴──────┴────────┴──────┴──────┴───────┘ │
│                              [上一页] 1/10 [下一页]      │
└─────────────────────────────────────────────────────────┘
```

**时间范围筛选选项**：
- 今天
- 最近 7 天
- 最近 30 天
- 自定义（日期选择器）

**文件**：`webui/js/usage.js`

- 加载统计数据
- 加载调用记录列表
- 筛选逻辑
- 分页逻辑

### 4.2 项目详情页内统计

**修改**：`webui/project.html`

在页面顶部添加费用统计卡片区：

```html
<!-- 费用统计卡片 -->
<div id="usage-stats" class="grid grid-cols-4 gap-4 mb-6">
    <div class="bg-gray-800 rounded-lg p-4">
        <div class="text-sm text-gray-400">总费用</div>
        <div class="text-2xl font-bold text-green-400" id="stat-total-cost">$0.00</div>
    </div>
    <div class="bg-gray-800 rounded-lg p-4">
        <div class="text-sm text-gray-400">图片调用</div>
        <div class="text-2xl font-bold" id="stat-image-count">0 次</div>
    </div>
    <div class="bg-gray-800 rounded-lg p-4">
        <div class="text-sm text-gray-400">视频调用</div>
        <div class="text-2xl font-bold" id="stat-video-count">0 次</div>
    </div>
    <div class="bg-gray-800 rounded-lg p-4">
        <div class="text-sm text-gray-400">失败次数</div>
        <div class="text-2xl font-bold text-red-400" id="stat-failed-count">0 次</div>
    </div>
</div>
<div class="text-right mb-4">
    <a href="/usage.html?project={project_name}" class="text-blue-400 hover:text-blue-300">
        查看详细记录 →
    </a>
</div>
```

**新增**：`webui/js/project/usage.js`

- 加载项目统计数据
- 更新统计卡片

### 4.3 首页导航更新

**修改**：`webui/index.html`

顶部导航添加"费用统计"链接：

```html
<div class="flex items-center space-x-4">
    <a href="/usage.html" class="text-gray-400 hover:text-white transition-colors">
        费用统计
    </a>
    <!-- 现有的刷新和新建按钮 -->
</div>
```

---

## 五、文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `lib/usage_tracker.py` | SQLite 数据库管理 + 调用记录 CRUD |
| `lib/cost_calculator.py` | 费用计算器（封装费用表逻辑） |
| `webui/server/routers/usage.py` | 费用统计 API 路由 |
| `webui/usage.html` | 全局费用统计页面 |
| `webui/js/usage.js` | 费用页面前端逻辑 |
| `webui/js/project/usage.js` | 项目页内费用统计组件 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `lib/gemini_client.py` | 集成 UsageTracker，在 generate_image/generate_video 前后记录调用 |
| `lib/media_generator.py` | 初始化 UsageTracker，传递 project_name 给 GeminiClient |
| `webui/server/app.py` | 注册 usage 路由 |
| `webui/index.html` | 顶部导航添加"费用统计"链接 |
| `webui/project.html` | 添加费用统计卡片区 |
| `webui/js/project.js` | 引入 usage.js，加载项目时获取费用统计 |

---

## 六、实现顺序

### Phase 1 - 核心模块

1. `lib/cost_calculator.py` - 费用计算器
2. `lib/usage_tracker.py` - 数据库 + 记录管理

### Phase 2 - API 集成

3. 修改 `lib/gemini_client.py` - 集成调用追踪
4. 修改 `lib/media_generator.py` - 初始化 UsageTracker，传递 project_name

### Phase 3 - 后端 API

5. `webui/server/routers/usage.py` - 统计与查询 API
6. 修改 `webui/server/app.py` - 注册路由

### Phase 4 - 前端页面

7. `webui/usage.html` + `webui/js/usage.js` - 全局费用页面
8. 修改 `webui/project.html` + 新增 `webui/js/project/usage.js` - 项目内统计
9. 修改 `webui/index.html` - 导航链接

---

## 七、测试要点

1. **费用计算准确性**：验证图片/视频费用计算是否符合费用表
2. **失败记录**：验证失败调用的 error_message 记录和费用为 0
3. **重试次数**：验证重试次数正确累计
4. **筛选功能**：验证时间范围、类型、项目、状态筛选正确
5. **分页功能**：验证分页逻辑正确
6. **统计汇总**：验证总费用、调用次数统计正确
