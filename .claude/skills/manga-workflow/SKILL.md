---
name: manga-workflow
description: 完整的端到端工作流程，将小说转换为视频。使用场景：(1) 用户运行 /manga-workflow 命令，(2) 用户想开始新的视频项目，(3) 用户想继续现有项目。按顺序编排所有其他 skill，并在每个阶段设置审核检查点。
---

# 视频工作流

完整的端到端工作流程，将小说转换为视频。

## 快速开始

```
/manga-workflow
```

这将引导你完成整个流程：
1. 小说 → 剧本
2. 剧本 → 确认线索（重要物品/环境）
3. 剧本 → 人物设计
4. 线索 → 线索设计图
5. 人物+线索 → 多宫格分镜图（16:9）
6. 分镜 → 视频片段（16:9 横屏，8 秒）
7. 片段 → 最终视频

## 工作流决策树

```
开始
  │
  ├─ 新项目？ ──────────────────┐
  │                             │
  │   1. 创建项目目录            │
  │   2. 将小说复制到 source/    │
  │   3. 创建 project.json       │
  │   └─────────────────────────┘
  │
  ├─ 检查项目状态 (project.json)
  │   │
  │   ├─ 没有剧本？ ────────► 调用 novel-to-storyboard-script agent ──► 审核 ──┐
  │   │                                                              │
  │   ├─ 没有确认线索？ ───► 确认 clues 列表 ──► 更新 project.json ──┐
  │   │                                                              │
  │   ├─ 没有人物设计？ ────► /generate-characters ──► 审核 ──┐
  │   │                                                       │
  │   ├─ 没有线索设计？ ────► /generate-clues ──► 审核 ──┐
  │   │                                                   │
  │   ├─ 没有分镜图？ ──────► /generate-storyboard ──► 审核 ──┐
  │   │                                                        │
  │   ├─ 没有视频？ ────────► /generate-video ──► 审核 ──┐
  │   │                                                   │
  │   └─ 准备合成？ ───────► /compose-video ──► 完成！
```

> **项目概述**：上传源文件后，系统会自动分析小说内容并生成项目概述（故事梗概、题材类型、核心主题、世界观设定）。概述信息会保存到 `project.json` 的 `overview` 字段，供后续 Agent 参考，也便于用户在 WebUI 中快速了解项目。

## 阶段 1：项目设置

新项目：
1. 询问项目名称
2. 创建 `projects/{名称}/` 及子目录（含 `clues/`）
3. 创建 `project.json` 初始文件
4. 请用户将小说文本放入 `source/`
5. **上传后自动生成项目概述**（synopsis、genre、theme、world_setting）

现有项目：
1. 列出 `projects/` 中的项目
2. 显示 `project.json` 中的项目状态
3. 从上次未完成的阶段继续

## 阶段 2：剧本创建

使用 Task 工具调用 `novel-to-storyboard-script` agent（使用 Opus 模型）：
- Agent 会执行严格的四步流程：
  1. 规范化剧本（结构化整理）
  2. 镜头预算（场景复杂度分析）
  3. 角色表/线索表（详细描述生成）
  4. 分镜表（最终 JSON 输出）
- 每一步都需要用户确认后才继续
- **Agent 会自动识别重要线索**（反复出现的重要物品和地点）

**审核检查点**：在 Agent 完成 Step 4 后，展示剧本摘要和线索列表，等待确认。

**数据分层说明**：
- Agent 会将角色和线索的**完整定义**同步到 `project.json`
- `episode_N.json` 只保留 `characters_in_episode` 和 `clues_in_episode` 名称列表
- 后续 skills（generate-characters、generate-storyboard）从 `project.json` 读取角色信息

## 阶段 3：线索确认

在 agent 完成后：
1. 展示自动识别的潜在线索列表
2. 用户确认哪些需要固化
3. 设置 `importance` 级别（major/minor）
4. 更新 `project.json` 中的 `clues` 字段

**审核检查点**：确认线索列表完整。

## 阶段 4：人物设计

调用 `/generate-characters`：
- 根据描述生成人物设计图
- 保存到 `characters/`
- 更新 `project.json`

**审核检查点**：展示每个人物，允许重新生成。

## 阶段 5：线索设计

调用 `/generate-clues`：
- 为 `importance='major'` 的线索生成设计图
- 保存到 `clues/`
- 更新 `project.json`

**审核检查点**：展示每个线索设计图，允许重新生成。

## 阶段 6：分镜图生成

调用 `/generate-storyboard`：
- 生成多宫格分镜图（16:9 横屏）
- **使用人物和线索参考图保持一致性**
- 保存到 `storyboards/`

**审核检查点**：展示每张分镜图，允许重新生成。

## 阶段 7：视频生成

调用 `/generate-video`：
- 生成带音频的视频片段（16:9 横屏，默认 8 秒）
- 保存到 `videos/`

**审核检查点**：预览每个视频，允许重新生成。

## 阶段 8：最终合成

调用 `/compose-video`：
- 拼接所有视频片段
- 应用转场效果
- 添加背景音乐（可选）
- 输出到 `output/`

## 项目状态命令

随时检查项目状态：
```python
from lib.project_manager import ProjectManager
pm = ProjectManager()

# 加载项目元数据
project = pm.load_project("my_project")
print(project['status'])

# 同步并更新状态
pm.sync_project_status("my_project")
```

## 线索管理

### 在场景中使用线索

在剧本场景中添加 `clues_in_scene` 字段：
```json
{
  "scene_id": "E1S3",
  "characters_in_scene": ["姜月茴"],
  "clues_in_scene": ["玉佩", "老槐树"],
  "visual": { ... }
}
```

生成分镜时，线索参考图会自动加入 API 调用。

### 添加新线索

```python
pm.add_clue(
    "my_project",
    name="玉佩",
    clue_type="prop",  # 或 "location"
    description="翠绿色祖传玉佩...",
    importance="major"
)
```

## 中断后恢复

工作流可以中断后恢复：
- 所有进度保存到磁盘
- `project.json` 记录项目整体状态
- 剧本 JSON 记录每个场景的生成资源
- 再次运行 `/manga-workflow` 即可继续
