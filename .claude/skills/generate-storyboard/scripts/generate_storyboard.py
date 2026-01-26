#!/usr/bin/env python3
"""
Storyboard Generator - 使用 Gemini API 生成分镜图（两步流程）

两步流程：
1. 生成多宫格分镜图（整体预览，保持人物一致性）
2. 以多宫格图作为参考，生成单独场景图（用于视频生成起始帧）

Usage:
    # 步骤 1：生成多宫格预览图
    python generate_storyboard.py <project_name> <script_file> --grids --all
    python generate_storyboard.py <project_name> <script_file> --grids --batch 1

    # 步骤 2：生成单独场景图（需要已生成 grids）
    python generate_storyboard.py <project_name> <script_file> --scenes
    python generate_storyboard.py <project_name> <script_file> --scenes --scene-ids E1S01 E1S02
"""

import argparse
import sys
import os
import json
import threading
from pathlib import Path
from typing import List, Tuple, Optional, Callable, TypeVar, Any
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

from lib.gemini_client import GeminiClient
from lib.project_manager import ProjectManager


# ==================== 并行处理工具类 ====================

T = TypeVar('T')


class ParallelExecutor:
    """并行任务执行器"""

    def __init__(self, max_workers: int = 10):
        self.max_workers = max_workers
        self._lock = threading.Lock()

    def execute(
        self,
        tasks: List[Any],
        task_fn: Callable[[Any], T],
        desc: str = "处理中",
        task_id_fn: Optional[Callable[[Any], str]] = None
    ) -> Tuple[List[T], List[Tuple[Any, str]]]:
        """
        并行执行任务列表

        Args:
            tasks: 任务列表
            task_fn: 任务处理函数
            desc: 进度描述
            task_id_fn: 可选，从任务获取 ID 的函数（用于日志）

        Returns:
            (成功结果列表, 失败列表[(task, error)])
        """
        results = []
        failures = []
        completed = 0
        total = len(tasks)

        if total == 0:
            return results, failures

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_task = {executor.submit(task_fn, task): task for task in tasks}

            for future in as_completed(future_to_task):
                task = future_to_task[future]
                with self._lock:
                    completed += 1
                    task_id = task_id_fn(task) if task_id_fn else str(completed)

                try:
                    result = future.result()
                    results.append(result)
                    print(f"✅ [{completed}/{total}] {desc}: {task_id} 完成")
                except Exception as e:
                    failures.append((task, str(e)))
                    print(f"❌ [{completed}/{total}] {desc}: {task_id} 失败 - {e}")

        return results, failures


class FailureRecorder:
    """失败记录管理器（线程安全）"""

    def __init__(self, output_dir: Path):
        self.output_path = output_dir / "generation_failures.json"
        self.failures: List[dict] = []
        self._lock = threading.Lock()

    def record_failure(
        self,
        scene_id: str,
        failure_type: str,  # "scene" or "grid"
        error: str,
        attempts: int = 3,
        **extra
    ):
        """记录一次失败"""
        with self._lock:
            self.failures.append({
                "scene_id": scene_id,
                "type": failure_type,
                "error": error,
                "attempts": attempts,
                "timestamp": datetime.now().isoformat(),
                **extra
            })

    def save(self):
        """保存失败记录到文件"""
        if not self.failures:
            return

        with self._lock:
            data = {
                "generated_at": datetime.now().isoformat(),
                "total_failures": len(self.failures),
                "failures": self.failures
            }

            self.output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.output_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"\n⚠️  失败记录已保存: {self.output_path}")

    def get_failed_scene_ids(self) -> List[str]:
        """获取所有失败的场景 ID（用于重新生成）"""
        return [f["scene_id"] for f in self.failures if f["type"] == "scene"]


# ==================== 布局和 Prompt 构建函数 ====================


def get_grid_layout(scene_count: int) -> tuple:
    """
    根据场景数量确定宫格布局

    Args:
        scene_count: 场景数量

    Returns:
        (rows, cols, layout_name) 元组
    """
    if scene_count <= 4:
        return (2, 2, "2x2 四宫格")
    else:
        return (2, 3, "2x3 六宫格")


def build_grid_prompt(scenes: List[dict], characters: dict, clues: dict = None) -> str:
    """
    构建多宫格分镜图生成 prompt

    Args:
        scenes: 场景列表
        characters: 人物字典
        clues: 线索字典（可选）

    Returns:
        完整的 prompt 字符串
    """
    scene_count = len(scenes)
    rows, cols, layout_name = get_grid_layout(scene_count)

    # 构建各宫格描述
    grid_descriptions = []
    all_clues_in_scenes = set()
    for i, scene in enumerate(scenes, 1):
        visual = scene.get('visual', {})
        chars_in_scene = scene.get('characters_in_scene', [])
        clues_in_scene = scene.get('clues_in_scene', [])
        all_clues_in_scenes.update(clues_in_scene)

        # 获取人物动作
        action = scene.get('action', '')

        grid_desc = f"""宫格{i}（场景 {scene['scene_id']}）：
- 描述：{visual.get('description', '一个场景')}
- 镜头：{visual.get('shot_type', '中景')}
- 光线：{visual.get('lighting', '自然光')}
- 人物：{', '.join(chars_in_scene) if chars_in_scene else '无'}
- 动作：{action if action else '静态'}"""
        if clues_in_scene:
            grid_desc += f"\n- 重要物品/环境：{', '.join(clues_in_scene)}"
        grid_descriptions.append(grid_desc)

    prompt = f"""一张 16:9 横屏的多宫格分镜图，包含 {scene_count} 个连续场景。
采用 {layout_name} 布局，每个格子展示一个场景的关键画面。

{chr(10).join(grid_descriptions)}

风格要求：
- 电影分镜图风格，动漫/漫画画风
- 每个宫格有清晰的画面焦点
- 宫格之间用细黑线分隔
- 高质量概念设计

人物必须与提供的参考图完全一致。
保持人物外观、服装和比例的连贯性。"""

    # 添加线索一致性说明
    if clues and all_clues_in_scenes:
        clue_descriptions = []
        for clue_name in all_clues_in_scenes:
            clue = clues.get(clue_name, {})
            if clue:
                clue_descriptions.append(f"- {clue_name}：{clue.get('description', '')}")

        if clue_descriptions:
            prompt += f"\n\n重要物品/环境（请保持与参考图一致）：\n" + "\n".join(clue_descriptions)

    return prompt


def build_scene_prompt(scene: dict, characters: dict, grid_position: int, total_in_grid: int, clues: dict = None) -> str:
    """
    构建单独场景图生成 prompt

    Args:
        scene: 场景字典
        characters: 人物字典
        grid_position: 该场景在多宫格中的位置（从 1 开始）
        total_in_grid: 该多宫格中的场景总数
        clues: 线索字典（可选）

    Returns:
        完整的 prompt 字符串
    """
    visual = scene.get('visual', {})
    chars_in_scene = scene.get('characters_in_scene', [])
    clues_in_scene = scene.get('clues_in_scene', [])
    action = scene.get('action', '')
    dialogue = scene.get('dialogue', {})

    # 构建人物描述
    char_desc = ''
    if chars_in_scene:
        char_desc = f"- 人物：{', '.join(chars_in_scene)}"

    # 构建动作描述
    action_desc = f"- 动作：{action}" if action else ""

    # 构建对话提示（如果有）
    dialogue_hint = ""
    if dialogue and dialogue.get('text'):
        speaker = dialogue.get('speaker', '角色')
        emotion = dialogue.get('emotion', '')
        dialogue_hint = f"\n- 对话情绪：{speaker} 正在说话，表情 {emotion}" if emotion else ""

    # 构建线索提示
    clue_hint = ""
    if clues_in_scene:
        clue_hint = f"\n- 重要物品/环境：{', '.join(clues_in_scene)}"

    # 确定宫格布局描述
    rows, cols, layout_name = get_grid_layout(total_in_grid)
    row_num = (grid_position - 1) // cols + 1
    col_num = (grid_position - 1) % cols + 1
    position_desc = f"第 {row_num} 行第 {col_num} 列（宫格 {grid_position}）"

    prompt = f"""根据提供的多宫格分镜参考图，生成其中 {position_desc} 的单独高清场景图。

参考图是一张 {layout_name} 布局的多宫格分镜图，请将 {position_desc} 的内容单独生成为一张完整的 16:9 横屏图片。

场景 {scene['scene_id']} 的详细要求：
- 画面描述：{visual.get('description', '一个场景')}
- 镜头类型：{visual.get('shot_type', '中景')}
- 摄像机运动：{visual.get('camera_movement', '静态')}
- 光线氛围：{visual.get('lighting', '自然光')}
- 画面情绪：{visual.get('mood', '平静')}
{char_desc}
{action_desc}{dialogue_hint}{clue_hint}

风格要求：
- 电影分镜图风格，动漫/漫画画风
- 画面构图完整，焦点清晰
- 高质量概念设计
- 适合作为视频生成的起始帧
- 保持与多宫格参考图中对应格子的风格和构图一致

人物必须与提供的人物参考图完全一致。
保持人物外观、服装和比例的连贯性。"""

    # 添加线索一致性说明
    if clues and clues_in_scene:
        clue_descriptions = []
        for clue_name in clues_in_scene:
            clue = clues.get(clue_name, {})
            if clue:
                clue_descriptions.append(f"- {clue_name}：{clue.get('description', '')}")

        if clue_descriptions:
            prompt += "\n\n重要物品/环境（请保持与参考图一致）：\n" + "\n".join(clue_descriptions)

    return prompt


def generate_individual_scenes(
    project_name: str,
    script_filename: str,
    scenes: List[dict],
    grid_image_path: Path,
    batch_id: int,
    script: dict,
    max_workers: int = 10,
    rate_limiter: Optional[Any] = None,
    project_data: Optional[dict] = None
) -> Tuple[List[Path], List[Tuple[str, str]]]:
    """
    以多宫格图作为参考，并行批量生成单独场景图

    Args:
        project_name: 项目名称
        script_filename: 剧本文件名
        scenes: 要生成的场景列表
        grid_image_path: 多宫格参考图路径
        batch_id: 批次编号
        script: 完整剧本
        max_workers: 最大并发数
        rate_limiter: 可选的限流器实例
        project_data: 可选的项目元数据（用于获取线索信息）

    Returns:
        (成功路径列表, 失败列表) 元组
    """
    pm = ProjectManager()
    project_dir = pm.get_project_path(project_name)
    total_in_grid = len(scenes)

    # 获取人物和线索数据
    characters = project_data.get('characters', {}) if project_data else script.get('characters', {})
    clues = project_data.get('clues', {}) if project_data else {}

    # 过滤需要生成的场景（跳过已存在的）
    scenes_to_generate = []
    existing_results = []

    for idx, scene in enumerate(scenes, 1):
        scene_id = scene['scene_id']
        output_path = project_dir / 'storyboards' / f"scene_{scene_id}.png"
        if output_path.exists():
            print(f"⏭️  场景 {scene_id} 已存在，跳过")
            existing_results.append(output_path)
        else:
            scenes_to_generate.append((idx, scene))

    if not scenes_to_generate:
        return existing_results, []

    print(f"📷 并行生成 {len(scenes_to_generate)} 个场景图...")

    # 使用锁保护剧本更新操作（线程安全）
    script_update_lock = threading.Lock()

    def generate_single_scene(task_data: Tuple[int, dict]) -> Path:
        idx, scene = task_data
        scene_id = scene['scene_id']
        output_path = project_dir / 'storyboards' / f"scene_{scene_id}.png"

        # 每个线程创建独立的 client，共享 rate_limiter
        client = GeminiClient(rate_limiter=rate_limiter)

        # 收集参考图：多宫格图 + 该场景的人物设计图 + 线索设计图
        reference_images = [grid_image_path]

        # 人物参考图
        for char_name in scene.get('characters_in_scene', []):
            if char_name in characters:
                char_sheet = characters[char_name].get('character_sheet', '')
                if char_sheet:
                    char_path = project_dir / char_sheet
                    if char_path.exists():
                        reference_images.append(char_path)

        # 线索参考图
        for clue_name in scene.get('clues_in_scene', []):
            if clue_name in clues:
                clue_sheet = clues[clue_name].get('clue_sheet', '')
                if clue_sheet:
                    clue_path = project_dir / clue_sheet
                    if clue_path.exists():
                        reference_images.append(clue_path)

        # 构建 prompt（包含宫格位置信息和线索信息）
        prompt = build_scene_prompt(scene, characters, idx, total_in_grid, clues)

        # 调用 API
        client.generate_image(
            prompt=prompt,
            reference_images=reference_images,
            aspect_ratio="16:9",
            output_path=output_path
        )

        # 更新剧本（线程安全）
        relative_path = f"storyboards/scene_{scene_id}.png"
        with script_update_lock:
            pm.update_scene_asset(
                project_name, script_filename,
                scene_id, 'storyboard_image', relative_path
            )

        return output_path

    # 并行执行
    executor = ParallelExecutor(max_workers=max_workers)
    results, failures = executor.execute(
        scenes_to_generate,
        generate_single_scene,
        desc="场景图生成",
        task_id_fn=lambda x: x[1]['scene_id']
    )

    # 合并已存在的结果
    all_results = existing_results + results

    # 转换失败格式
    failed = [(task[1]['scene_id'], error) for task, error in failures]

    # 汇总报告
    if failed:
        print(f"\n⚠️  {len(failed)} 个场景生成失败:")
        for scene_id, error in failed:
            print(f"   - {scene_id}: {error}")

    return all_results, failed


def generate_storyboard_grid(
    project_name: str,
    script_filename: str,
    scenes: List[dict],
    batch_id: int,
    script: dict,
    rate_limiter: Optional[Any] = None,
    project_data: Optional[dict] = None
) -> Tuple[Path, List[Path], List[Tuple[str, str]]]:
    """
    生成一批场景的多宫格分镜图

    Args:
        project_name: 项目名称
        script_filename: 剧本文件名
        scenes: 要生成的场景列表
        batch_id: 批次编号
        script: 完整剧本
        rate_limiter: 可选的限流器实例
        project_data: 可选的项目元数据（用于获取线索信息）

    Returns:
        (grid_path, [], failed_scenes) 元组
        注意：现在不再生成单独场景图，返回的第二个元素为空列表
    """
    pm = ProjectManager()
    project_dir = pm.get_project_path(project_name)

    # 获取人物和线索数据
    characters = project_data.get('characters', {}) if project_data else script.get('characters', {})
    clues = project_data.get('clues', {}) if project_data else {}

    # 收集所有场景中的人物和线索
    all_characters = set()
    all_clues = set()
    for scene in scenes:
        all_characters.update(scene.get('characters_in_scene', []))
        all_clues.update(scene.get('clues_in_scene', []))

    reference_images = []

    # 收集人物参考图
    for char_name in all_characters:
        if char_name in characters:
            char_sheet = characters[char_name].get('character_sheet', '')
            if char_sheet:
                char_path = project_dir / char_sheet
                if char_path.exists():
                    reference_images.append(char_path)
                else:
                    print(f"⚠️  人物设计图不存在: {char_path}")
            else:
                print(f"⚠️  人物 '{char_name}' 没有设计图，可能影响一致性")

    # 收集线索参考图
    for clue_name in all_clues:
        if clue_name in clues:
            clue_sheet = clues[clue_name].get('clue_sheet', '')
            if clue_sheet:
                clue_path = project_dir / clue_sheet
                if clue_path.exists():
                    reference_images.append(clue_path)
                else:
                    print(f"⚠️  线索设计图不存在: {clue_path}")

    # 构建 prompt（包含线索信息）
    prompt = build_grid_prompt(scenes, characters, clues)

    # 生成图片
    client = GeminiClient(rate_limiter=rate_limiter)
    output_path = project_dir / 'storyboards' / f"grid_{batch_id:03d}.png"

    scene_ids = [s['scene_id'] for s in scenes]
    print(f"🎬 正在生成多宫格分镜图: 批次 {batch_id}")
    print(f"   包含场景: {', '.join(scene_ids)}")
    if all_characters:
        print(f"   参考人物: {', '.join(all_characters)}")
    if all_clues:
        print(f"   参考线索: {', '.join(all_clues)}")
    print(f"\n📝 Prompt:\n{prompt}\n")

    client.generate_image(
        prompt=prompt,
        reference_images=reference_images if reference_images else None,
        aspect_ratio="16:9",  # 多宫格分镜图使用横屏
        output_path=output_path
    )

    print(f"✅ 多宫格分镜图已保存: {output_path}")

    # 更新剧本中每个场景的 storyboard_grid 路径
    relative_path = f"storyboards/grid_{batch_id:03d}.png"
    for scene in scenes:
        pm.update_scene_asset(
            project_name, script_filename,
            scene['scene_id'], 'storyboard_grid', relative_path
        )
    print("✅ 剧本已更新 (storyboard_grid)")

    # 这一步现在不生成单独场景图
    return output_path, [], []


def generate_all_grids(
    project_name: str,
    script_filename: str,
    max_workers: int = 10,
    rate_limiter: Optional[Any] = None
) -> Tuple[List[Path], List[Path], List[Tuple[str, str]]]:
    """
    生成所有待处理场景的多宫格分镜图（并行处理）

    Args:
        project_name: 项目名称
        script_filename: 剧本文件名
        max_workers: 最大并发数
        rate_limiter: 可选的限流器实例

    Returns:
        (grid_paths, [], failed_scenes) 元组
    """
    pm = ProjectManager()

    # 检查待处理场景：没有 storyboard_grid 的场景
    script = pm.load_script(project_name, script_filename)
    project_dir = pm.get_project_path(project_name)
    all_scenes = script['scenes']

    # 尝试加载项目级元数据（如果存在）
    project_data = None
    if pm.project_exists(project_name):
        try:
            project_data = pm.load_project(project_name)
            print("📁 已加载项目元数据 (project.json)")
        except Exception as e:
            print(f"⚠️  无法加载项目元数据: {e}")

    # 按批次处理（每批最多 6 个场景）
    batch_size = 6
    batch_tasks = []

    # 遍历所有场景批次，而不是仅遍历待处理场景
    # 这样可以确保 batch_id 与全局索引对应（1-6 -> Batch 1, 7-12 -> Batch 2）
    for i in range(0, len(all_scenes), batch_size):
        full_batch = all_scenes[i:i + batch_size]
        batch_id = (i // batch_size) + 1

        # 检查该批次是否含有未生成的场景
        pending_in_batch = [
            s for s in full_batch
            if not s['generated_assets'].get('storyboard_grid')
        ]

        if pending_in_batch:
            # 如果有任意场景缺失 grid，则重新生成整个批次
            # 这样保证 grid 布局完整（2x3）且内容一致
            batch_tasks.append((batch_id, full_batch))

    if not batch_tasks:
        print("✨ 所有场景的多宫格分镜图都已生成")
        return [], [], []

    print(f"📋 共 {len(batch_tasks)} 个批次待生成，准备并行处理")

    # 创建失败记录器
    recorder = FailureRecorder(project_dir / 'storyboards')

    # 定义批次处理函数
    def process_batch(batch_data: Tuple[int, List[dict]]) -> Tuple[Path, List[Path], List[Tuple[str, str]]]:
        batch_id, batch_scenes = batch_data
        return generate_storyboard_grid(
            project_name, script_filename,
            batch_scenes, batch_id, script,
            rate_limiter=rate_limiter,
            project_data=project_data
        )

    # 并行执行所有批次
    executor = ParallelExecutor(max_workers=max_workers)

    results, failures = executor.execute(
        batch_tasks,
        process_batch,
        desc="多宫格生成",
        task_id_fn=lambda x: f"批次{x[0]}"
    )

    # 记录失败
    for (batch_id, batch_scenes), error in failures:
        scene_ids = [s['scene_id'] for s in batch_scenes]
        recorder.record_failure(
            scene_id=f"batch_{batch_id}",
            failure_type="grid",
            error=error,
            attempts=3,
            scenes_in_batch=scene_ids
        )

    # 整理结果
    grid_results = []
    all_failed = []

    for result in results:
        grid_path, _, failed = result
        grid_results.append(grid_path)
        all_failed.extend(failed)

    # 保存失败记录
    recorder.save()

    return grid_results, [], all_failed


def generate_individual_only(
    project_name: str,
    script_filename: str,
    scene_ids: Optional[List[str]] = None,
    max_workers: int = 10,
    rate_limiter: Optional[Any] = None
) -> Tuple[List[Path], List[Path], List[Tuple[str, str]]]:
    """
    生成单独场景图（需要已有多宫格图）

    Args:
        project_name: 项目名称
        script_filename: 剧本文件名
        scene_ids: 可选的场景 ID 列表，为空则处理所有有 storyboard_grid 但无 storyboard_image 的场景
        max_workers: 最大并发数
        rate_limiter: 可选的限流器实例

    Returns:
        ([], individual_paths, failed_scenes) 元组
    """
    pm = ProjectManager()
    script = pm.load_script(project_name, script_filename)
    project_dir = pm.get_project_path(project_name)

    # 尝试加载项目级元数据（如果存在）
    project_data = None
    if pm.project_exists(project_name):
        try:
            project_data = pm.load_project(project_name)
            print("📁 已加载项目元数据 (project.json)")
        except Exception as e:
            print(f"⚠️  无法加载项目元数据: {e}")

    # 筛选需要处理的场景
    if scene_ids:
        # 处理指定的场景
        scenes_to_process = [
            scene for scene in script['scenes']
            if scene['scene_id'] in scene_ids
        ]
        # 检查是否有 storyboard_grid
        for scene in scenes_to_process:
            if not scene['generated_assets'].get('storyboard_grid'):
                print(f"⚠️  场景 {scene['scene_id']} 没有多宫格图，无法生成单独场景图")
                scenes_to_process = [s for s in scenes_to_process if s != scene]
    else:
        # 获取所有需要生成单独场景图的场景
        scenes_to_process = pm.get_scenes_needing_individual(project_name, script_filename)

    if not scenes_to_process:
        print("✨ 所有场景的单独分镜图都已生成")
        return [], [], []

    print(f"📷 共 {len(scenes_to_process)} 个场景需要并行生成单独场景图")

    # 按 grid 分组处理
    grid_groups: dict = {}
    for scene in scenes_to_process:
        grid_path = scene['generated_assets']['storyboard_grid']
        if grid_path not in grid_groups:
            grid_groups[grid_path] = []
        grid_groups[grid_path].append(scene)

    all_results = []
    all_failed = []

    # 创建失败记录器
    recorder = FailureRecorder(project_dir / 'storyboards')

    for grid_path, scenes in grid_groups.items():
        full_grid_path = project_dir / grid_path
        if not full_grid_path.exists():
            print(f"⚠️  多宫格图不存在: {grid_path}")
            for scene in scenes:
                all_failed.append((scene['scene_id'], f"多宫格图不存在: {grid_path}"))
                recorder.record_failure(
                    scene_id=scene['scene_id'],
                    failure_type="scene",
                    error=f"多宫格图不存在: {grid_path}",
                    attempts=0
                )
            continue

        # 需要确定每个场景在原始批次中的位置
        # 从 grid 文件名提取批次号
        try:
            batch_id = int(grid_path.split('_')[-1].replace('.png', ''))
        except ValueError:
            batch_id = 0  # 如果文件名格式不匹配，默认为 0

        results, failed = generate_individual_scenes(
            project_name, script_filename,
            scenes, full_grid_path, batch_id, script,
            max_workers=max_workers,
            rate_limiter=rate_limiter,
            project_data=project_data
        )
        all_results.extend(results)
        all_failed.extend(failed)

        # 记录失败
        for scene_id, error in failed:
            recorder.record_failure(
                scene_id=scene_id,
                failure_type="scene",
                error=error,
                attempts=3
            )

    # 保存失败记录
    recorder.save()

    return [], all_results, all_failed


def generate_single_batch(
    project_name: str,
    script_filename: str,
    batch_num: int,
    rate_limiter: Optional[Any] = None
) -> Tuple[Path, List[Path], List[Tuple[str, str]]]:
    """
    生成指定批次的分镜图（仅多宫格）

    Args:
        project_name: 项目名称
        script_filename: 剧本文件名
        batch_num: 批次编号（从 1 开始）
        rate_limiter: 可选的限流器实例

    Returns:
        (grid_path, [], failed_scenes) 元组
    """
    pm = ProjectManager()
    script = pm.load_script(project_name, script_filename)

    # 获取所有场景
    all_scenes = script['scenes']

    # 按批次划分
    batch_size = 6
    start_idx = (batch_num - 1) * batch_size
    end_idx = start_idx + batch_size

    if start_idx >= len(all_scenes):
        raise ValueError(f"批次 {batch_num} 超出范围，共有 {len(all_scenes)} 个场景")

    batch_scenes = all_scenes[start_idx:end_idx]

    return generate_storyboard_grid(
        project_name, script_filename,
        batch_scenes, batch_num, script,
        rate_limiter=rate_limiter
    )


def main():
    from lib.gemini_client import RateLimiter

    parser = argparse.ArgumentParser(description='生成分镜图（两步流程）')
    parser.add_argument('project', help='项目名称')
    parser.add_argument('script', help='剧本文件名')

    # 互斥参数组：必须选择其中一个操作模式
    action_group = parser.add_mutually_exclusive_group(required=True)
    action_group.add_argument('--grids', action='store_true', help='步骤1：生成多宫格预览图')
    action_group.add_argument('--scenes', action='store_true', help='步骤2：生成单独场景图（需要已有多宫格图）')

    # 辅助参数
    parser.add_argument('--batch', type=int, help='指定批次编号（从 1 开始）')
    parser.add_argument('--all', action='store_true', help='处理所有待处理场景')
    parser.add_argument('--scene-ids', nargs='+', help='指定场景 ID (仅配合 --scenes 使用)')

    args = parser.parse_args()

    # 初始化限流器
    # 从环境变量读取配置，默认 Gemini 3 Pro Image 限制为 15 RPM
    image_rpm = int(os.environ.get('GEMINI_IMAGE_RPM', 15))
    rate_limiter = RateLimiter({
        "gemini-3-pro-image-preview": image_rpm
    })

    # 从环境变量读取最大并发数，默认 3
    max_workers = int(os.environ.get('STORYBOARD_MAX_WORKERS', 3))

    try:
        if args.grids:
            # 步骤 1：生成多宫格图
            print("🚀 开始步骤 1：生成多宫格分镜图")

            if args.batch:
                # 生成指定批次
                grid_path, _, failed = generate_single_batch(
                    args.project, args.script, args.batch,
                    rate_limiter=rate_limiter
                )
                print(f"\n📊 批次 {args.batch} 生成完成")
                print(f"   多宫格图: {grid_path}")
                if failed:
                    print(f"   失败: {len(failed)} 个场景")

            elif args.all:
                # 生成所有缺失的 grids
                grid_paths, _, failed = generate_all_grids(
                    args.project, args.script,
                    rate_limiter=rate_limiter,
                    max_workers=max_workers
                )
                print(f"\n📊 生成完成:")
                print(f"   多宫格图: {len(grid_paths)} 个")
                if failed:
                    print(f"   失败: {len(failed)} 个场景")
            else:
                print("❌ 请指定 --batch 或 --all 参数")
                sys.exit(1)

        elif args.scenes:
            # 步骤 2：生成单独场景图
            print("🚀 开始步骤 2：生成单独场景图")

            _, individual_paths, failed = generate_individual_only(
                args.project, args.script,
                scene_ids=args.scene_ids,  # 如果为 None 且没有 --all，函数内部会处理所有待生成的
                rate_limiter=rate_limiter,
                max_workers=max_workers
            )
            print(f"\n📊 生成完成: {len(individual_paths)} 个场景图")
            if failed:
                print(f"⚠️  失败: {len(failed)} 个场景")

    except Exception as e:
        print(f"❌ 错误: {e}")
        # traceback.print_exc() # 可选：打印堆栈
        sys.exit(1)


if __name__ == '__main__':
    main()
