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

    if (!emptyState || !contentState || !loadingState) return;

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
