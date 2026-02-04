# 风格参考图机制实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为视频项目添加项目级风格参考图机制，用户可上传风格参考图，AI 自动分析生成风格描述，后续图片生成使用该描述保持风格一致。

**Architecture:**
- 后端新增风格分析 API 端点，调用 Gemini API 分析图片风格
- 前端在新建项目和项目概览页面添加风格图上传 UI
- 修改 prompt_builders.py 统一处理风格描述的合成
- 修改各生成脚本使用新的风格 prompt 构建函数

**Tech Stack:** Python/FastAPI, JavaScript ES Modules, Gemini API, TailwindCSS

---

## Task 1: 添加风格分析方法到 GeminiClient

**Files:**
- Modify: `lib/gemini_client.py:1110-1163` (在 generate_text 方法附近)

**Step 1: 添加 analyze_style_image 方法**

在 `GeminiClient` 类中添加：

```python
@with_retry(max_attempts=3, backoff_seconds=(2, 4, 8))
def analyze_style_image(
    self,
    image: Union[str, Path, Image.Image],
    model: str = "gemini-2.5-flash"
) -> str:
    """
    分析图片的视觉风格

    Args:
        image: 图片路径或 PIL Image 对象
        model: 模型名称，默认使用 flash 模型

    Returns:
        风格描述文字（逗号分隔的描述词列表）
    """
    # 准备图片
    if isinstance(image, (str, Path)):
        img = Image.open(image)
    else:
        img = image

    # 风格分析 Prompt（参考 Storycraft）
    prompt = (
        "Analyze the visual style of this image. Describe the lighting, "
        "color palette, medium (e.g., oil painting, digital art, photography), "
        "texture, and overall mood. Do NOT describe the subject matter "
        "(e.g., people, objects) or specific content. Focus ONLY on the "
        "artistic style. Provide a concise comma-separated list of descriptors "
        "suitable for an image generation prompt."
    )

    # 调用 API
    response = self.client.models.generate_content(
        model=model,
        contents=[img, prompt]
    )

    return response.text.strip()
```

**Step 2: 验证方法可调用**

Run: `python -c "from lib.gemini_client import GeminiClient; print(hasattr(GeminiClient, 'analyze_style_image'))"`
Expected: `True`

**Step 3: Commit**

```bash
git add lib/gemini_client.py
git commit -m "feat(lib): 添加 analyze_style_image 方法到 GeminiClient"
```

---

## Task 2: 添加 build_style_prompt 函数

**Files:**
- Modify: `lib/prompt_builders.py`

**Step 1: 添加 build_style_prompt 函数**

在文件末尾添加：

```python
def build_style_prompt(project_data: dict) -> str:
    """
    构建风格描述 Prompt 片段

    合并 style（用户手动填写）和 style_description（AI 分析生成）。

    Args:
        project_data: project.json 数据

    Returns:
        风格描述字符串，用于拼接到生成 Prompt 中
    """
    parts = []

    # 基础风格标签
    style = project_data.get('style', '')
    if style:
        parts.append(f"Style: {style}")

    # AI 分析的风格描述
    style_description = project_data.get('style_description', '')
    if style_description:
        parts.append(f"Visual style: {style_description}")

    return '\n'.join(parts)
```

**Step 2: 验证函数可导入**

Run: `python -c "from lib.prompt_builders import build_style_prompt; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add lib/prompt_builders.py
git commit -m "feat(lib): 添加 build_style_prompt 函数"
```

---

## Task 3: 添加风格图上传 API 端点

**Files:**
- Modify: `webui/server/routers/files.py`

**Step 1: 添加导入和常量**

在文件顶部导入部分添加：

```python
from lib.gemini_client import GeminiClient
```

**Step 2: 添加 POST /projects/{name}/style-image 端点**

在文件末尾添加：

```python
# ==================== 风格参考图管理 ====================

@router.post("/projects/{project_name}/style-image")
async def upload_style_image(
    project_name: str,
    file: UploadFile = File(...)
):
    """
    上传风格参考图并分析风格

    1. 保存图片到 projects/{project_name}/style_reference.png
    2. 调用 Gemini API 分析风格
    3. 更新 project.json 的 style_image 和 style_description 字段
    """
    # 检查文件类型
    ext = Path(file.filename).suffix.lower()
    if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型 {ext}，允许的类型: .png, .jpg, .jpeg, .webp"
        )

    try:
        project_dir = pm.get_project_path(project_name)

        # 保存图片（统一转换为 PNG）
        content = await file.read()
        try:
            png_content = convert_image_bytes_to_png(content)
        except ValueError:
            raise HTTPException(status_code=400, detail="无效的图片文件，无法解析")

        output_path = project_dir / "style_reference.png"
        with open(output_path, "wb") as f:
            f.write(png_content)

        # 调用 Gemini API 分析风格
        client = GeminiClient()
        style_description = client.analyze_style_image(output_path)

        # 更新 project.json
        project_data = pm.load_project(project_name)
        project_data["style_image"] = "style_reference.png"
        project_data["style_description"] = style_description
        pm.save_project(project_name, project_data)

        return {
            "success": True,
            "style_image": "style_reference.png",
            "style_description": style_description,
            "url": f"/api/v1/files/{project_name}/style_reference.png"
        }

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"项目 '{project_name}' 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/projects/{project_name}/style-image")
async def delete_style_image(project_name: str):
    """
    删除风格参考图及相关字段
    """
    try:
        project_dir = pm.get_project_path(project_name)

        # 删除图片文件
        image_path = project_dir / "style_reference.png"
        if image_path.exists():
            image_path.unlink()

        # 清除 project.json 中的相关字段
        project_data = pm.load_project(project_name)
        project_data.pop("style_image", None)
        project_data.pop("style_description", None)
        pm.save_project(project_name, project_data)

        return {"success": True}

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"项目 '{project_name}' 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/projects/{project_name}/style-description")
async def update_style_description(
    project_name: str,
    style_description: str = Body(..., embed=True)
):
    """
    更新风格描述（手动编辑）
    """
    try:
        project_data = pm.load_project(project_name)
        project_data["style_description"] = style_description
        pm.save_project(project_name, project_data)

        return {"success": True, "style_description": style_description}

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"项目 '{project_name}' 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Step 3: Commit**

```bash
git add webui/server/routers/files.py
git commit -m "feat(api): 添加风格参考图上传/删除/更新端点"
```

---

## Task 4: 添加前端 API 方法

**Files:**
- Modify: `webui/js/api.js`

**Step 1: 添加风格图相关 API 方法**

在 `// ==================== 费用统计 API ====================` 之前添加：

```javascript
// ==================== 风格参考图 API ====================

/**
 * 上传风格参考图
 * @param {string} projectName - 项目名称
 * @param {File} file - 图片文件
 * @returns {Promise<{success: boolean, style_image: string, style_description: string, url: string}>}
 */
static async uploadStyleImage(projectName, file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(
        `${API_BASE}/projects/${encodeURIComponent(projectName)}/style-image`,
        {
            method: 'POST',
            body: formData,
        }
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(error.detail || '上传失败');
    }

    return response.json();
}

/**
 * 删除风格参考图
 * @param {string} projectName - 项目名称
 */
static async deleteStyleImage(projectName) {
    return this.request(`/projects/${encodeURIComponent(projectName)}/style-image`, {
        method: 'DELETE',
    });
}

/**
 * 更新风格描述
 * @param {string} projectName - 项目名称
 * @param {string} styleDescription - 风格描述
 */
static async updateStyleDescription(projectName, styleDescription) {
    return this.request(`/projects/${encodeURIComponent(projectName)}/style-description`, {
        method: 'PATCH',
        body: JSON.stringify({ style_description: styleDescription }),
    });
}
```

**Step 2: Commit**

```bash
git add webui/js/api.js
git commit -m "feat(frontend): 添加风格参考图 API 方法"
```

---

## Task 5: 修改新建项目模态框

**Files:**
- Modify: `webui/index.html`
- Modify: `webui/js/projects.js`

**Step 1: 在 index.html 添加风格图上传区**

在 `<!-- 按钮 -->` 注释之前，`project-style` 选择框之后添加：

```html
<div>
    <label class="block text-sm font-medium text-gray-300 mb-1">
        风格参考图（可选）
    </label>
    <div id="style-image-upload" class="border-2 border-dashed border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-gray-500 transition-colors">
        <div id="style-image-placeholder">
            <svg class="mx-auto h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p class="mt-1 text-sm text-gray-500">点击或拖拽上传</p>
        </div>
        <div id="style-image-preview" class="hidden">
            <img id="style-image-thumb" class="mx-auto h-20 w-20 object-cover rounded" alt="风格参考图">
            <button type="button" id="remove-style-image" class="mt-2 text-sm text-red-400 hover:text-red-300">移除</button>
        </div>
    </div>
    <input type="file" id="style-image-input" class="hidden" accept=".png,.jpg,.jpeg,.webp">
    <p class="mt-1 text-xs text-gray-500">上传后将自动分析风格，生成风格描述</p>
</div>
```

**Step 2: 在 projects.js 添加风格图暂存逻辑**

在文件顶部添加变量：

```javascript
// 暂存的风格参考图（创建项目时再上传）
let pendingStyleImage = null;
```

在 `setupEventListeners()` 函数末尾添加：

```javascript
// 风格参考图上传
const styleImageUpload = document.getElementById('style-image-upload');
const styleImageInput = document.getElementById('style-image-input');

styleImageUpload.onclick = () => styleImageInput.click();
styleImageInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    pendingStyleImage = file;

    // 显示本地预览
    const placeholder = document.getElementById('style-image-placeholder');
    const preview = document.getElementById('style-image-preview');
    const thumb = document.getElementById('style-image-thumb');

    thumb.src = URL.createObjectURL(file);
    placeholder.classList.add('hidden');
    preview.classList.remove('hidden');
};

document.getElementById('remove-style-image').onclick = (e) => {
    e.stopPropagation();
    pendingStyleImage = null;

    const placeholder = document.getElementById('style-image-placeholder');
    const preview = document.getElementById('style-image-preview');
    const thumb = document.getElementById('style-image-thumb');

    URL.revokeObjectURL(thumb.src);
    thumb.src = '';
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    document.getElementById('style-image-input').value = '';
};
```

**Step 3: 修改 closeModal() 函数**

```javascript
function closeModal() {
    document.getElementById('new-project-modal').classList.add('hidden');
    document.getElementById('create-project-form').reset();

    // 清理风格图暂存
    pendingStyleImage = null;
    const placeholder = document.getElementById('style-image-placeholder');
    const preview = document.getElementById('style-image-preview');
    const thumb = document.getElementById('style-image-thumb');
    if (thumb.src) {
        URL.revokeObjectURL(thumb.src);
        thumb.src = '';
    }
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
}
```

**Step 4: 修改 createProject() 函数**

```javascript
async function createProject() {
    const name = document.getElementById('project-name').value.trim();
    const title = document.getElementById('project-title').value.trim() || name;
    const contentMode = document.getElementById('content-mode').value;
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

        // 1. 创建项目
        await API.createProject(name, title, style, contentMode);

        // 2. 如果有风格参考图，上传并分析
        if (pendingStyleImage) {
            submitBtn.textContent = '分析风格中...';
            try {
                await API.uploadStyleImage(name, pendingStyleImage);
            } catch (error) {
                console.error('风格图上传失败:', error);
                // 不阻断创建流程，只记录错误
            }
        }

        closeModal();
        loadProjects();

    } catch (error) {
        alert('创建失败: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}
```

**Step 5: Commit**

```bash
git add webui/index.html webui/js/projects.js
git commit -m "feat(frontend): 新建项目时支持上传风格参考图"
```

---

## Task 6: 修改项目概览页添加风格参考图管理

**Files:**
- Modify: `webui/project.html`
- Modify: `webui/js/project/render.js`
- Create: `webui/js/project/style_image.js`

**Step 1: 在 project.html 概览 Tab 添加风格参考图区块**

在 `<!-- 故事概述 -->` section 之前添加：

```html
<!-- 风格参考图 -->
<section class="bg-gray-800 rounded-lg p-6">
    <h2 class="text-lg font-semibold mb-4">🎨 风格参考图</h2>
    <div id="style-image-section">
        <!-- 无风格图时 -->
        <div id="style-image-empty" class="hidden">
            <div id="style-image-upload-area" class="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-gray-500 transition-colors">
                <svg class="mx-auto h-10 w-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p class="mt-2 text-sm text-gray-400">点击上传风格参考图</p>
                <p class="mt-1 text-xs text-gray-500">上传后将自动分析并生成风格描述</p>
            </div>
            <input type="file" id="style-image-file-input" class="hidden" accept=".png,.jpg,.jpeg,.webp">
        </div>

        <!-- 有风格图时 -->
        <div id="style-image-content" class="hidden">
            <div class="flex gap-4">
                <div class="flex-shrink-0">
                    <img id="style-image-display" class="w-32 h-32 object-cover rounded-lg" alt="风格参考图">
                </div>
                <div class="flex-1">
                    <label class="block text-sm font-medium text-gray-300 mb-1">风格描述（AI 生成，可编辑）</label>
                    <textarea id="style-description-edit" rows="3" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white resize-none text-sm"></textarea>
                </div>
            </div>
            <div class="flex justify-end space-x-2 mt-4">
                <button id="change-style-image-btn" class="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
                    更换图片
                </button>
                <button id="delete-style-image-btn" class="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-gray-700 rounded-lg transition-colors">
                    删除
                </button>
                <button id="save-style-description-btn" class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                    保存描述
                </button>
            </div>
        </div>

        <!-- 上传/分析中状态 -->
        <div id="style-image-loading" class="hidden text-center py-6">
            <svg class="animate-spin mx-auto h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p class="mt-2 text-sm text-gray-400">正在分析风格...</p>
        </div>
    </div>
</section>
```

**Step 2: 创建 style_image.js 模块**

```javascript
// webui/js/project/style_image.js
import { state } from "./state.js";

/**
 * 渲染风格参考图区块
 */
export function renderStyleImageSection() {
    const project = state.currentProject;
    const emptyState = document.getElementById('style-image-empty');
    const contentState = document.getElementById('style-image-content');
    const loadingState = document.getElementById('style-image-loading');

    loadingState.classList.add('hidden');

    if (project.style_image) {
        // 有风格图
        emptyState.classList.add('hidden');
        contentState.classList.remove('hidden');

        const imgEl = document.getElementById('style-image-display');
        imgEl.src = API.getFileUrl(state.projectName, project.style_image);

        const descEl = document.getElementById('style-description-edit');
        descEl.value = project.style_description || '';
    } else {
        // 无风格图
        emptyState.classList.remove('hidden');
        contentState.classList.add('hidden');
    }
}

/**
 * 设置风格参考图事件监听
 */
export function setupStyleImageEvents() {
    const uploadArea = document.getElementById('style-image-upload-area');
    const fileInput = document.getElementById('style-image-file-input');

    // 点击上传区域
    uploadArea?.addEventListener('click', () => fileInput.click());

    // 文件选择
    fileInput?.addEventListener('change', handleStyleImageUpload);

    // 更换图片
    document.getElementById('change-style-image-btn')?.addEventListener('click', () => {
        fileInput.click();
    });

    // 删除图片
    document.getElementById('delete-style-image-btn')?.addEventListener('click', handleDeleteStyleImage);

    // 保存描述
    document.getElementById('save-style-description-btn')?.addEventListener('click', handleSaveStyleDescription);
}

/**
 * 处理风格图上传
 */
async function handleStyleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const emptyState = document.getElementById('style-image-empty');
    const contentState = document.getElementById('style-image-content');
    const loadingState = document.getElementById('style-image-loading');

    try {
        // 显示加载状态
        emptyState.classList.add('hidden');
        contentState.classList.add('hidden');
        loadingState.classList.remove('hidden');

        // 上传并分析
        const result = await API.uploadStyleImage(state.projectName, file);

        // 更新本地状态
        state.currentProject.style_image = result.style_image;
        state.currentProject.style_description = result.style_description;

        // 重新渲染
        renderStyleImageSection();

    } catch (error) {
        alert('上传失败: ' + error.message);
        renderStyleImageSection();
    } finally {
        e.target.value = '';
    }
}

/**
 * 处理删除风格图
 */
async function handleDeleteStyleImage() {
    if (!confirm('确定要删除风格参考图吗？')) return;

    try {
        await API.deleteStyleImage(state.projectName);

        // 更新本地状态
        delete state.currentProject.style_image;
        delete state.currentProject.style_description;

        // 重新渲染
        renderStyleImageSection();

    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

/**
 * 处理保存风格描述
 */
async function handleSaveStyleDescription() {
    const descEl = document.getElementById('style-description-edit');
    const newDescription = descEl.value.trim();

    try {
        await API.updateStyleDescription(state.projectName, newDescription);

        // 更新本地状态
        state.currentProject.style_description = newDescription;

        alert('描述已保存');

    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}
```

**Step 3: 在 project.js 中导入并初始化**

在 `webui/js/project.js` 中添加导入：

```javascript
import { renderStyleImageSection, setupStyleImageEvents } from "./project/style_image.js";
```

在初始化函数中调用 `setupStyleImageEvents()`。

在渲染概览时调用 `renderStyleImageSection()`。

**Step 4: Commit**

```bash
git add webui/project.html webui/js/project/style_image.js webui/js/project.js webui/js/project/render.js
git commit -m "feat(frontend): 项目概览页支持风格参考图管理"
```

---

## Task 7: 修改 generate_storyboard.py 使用风格描述

**Files:**
- Modify: `.claude/skills/generate-storyboard/scripts/generate_storyboard.py`

**Step 1: 添加导入**

在文件顶部导入部分添加：

```python
from lib.prompt_builders import build_style_prompt
```

**Step 2: 修改 build_direct_scene_prompt 函数**

在函数开头获取风格描述，并合并到 prompt 中：

```python
def build_direct_scene_prompt(
    segment: dict,
    characters: dict = None,
    clues: dict = None,
    style: str = "",
    style_description: str = "",  # 新增参数
    id_field: str = 'segment_id',
    char_field: str = 'characters_in_segment',
    clue_field: str = 'clues_in_segment'
) -> str:
    """
    构建直接生成场景图的 prompt（narration 模式，无多宫格参考）
    """
    image_prompt = segment.get('image_prompt', '')
    if not image_prompt:
        raise ValueError(f"片段 {segment[id_field]} 缺少 image_prompt 字段")

    # 构建风格前缀
    style_parts = []
    if style:
        style_parts.append(f"Style: {style}")
    if style_description:
        style_parts.append(f"Visual style: {style_description}")
    style_prefix = '\n'.join(style_parts) + '\n\n' if style_parts else ''

    # 检测是否为结构化格式
    if is_structured_image_prompt(image_prompt):
        yaml_prompt = image_prompt_to_yaml(image_prompt, style)
        return f"{style_prefix}{yaml_prompt}\n竖屏构图。"

    return f"{style_prefix}{image_prompt} 竖屏构图。"
```

**Step 3: 修改 generate_single 函数中的调用**

在 `generate_storyboard_direct` 函数内的 `generate_single` 闭包中：

```python
# 获取风格描述
style_description = project_data.get('style_description', '') if project_data else ''

# 构建 prompt（直接生成，无需参考多宫格）
prompt = build_direct_scene_prompt(
    segment, characters, clues, style, style_description,
    id_field, char_field, clue_field
)
```

**Step 4: 类似修改 build_grid_prompt 和 build_scene_prompt**

添加 `style_description` 参数并在 prompt 中使用。

**Step 5: Commit**

```bash
git add .claude/skills/generate-storyboard/scripts/generate_storyboard.py
git commit -m "feat(storyboard): 使用风格描述生成分镜图"
```

---

## Task 8: 修改 generate_character.py 和 generate_clue.py

**Files:**
- Modify: `.claude/skills/generate-characters/scripts/generate_character.py`
- Modify: `.claude/skills/generate-clues/scripts/generate_clue.py`

**Step 1: 修改人物生成脚本**

在构建 prompt 时添加风格描述：

```python
# 获取风格描述
style_description = project_data.get('style_description', '')

# 构建风格前缀
style_prefix = ''
if style:
    style_prefix += f"Style: {style}\n"
if style_description:
    style_prefix += f"Visual style: {style_description}\n"
if style_prefix:
    style_prefix += "\n"

# 构建完整 prompt
prompt = f"{style_prefix}{build_character_prompt(name, description, style)}"
```

**Step 2: 类似修改线索生成脚本**

**Step 3: Commit**

```bash
git add .claude/skills/generate-characters/scripts/generate_character.py
git add .claude/skills/generate-clues/scripts/generate_clue.py
git commit -m "feat(generate): 人物和线索生成使用风格描述"
```

---

## Task 9: 更新 CLAUDE.md 文档

**Files:**
- Modify: `CLAUDE.md`

**Step 1: 在 project.json 结构说明中添加新字段**

在完整示例 JSON 中添加：

```json
{
  "title": "重生之皇后威武",
  "content_mode": "narration",
  "style": "古装宫廷风格，精致唯美画面",
  "style_image": "style_reference.png",
  "style_description": "Soft lighting, muted earth tones, traditional Chinese painting influence...",
  ...
}
```

**Step 2: 添加风格参考图说明段落**

在适当位置添加：

```markdown
### 风格参考图（可选）

项目支持上传风格参考图，系统会自动分析并生成风格描述。后续所有图片生成（人物、线索、分镜）都会使用该风格描述，确保整体风格一致。

| 字段 | 说明 |
|------|------|
| `style` | 用户手动填写的基础风格标签 |
| `style_image` | 风格参考图路径（相对于项目目录） |
| `style_description` | AI 分析生成的详细风格描述（可手动编辑） |

**使用方式**：
1. 在 WebUI 新建项目时上传风格参考图（可选）
2. 或在项目概览页面上传/更换风格参考图
3. 系统自动分析并生成风格描述
4. 可手动编辑风格描述进行微调
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 更新文档添加风格参考图说明"
```

---

## Task 10: 最终测试和验证

**Step 1: 启动 WebUI 服务器**

Run: `python -m uvicorn webui.server.app:app --reload --port 8080`

**Step 2: 测试新建项目流程**

1. 打开 http://localhost:8080/
2. 点击"新建项目"
3. 填写项目信息，上传风格参考图
4. 点击创建，验证风格分析是否成功

**Step 3: 测试项目概览页流程**

1. 进入已创建的项目
2. 在概览页面上传/更换/删除风格参考图
3. 编辑并保存风格描述

**Step 4: 测试生成流程**

1. 生成人物设计图，验证是否包含风格描述
2. 生成分镜图，验证是否包含风格描述

**Step 5: 最终提交**

```bash
git status
git log --oneline -10
```

---

## 实现检查清单

- [ ] Task 1: GeminiClient.analyze_style_image() 方法
- [ ] Task 2: build_style_prompt() 函数
- [ ] Task 3: 风格图上传 API 端点
- [ ] Task 4: 前端 API 方法
- [ ] Task 5: 新建项目模态框
- [ ] Task 6: 项目概览页风格图管理
- [ ] Task 7: generate_storyboard.py 使用风格描述
- [ ] Task 8: generate_character.py 和 generate_clue.py
- [ ] Task 9: CLAUDE.md 文档更新
- [ ] Task 10: 最终测试验证
