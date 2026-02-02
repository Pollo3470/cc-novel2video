/**
 * API 调用封装
 */

const API_BASE = '/api/v1';

class API {
    /**
     * 通用请求方法
     */
    static async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const response = await fetch(url, { ...defaultOptions, ...options });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || '请求失败');
        }

        return response.json();
    }

    // ==================== 项目管理 ====================

    static async listProjects() {
        return this.request('/projects');
    }

    static async createProject(name, title, style = '', contentMode = 'narration') {
        return this.request('/projects', {
            method: 'POST',
            body: JSON.stringify({ name, title, style, content_mode: contentMode }),
        });
    }

    static async getProject(name) {
        return this.request(`/projects/${encodeURIComponent(name)}`);
    }

    static async updateProject(name, updates) {
        return this.request(`/projects/${encodeURIComponent(name)}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    static async deleteProject(name) {
        return this.request(`/projects/${encodeURIComponent(name)}`, {
            method: 'DELETE',
        });
    }

    // ==================== 人物管理 ====================

    static async addCharacter(projectName, name, description, voiceStyle = '') {
        return this.request(`/projects/${encodeURIComponent(projectName)}/characters`, {
            method: 'POST',
            body: JSON.stringify({ name, description, voice_style: voiceStyle }),
        });
    }

    static async updateCharacter(projectName, charName, updates) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/characters/${encodeURIComponent(charName)}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    static async deleteCharacter(projectName, charName) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/characters/${encodeURIComponent(charName)}`, {
            method: 'DELETE',
        });
    }

    // ==================== 线索管理 ====================

    static async addClue(projectName, name, clueType, description, importance = 'major') {
        return this.request(`/projects/${encodeURIComponent(projectName)}/clues`, {
            method: 'POST',
            body: JSON.stringify({ name, clue_type: clueType, description, importance }),
        });
    }

    static async updateClue(projectName, clueName, updates) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/clues/${encodeURIComponent(clueName)}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    static async deleteClue(projectName, clueName) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/clues/${encodeURIComponent(clueName)}`, {
            method: 'DELETE',
        });
    }

    // ==================== 场景管理 ====================

    static async getScript(projectName, scriptFile) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/scripts/${encodeURIComponent(scriptFile)}`);
    }

    static async updateScene(projectName, sceneId, scriptFile, updates) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/scenes/${encodeURIComponent(sceneId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ script_file: scriptFile, updates }),
        });
    }

    // ==================== 片段管理（说书模式） ====================

    static async updateSegment(projectName, segmentId, updates) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/segments/${encodeURIComponent(segmentId)}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    // ==================== 文件管理 ====================

    static async uploadFile(projectName, uploadType, file, name = null) {
        const formData = new FormData();
        formData.append('file', file);

        let url = `/projects/${encodeURIComponent(projectName)}/upload/${uploadType}`;
        if (name) {
            url += `?name=${encodeURIComponent(name)}`;
        }

        const response = await fetch(`${API_BASE}${url}`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || '上传失败');
        }

        return response.json();
    }

    static async listFiles(projectName) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/files`);
    }

    static getFileUrl(projectName, path) {
        return `${API_BASE}/files/${encodeURIComponent(projectName)}/${path}`;
    }

    // ==================== Source 文件管理 ====================

    /**
     * 获取 source 文件内容
     */
    static async getSourceContent(projectName, filename) {
        const response = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectName)}/source/${encodeURIComponent(filename)}`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || '获取文件内容失败');
        }
        return response.text();
    }

    /**
     * 保存 source 文件（新建或更新）
     */
    static async saveSourceFile(projectName, filename, content) {
        const response = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectName)}/source/${encodeURIComponent(filename)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'text/plain' },
            body: content
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || '保存文件失败');
        }
        return response.json();
    }

    /**
     * 删除 source 文件
     */
    static async deleteSourceFile(projectName, filename) {
        const response = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectName)}/source/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || '删除文件失败');
        }
        return response.json();
    }

    // ==================== 草稿文件管理 ====================

    /**
     * 获取项目的所有草稿
     */
    static async listDrafts(projectName) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/drafts`);
    }

    /**
     * 获取草稿内容
     */
    static async getDraftContent(projectName, episode, stepNum) {
        const response = await fetch(
            `${API_BASE}/projects/${encodeURIComponent(projectName)}/drafts/${episode}/step${stepNum}`
        );
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || '获取草稿内容失败');
        }
        return response.text();
    }

    /**
     * 保存草稿内容
     */
    static async saveDraft(projectName, episode, stepNum, content) {
        const response = await fetch(
            `${API_BASE}/projects/${encodeURIComponent(projectName)}/drafts/${episode}/step${stepNum}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'text/plain' },
                body: content
            }
        );
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || '保存草稿失败');
        }
        return response.json();
    }

    /**
     * 删除草稿
     */
    static async deleteDraft(projectName, episode, stepNum) {
        return this.request(
            `/projects/${encodeURIComponent(projectName)}/drafts/${episode}/step${stepNum}`,
            { method: 'DELETE' }
        );
    }

    // ==================== 项目概述管理 ====================

    /**
     * 使用 AI 生成项目概述
     */
    static async generateOverview(projectName) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/generate-overview`, {
            method: 'POST',
        });
    }

    /**
     * 更新项目概述（手动编辑）
     */
    static async updateOverview(projectName, updates) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/overview`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    // ==================== 生成 API ====================

    /**
     * 生成分镜图
     * @param {string} projectName - 项目名称
     * @param {string} segmentId - 片段/场景 ID
     * @param {string|object} prompt - 图片生成 prompt（支持字符串或结构化对象）
     * @param {string} scriptFile - 剧本文件名
     */
    static async generateStoryboard(projectName, segmentId, prompt, scriptFile) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/generate/storyboard/${encodeURIComponent(segmentId)}`, {
            method: 'POST',
            body: JSON.stringify({ prompt, script_file: scriptFile }),
        });
    }

    /**
     * 生成视频
     * @param {string} projectName - 项目名称
     * @param {string} segmentId - 片段/场景 ID
     * @param {string|object} prompt - 视频生成 prompt（支持字符串或结构化对象）
     * @param {string} scriptFile - 剧本文件名
     * @param {number} durationSeconds - 时长（秒）
     */
    static async generateVideo(projectName, segmentId, prompt, scriptFile, durationSeconds = 4) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/generate/video/${encodeURIComponent(segmentId)}`, {
            method: 'POST',
            body: JSON.stringify({ prompt, script_file: scriptFile, duration_seconds: durationSeconds }),
        });
    }

    /**
     * 生成人物设计图
     * @param {string} projectName - 项目名称
     * @param {string} charName - 人物名称
     * @param {string} prompt - 人物描述 prompt
     */
    static async generateCharacter(projectName, charName, prompt) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/generate/character/${encodeURIComponent(charName)}`, {
            method: 'POST',
            body: JSON.stringify({ prompt }),
        });
    }

    /**
     * 生成线索设计图
     * @param {string} projectName - 项目名称
     * @param {string} clueName - 线索名称
     * @param {string} prompt - 线索描述 prompt
     */
    static async generateClue(projectName, clueName, prompt) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/generate/clue/${encodeURIComponent(clueName)}`, {
            method: 'POST',
            body: JSON.stringify({ prompt }),
        });
    }

    // ==================== 版本管理 API ====================

    /**
     * 获取资源版本列表
     * @param {string} projectName - 项目名称
     * @param {string} resourceType - 资源类型 (storyboards, videos, characters, clues)
     * @param {string} resourceId - 资源 ID
     */
    static async getVersions(projectName, resourceType, resourceId) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/versions/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`);
    }

    /**
     * 还原到指定版本
     * @param {string} projectName - 项目名称
     * @param {string} resourceType - 资源类型
     * @param {string} resourceId - 资源 ID
     * @param {number} version - 要还原的版本号
     */
    static async restoreVersion(projectName, resourceType, resourceId, version) {
        return this.request(`/projects/${encodeURIComponent(projectName)}/versions/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}/restore/${version}`, {
            method: 'POST',
        });
    }
}

// 导出
window.API = API;
