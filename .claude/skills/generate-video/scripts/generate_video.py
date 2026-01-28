#!/usr/bin/env python3
"""
Video Generator - 使用 Veo 3.1 API 生成视频分镜

Usage:
    # 按 episode 生成（推荐）
    python generate_video.py <project_name> <script_file> --episode N

    # 断点续传
    python generate_video.py <project_name> <script_file> --episode N --resume

    # 单场景模式
    python generate_video.py <project_name> <script_file> --scene SCENE_ID

    # 批量模式（独立生成每个场景）
    python generate_video.py <project_name> <script_file> --all

每个场景独立生成视频，使用分镜图作为起始帧，然后使用 ffmpeg 拼接。
"""

import argparse
import json
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from lib.gemini_client import GeminiClient
from lib.project_manager import ProjectManager


# ============================================================================
# Prompt 构建
# ============================================================================

def get_video_prompt(item: dict) -> str:
    """
    获取视频生成 Prompt

    直接使用 video_prompt 字段内容。

    Args:
        item: 片段/场景字典

    Returns:
        video_prompt 字符串
    """
    prompt = item.get('video_prompt', '')
    if not prompt:
        item_id = item.get('segment_id') or item.get('scene_id')
        raise ValueError(f"片段/场景缺少 video_prompt 字段: {item_id}")
    return prompt


def get_aspect_ratio(project_data: dict, asset_type: str) -> str:
    """
    根据项目配置获取画面比例（通过 API 参数传递，不写入 prompt）

    Args:
        project_data: project.json 数据
        asset_type: "design" | "grid" | "storyboard" | "video"

    Returns:
        画面比例字符串，如 "16:9" 或 "9:16"
    """
    content_mode = project_data.get('content_mode', 'narration') if project_data else 'narration'

    # 默认配置：说书模式使用竖屏，剧集动画模式使用横屏
    defaults = {
        "design": "16:9",
        "grid": "16:9",
        "storyboard": "9:16" if content_mode == 'narration' else "16:9",
        "video": "9:16" if content_mode == 'narration' else "16:9"
    }

    custom = project_data.get('aspect_ratio', {}) if project_data else {}
    return custom.get(asset_type, defaults[asset_type])


def get_items_from_script(script: dict) -> tuple:
    """
    根据内容模式获取场景/片段列表和相关字段名

    Args:
        script: 剧本数据

    Returns:
        (items_list, id_field, char_field, clue_field) 元组
    """
    content_mode = script.get('content_mode', 'narration')
    if content_mode == 'narration' and 'segments' in script:
        return (
            script['segments'],
            'segment_id',
            'characters_in_segment',
            'clues_in_segment'
        )
    return (
        script.get('scenes', []),
        'scene_id',
        'characters_in_scene',
        'clues_in_scene'
    )


def validate_duration(duration: int) -> str:
    """
    验证并返回有效的时长参数

    Veo API 仅支持 4s/6s/8s

    Args:
        duration: 输入的时长（秒）

    Returns:
        有效的时长字符串
    """
    valid_durations = [4, 6, 8]
    if duration in valid_durations:
        return str(duration)
    # 向上取整到最近的有效值
    for d in valid_durations:
        if d >= duration:
            return str(d)
    return "8"  # 最大值


# ============================================================================
# Checkpoint 管理
# ============================================================================

def get_checkpoint_path(project_dir: Path, episode: int) -> Path:
    """获取 checkpoint 文件路径"""
    return project_dir / 'videos' / f'.checkpoint_ep{episode}.json'


def load_checkpoint(project_dir: Path, episode: int) -> Optional[dict]:
    """
    加载 checkpoint

    Returns:
        checkpoint 字典或 None
    """
    checkpoint_path = get_checkpoint_path(project_dir, episode)
    if checkpoint_path.exists():
        with open(checkpoint_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None


def save_checkpoint(
    project_dir: Path,
    episode: int,
    completed_scenes: list,
    started_at: str
):
    """保存 checkpoint"""
    checkpoint_path = get_checkpoint_path(project_dir, episode)
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)

    checkpoint = {
        "episode": episode,
        "completed_scenes": completed_scenes,
        "started_at": started_at,
        "updated_at": datetime.now().isoformat()
    }

    with open(checkpoint_path, 'w', encoding='utf-8') as f:
        json.dump(checkpoint, f, ensure_ascii=False, indent=2)


def clear_checkpoint(project_dir: Path, episode: int):
    """清除 checkpoint"""
    checkpoint_path = get_checkpoint_path(project_dir, episode)
    if checkpoint_path.exists():
        checkpoint_path.unlink()


# ============================================================================
# FFmpeg 拼接
# ============================================================================

def concatenate_videos(video_paths: list, output_path: Path) -> Path:
    """
    使用 ffmpeg 拼接多个视频片段

    Args:
        video_paths: 视频文件路径列表
        output_path: 输出路径

    Returns:
        输出视频路径
    """
    if len(video_paths) == 1:
        # 只有一个片段，直接复制
        import shutil
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(video_paths[0], output_path)
        return output_path

    # 创建临时文件列表
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        for video_path in video_paths:
            f.write(f"file '{video_path}'\n")
        list_file = f.name

    try:
        # 使用 ffmpeg concat demuxer
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', list_file,
            '-c', 'copy',
            str(output_path)
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        print(f"✅ 视频已拼接: {output_path}")
        return output_path
    finally:
        Path(list_file).unlink()


# ============================================================================
# Episode 视频生成（每个场景独立生成）
# ============================================================================

def generate_episode_video(
    project_name: str,
    script_filename: str,
    episode: int,
    resume: bool = False
) -> Path:
    """
    为指定 episode 生成视频

    每个场景独立生成视频，使用分镜图作为起始帧，
    最后用 ffmpeg 拼接成完整视频。

    Args:
        project_name: 项目名称
        script_filename: 剧本文件名
        episode: 集数编号
        resume: 是否从上次中断处继续

    Returns:
        最终视频路径
    """
    pm = ProjectManager()
    project_dir = pm.get_project_path(project_name)
    client = GeminiClient()

    # 加载剧本和项目配置
    script = pm.load_script(project_name, script_filename)
    project_data = None
    if pm.project_exists(project_name):
        try:
            project_data = pm.load_project(project_name)
        except Exception:
            pass

    # 获取内容模式和画面比例
    content_mode = script.get('content_mode', 'narration')
    video_aspect_ratio = get_aspect_ratio(project_data, 'video')

    # 根据内容模式选择数据源
    all_items, id_field, _, _ = get_items_from_script(script)

    # 筛选指定 episode 的场景/片段
    episode_items = [
        s for s in all_items
        if s.get('episode', 1) == episode
    ]

    if not episode_items:
        raise ValueError(f"未找到第 {episode} 集的场景/片段")

    item_type = "片段" if content_mode == 'narration' else "场景"
    print(f"📋 第 {episode} 集共 {len(episode_items)} 个{item_type}")
    print(f"📐 视频画面比例: {video_aspect_ratio}")

    # 加载或初始化 checkpoint
    completed_scenes = []
    started_at = datetime.now().isoformat()

    if resume:
        checkpoint = load_checkpoint(project_dir, episode)
        if checkpoint:
            completed_scenes = checkpoint.get('completed_scenes', [])
            started_at = checkpoint.get('started_at', started_at)
            print(f"🔄 从 checkpoint 恢复，已完成 {len(completed_scenes)} 个场景")
        else:
            print("⚠️  未找到 checkpoint，从头开始")

    # 确保 videos 目录存在
    videos_dir = project_dir / 'videos'
    videos_dir.mkdir(parents=True, exist_ok=True)

    # 生成每个场景/片段的视频
    scene_videos = []

    # 默认时长：说书模式 4 秒，剧集动画模式 8 秒
    default_duration = 4 if content_mode == 'narration' else 8

    for idx, item in enumerate(episode_items):
        item_id = item.get(id_field, item.get('scene_id', f'item_{idx}'))
        video_output = videos_dir / f"scene_{item_id}.mp4"

        # 检查是否已完成
        if item_id in completed_scenes:
            if video_output.exists():
                print(f"  [{idx + 1}/{len(episode_items)}] {item_type} {item_id} ✓ 已完成")
                scene_videos.append(video_output)
                continue
            else:
                # 标记为完成但文件不存在，需要重新生成
                completed_scenes.remove(item_id)

        print(f"  [{idx + 1}/{len(episode_items)}] {item_type} {item_id}")

        # 检查分镜图
        storyboard_image = item.get('generated_assets', {}).get('storyboard_image')
        if not storyboard_image:
            print(f"    ⚠️  {item_type} {item_id} 没有分镜图，跳过")
            continue

        storyboard_path = project_dir / storyboard_image
        if not storyboard_path.exists():
            print(f"    ⚠️  分镜图不存在: {storyboard_path}，跳过")
            continue

        # 直接使用 video_prompt 字段
        prompt = get_video_prompt(item)
        duration = item.get('duration_seconds', default_duration)
        duration_str = validate_duration(duration)

        try:
            print(f"    🎥 生成视频（{duration_str}秒）...")
            client.generate_video(
                prompt=prompt,
                start_image=storyboard_path,
                aspect_ratio=video_aspect_ratio,
                duration_seconds=duration_str,
                output_path=video_output
            )

            scene_videos.append(video_output)

            # 更新剧本中的 video_clip 字段
            relative_path = f"videos/scene_{item_id}.mp4"
            pm.update_scene_asset(
                project_name, script_filename,
                item_id, 'video_clip', relative_path
            )

            completed_scenes.append(item_id)

            # 保存 checkpoint
            save_checkpoint(project_dir, episode, completed_scenes, started_at)
            print(f"    ✅ 完成: {video_output.name}")

        except Exception as e:
            print(f"    ❌ 生成失败: {e}")
            print(f"    💡 使用 --resume 参数可从此处继续")
            raise

    if not scene_videos:
        raise RuntimeError("没有生成任何视频片段")

    # 拼接所有场景视频
    final_output = project_dir / 'output' / f'episode_{episode:02d}.mp4'

    if len(scene_videos) > 1:
        print(f"\n🔧 拼接 {len(scene_videos)} 个场景视频...")
        concatenate_videos(scene_videos, final_output)
    else:
        import shutil
        final_output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(scene_videos[0], final_output)
        print(f"✅ 视频已保存: {final_output}")

    # 清除 checkpoint
    clear_checkpoint(project_dir, episode)

    print(f"\n🎉 第 {episode} 集视频生成完成: {final_output}")
    return final_output


# ============================================================================
# 单场景生成
# ============================================================================

def generate_scene_video(
    project_name: str,
    script_filename: str,
    scene_id: str
) -> Path:
    """
    生成单个场景/片段的视频

    Args:
        project_name: 项目名称
        script_filename: 剧本文件名
        scene_id: 场景/片段 ID

    Returns:
        生成的视频路径
    """
    pm = ProjectManager()
    project_dir = pm.get_project_path(project_name)

    # 加载剧本和项目配置
    script = pm.load_script(project_name, script_filename)
    project_data = None
    if pm.project_exists(project_name):
        try:
            project_data = pm.load_project(project_name)
        except Exception:
            pass

    # 获取内容模式和画面比例
    content_mode = script.get('content_mode', 'narration')
    video_aspect_ratio = get_aspect_ratio(project_data, 'video')
    all_items, id_field, _, _ = get_items_from_script(script)

    # 找到指定场景/片段
    item = None
    for s in all_items:
        if s.get(id_field) == scene_id or s.get('scene_id') == scene_id:
            item = s
            break

    if not item:
        raise ValueError(f"场景/片段 '{scene_id}' 不存在")

    # 检查分镜图
    storyboard_image = item.get('generated_assets', {}).get('storyboard_image')
    if not storyboard_image:
        raise ValueError(f"场景/片段 '{scene_id}' 没有分镜图，请先运行 generate-storyboard")

    storyboard_path = project_dir / storyboard_image
    if not storyboard_path.exists():
        raise FileNotFoundError(f"分镜图不存在: {storyboard_path}")

    # 直接使用 video_prompt 字段
    prompt = get_video_prompt(item)

    # 获取时长（说书模式默认 4 秒，剧集动画默认 8 秒）
    default_duration = 4 if content_mode == 'narration' else 8
    duration = item.get('duration_seconds', default_duration)
    duration_str = validate_duration(duration)

    # 生成视频
    client = GeminiClient()
    output_path = project_dir / 'videos' / f"scene_{scene_id}.mp4"

    print(f"🎬 正在生成视频: 场景/片段 {scene_id}")
    print(f"   画面比例: {video_aspect_ratio}")
    print(f"   预计等待时间: 1-6 分钟")

    client.generate_video(
        prompt=prompt,
        start_image=storyboard_path,
        aspect_ratio=video_aspect_ratio,
        duration_seconds=duration_str,
        output_path=output_path
    )

    print(f"✅ 视频已保存: {output_path}")

    # 更新剧本
    relative_path = f"videos/scene_{scene_id}.mp4"
    pm.update_scene_asset(project_name, script_filename, scene_id, 'video_clip', relative_path)
    print(f"✅ 剧本已更新")

    return output_path


def generate_all_videos(project_name: str, script_filename: str) -> list:
    """
    生成所有待处理场景的视频（独立模式）

    Returns:
        生成的视频路径列表
    """
    pm = ProjectManager()
    pending_scenes = pm.get_pending_scenes(project_name, script_filename, 'video_clip')

    if not pending_scenes:
        print("✨ 所有场景的视频都已生成")
        return []

    print(f"📋 共 {len(pending_scenes)} 个场景待生成")
    print(f"⚠️  每个视频可能需要 1-6 分钟，请耐心等待")
    print(f"💡 推荐使用 --episode N 模式生成并自动拼接")

    results = []
    for i, scene in enumerate(pending_scenes, 1):
        print(f"\n[{i}/{len(pending_scenes)}] 处理场景 {scene['scene_id']}")
        try:
            path = generate_scene_video(project_name, script_filename, scene['scene_id'])
            results.append(path)
        except Exception as e:
            print(f"❌ 场景 {scene['scene_id']} 生成失败: {e}")

    return results


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='生成视频分镜',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 按 episode 生成（推荐）
  python generate_video.py my_novel script.json --episode 1

  # 断点续传
  python generate_video.py my_novel script.json --episode 1 --resume

  # 单场景模式
  python generate_video.py my_novel script.json --scene E1S1

  # 批量模式（独立生成）
  python generate_video.py my_novel script.json --all
        """
    )
    parser.add_argument('project', help='项目名称')
    parser.add_argument('script', help='剧本文件名')

    # 模式选择
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument('--scene', help='指定场景 ID（单场景模式）')
    mode_group.add_argument('--all', action='store_true', help='生成所有待处理场景（独立模式）')
    mode_group.add_argument('--episode', type=int, help='按 episode 生成并拼接（推荐）')

    # 其他选项
    parser.add_argument('--resume', action='store_true', help='从上次中断处继续')

    args = parser.parse_args()

    try:
        if args.scene:
            generate_scene_video(args.project, args.script, args.scene)
        elif args.all:
            generate_all_videos(args.project, args.script)
        elif args.episode:
            generate_episode_video(
                args.project, args.script,
                args.episode, args.resume
            )
        else:
            print("请指定模式: --scene, --all, 或 --episode")
            print("使用 --help 查看帮助")
            sys.exit(1)

    except Exception as e:
        print(f"❌ 错误: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
