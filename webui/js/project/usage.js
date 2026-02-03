/**
 * 项目费用统计模块
 */

import { state } from "./state.js";

/**
 * 加载并渲染项目费用统计
 */
export async function loadUsageStats() {
    try {
        const stats = await API.getUsageStats({ projectName: state.projectName });

        document.getElementById("usage-cost").textContent = `$${stats.total_cost.toFixed(2)}`;
        document.getElementById("usage-image").textContent = stats.image_count;
        document.getElementById("usage-video").textContent = stats.video_count;
        document.getElementById("usage-failed").textContent = stats.failed_count;
    } catch (error) {
        console.error("加载费用统计失败:", error);
        // 静默失败，不阻断主流程
    }
}
