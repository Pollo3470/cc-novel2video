# 风格参考图机制设计

**日期**: 2026-02-04
**状态**: 待实现

## 概述

为视频项目添加项目级的风格参考图机制。用户可以上传一张风格参考图，系统自动分析生成风格描述文字，后续所有图片生成都使用该风格描述，确保整个项目风格统一。

## 设计决策

| 方面 | 决策 |
|------|------|
| 存储方式 | 本地文件 `style_reference.png` |
| 使用范围 | 所有图片生成（characters、clues、storyboard） |
| 分析机制 | AI 分析 → 保存描述 → 后续仅用描述 |
| 触发方式 | WebUI（新建项目 + 项目概览） |
| 字段设计 | `style`（手动）+ `style_description`（AI）+ `style_image`（路径） |
| UI 交互 | 缩略图 + 可编辑描述 |

## 数据结构

在 `project.json` 中新增以下字段：

```json
{
  "title": "项目名称",
  "style": "Anime",
  "style_image": "style_reference.png",
  "style_description": "Soft lighting, pastel color palette, digital painting medium...",
  "content_mode": "narration",
  ...
}
```

### 字段说明

| 字段 | 来源 | 用途 |
|------|------|------|
| `style` | 用户手动填写 | 基础风格标签（如 Anime、Photographic） |
| `style_image` | 用户上传 | 风格参考图相对路径，留档用 |
| `style_description` | AI 分析生成 | 详细风格描述，用于生成时的 Prompt |

### 生成时 Prompt 合成

```
Style: {style}
Visual style: {style_description}

{image_prompt}
```

## 文件存储

```
projects/{项目名}/
├── style_reference.png    # 风格参考图（固定文件名）
├── project.json
├── characters/
├── ...
```

## API 设计

### 新增端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/projects/{name}/style-image` | `POST` | 上传风格参考图，触发 AI 分析 |
| `/projects/{name}/style-image` | `DELETE` | 删除风格参考图及相关字段 |

### POST 上传流程

1. 接收上传的图片文件
2. 保存到 `projects/{项目名}/style_reference.png`
3. 调用 Gemini API 分析图片风格
4. 保存 `style_description` 和 `style_image` 到 project.json
5. 返回 `{ style_image, style_description }`

### 风格分析 Prompt

```
Analyze the visual style of this image. Describe the lighting, color palette, medium (e.g., oil painting, digital art, photography), texture, and overall mood. Do NOT describe the subject matter (e.g., people, objects) or specific content. Focus ONLY on the artistic style. Provide a concise comma-separated list of descriptors suitable for an image generation prompt.
```

## WebUI 设计

### 新建项目模态框

在现有表单字段后添加风格参考图上传区（可选）：

- 用户选择图片 → 前端暂存，显示本地预览
- 用户点击"创建" → 创建项目 → 上传图片 → 分析风格
- 用户点击"取消" → 直接丢弃，无服务器操作

### 项目概览页

在概览 Tab 中添加风格参考图管理区：

- 显示风格图缩略图
- 显示 AI 生成的风格描述（可编辑）
- 支持更换图片、删除、保存描述

## 实现清单

### 后端修改

| 文件 | 修改内容 |
|------|----------|
| `webui/server/routers/files.py` | 新增 `POST/DELETE /projects/{name}/style-image` 端点 |
| `lib/gemini_client.py` | 新增 `analyze_style_image()` 方法 |
| `lib/prompt_builders.py` | 新增 `build_style_prompt()` 函数 |
| `lib/project_manager.py` | 支持 `style_image` 和 `style_description` 字段读写 |

### 前端修改

| 文件 | 修改内容 |
|------|----------|
| `webui/index.html` | 新建项目模态框添加风格图上传区 |
| `webui/js/projects.js` | 处理风格图暂存、创建时上传 |
| `webui/js/api.js` | 新增 `uploadStyleImage()` 和 `deleteStyleImage()` 方法 |
| `webui/project.html` | 概览 Tab 添加风格图管理区 |
| `webui/js/project/overview.js` | 风格图上传/删除/编辑描述逻辑 |

### Skill 脚本修改

| 文件 | 修改内容 |
|------|----------|
| `generate-characters/scripts/generate_character.py` | 使用 `build_style_prompt()` |
| `generate-clues/scripts/generate_clue.py` | 使用 `build_style_prompt()` |
| `generate-storyboard/scripts/generate_storyboard.py` | 使用 `build_style_prompt()` |

### 文档更新

| 文件 | 修改内容 |
|------|----------|
| `CLAUDE.md` | 添加风格参考图机制说明 |

## 参考

- Storycraft 风格参考图实现：`docs/storycraft/app/features/create/actions/analyze-style.ts`
