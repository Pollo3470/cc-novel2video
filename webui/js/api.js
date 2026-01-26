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

    static async createProject(name, title, style = '') {
        return this.request('/projects', {
            method: 'POST',
            body: JSON.stringify({ name, title, style }),
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
}

// 导出
window.API = API;
