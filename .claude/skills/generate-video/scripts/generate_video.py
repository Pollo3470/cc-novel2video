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

def build_scene_prompt(scene: dict, characters: dict = None) -> str:
    """
    根据场景数据构建符合 Veo 最佳实践的视频生成 prompt

    Prompt 结构遵循 Veo prompt guide：
    1. 开场 - 镜头构图(shot_type) + 场景描述(description)
    2. 动作 - 人物在做什么(action)
    3. 对话 - Speaker（manner）说道："text"
    4. 音效 - 自然融入场景描述
    5. 镜头运动 - camera_movement 的自然描述
    6. 氛围 - lighting + mood

    Args:
        scene: 场景数据字典
        characters: 可选的人物字典，用于获取声音风格

    Returns:
        构建的 prompt 字符串
    """
    visual = scene.get('visual', {})
    dialogue = scene.get('dialogue', {})
    audio = scene.get('audio', {})

    prompt_parts = []

    # 1. 开场：镜头构图 + 场景描述
    shot_type = visual.get('shot_type', '')
    description = visual.get('description', '')

    if shot_type and description:
        prompt_parts.append(f"{shot_type}，{description}。")
    elif description:
        prompt_parts.append(f"{description}。")

    # 2. 动作描述
    action = scene.get('action', '')
    if action:
        prompt_parts.append(f"{action}。")

    # 3. 对话（Veo 最佳格式）
    if dialogue and dialogue.get('text'):
        dialogue_str = _format_dialogue(dialogue, characters)
        prompt_parts.append(dialogue_str)

    # 4. 音效（自然融入场景描述）
    sound_effects = audio.get('sound_effects', [])
    if sound_effects:
        effects_str = _format_sound_effects(sound_effects)
        prompt_parts.append(effects_str)

    # 5. 镜头运动
    camera = visual.get('camera_movement', '')
    if camera and camera != 'static':
        camera_str = _format_camera_movement(camera)
        prompt_parts.append(camera_str)

    # 6. 氛围：光线和情绪
    lighting = visual.get('lighting', '')
    mood = visual.get('mood', '')
    ambiance = _format_ambiance(lighting, mood)
    if ambiance:
        prompt_parts.append(ambiance)

    return ' '.join(prompt_parts)


def _format_dialogue(dialogue: dict, characters: dict = None) -> str:
    """
    格式化对话为 Veo 最佳格式

    Veo 格式: Speaker（emotion）说道："dialogue text"
    """
    speaker = dialogue.get('speaker', '人物')
    text = dialogue['text']
    emotion = dialogue.get('emotion', '')

    # 获取声音风格（如果有）
    voice_style = ''
    if characters and speaker in characters:
        voice_style = characters[speaker].get('voice_style', '')

    # 处理内心独白
    if text.startswith('（') and '）' in text:
        inner_text = text.split('）', 1)[-1] if '）' in text else text
        return f'{speaker}内心独白："{inner_text}"'

    # 构建说话方式描述
    manner_parts = []
    if emotion:
        manner_parts.append(_emotion_to_manner(emotion))
    if voice_style:
        manner_parts.append(voice_style)

    if manner_parts:
        manner = '，'.join(manner_parts)
        return f'{speaker}（{manner}）说道："{text}"'
    else:
        return f'{speaker}说道："{text}"'


def _emotion_to_manner(emotion: str) -> str:
    """将 emotion 标签转换为说话方式描述"""
    emotion_map = {
        'happy': '开心地',
        'sad': '悲伤地',
        'angry': '愤怒地',
        'surprised': '惊讶地',
        'scared': '恐惧地',
        'neutral': '平静地',
        'determined': '坚定地',
        'cold': '冷淡地',
        'proud': '得意地',
        'anxious': '焦虑地',
    }
    return emotion_map.get(emotion, emotion)


def _format_sound_effects(effects: list) -> str:
    """格式化音效为自然描述"""
    if len(effects) == 1:
        return f"背景中传来{effects[0]}。"
    elif len(effects) == 2:
        return f"可以听到{effects[0]}和{effects[1]}。"
    else:
        effects_list = '、'.join(effects[:-1])
        return f"环境音：{effects_list}，以及{effects[-1]}。"


def _format_camera_movement(camera: str) -> str:
    """格式化镜头运动描述"""
    camera_map = {
        'pan left': '镜头向左平移。',
        'pan right': '镜头向右平移。',
        'tilt up': '镜头向上倾斜。',
        'tilt down': '镜头向下倾斜。',
        'dolly in': '镜头缓缓推进。',
        'slow dolly in': '镜头缓缓推进。',
        'dolly out': '镜头缓缓拉远。',
        'track': '镜头跟随移动。',
        'track left': '镜头向左跟踪移动。',
        'track right': '镜头向右跟踪移动。',
        'crane up': '镜头升起。',
        'crane down': '镜头降落。',
        'handheld': '手持镜头轻微晃动。',
        'zoom in': '镜头变焦推进。',
        'zoom out': '镜头变焦拉远。',
    }
    return camera_map.get(camera, f"镜头{camera}。")


def _format_ambiance(lighting: str, mood: str) -> str:
    """格式化光线和氛围描述"""
    parts = []
    if lighting:
        parts.append(lighting)
    if mood:
        parts.append(f"{mood}的氛围")

    if parts:
        return '，'.join(parts) + '。'
    return ''


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

    # 加载剧本
    script = pm.load_script(project_name, script_filename)

    # 筛选指定 episode 的场景
    episode_scenes = [
        s for s in script.get('scenes', [])
        if s.get('episode', 1) == episode
    ]

    if not episode_scenes:
        raise ValueError(f"未找到第 {episode} 集的场景")

    print(f"📋 第 {episode} 集共 {len(episode_scenes)} 个场景")

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

    # 生成每个场景的视频
    scene_videos = []

    for idx, scene in enumerate(episode_scenes):
        scene_id = scene['scene_id']
        video_output = videos_dir / f"scene_{scene_id}.mp4"

        # 检查是否已完成
        if scene_id in completed_scenes:
            if video_output.exists():
                print(f"  [{idx + 1}/{len(episode_scenes)}] 场景 {scene_id} ✓ 已完成")
                scene_videos.append(video_output)
                continue
            else:
                # 标记为完成但文件不存在，需要重新生成
                completed_scenes.remove(scene_id)

        print(f"  [{idx + 1}/{len(episode_scenes)}] 场景 {scene_id}")

        # 检查分镜图
        storyboard_image = scene.get('generated_assets', {}).get('storyboard_image')
        if not storyboard_image:
            print(f"    ⚠️  场景 {scene_id} 没有分镜图，跳过")
            continue

        storyboard_path = project_dir / storyboard_image
        if not storyboard_path.exists():
            print(f"    ⚠️  分镜图不存在: {storyboard_path}，跳过")
            continue

        prompt = build_scene_prompt(scene, script.get('characters', {}))
        duration = scene.get('duration_seconds', 8)

        try:
            print(f"    🎥 生成视频（{duration}秒）...")
            client.generate_video(
                prompt=prompt,
                start_image=storyboard_path,
                aspect_ratio="16:9",
                duration_seconds=str(duration),
                output_path=video_output
            )

            scene_videos.append(video_output)

            # 更新剧本中的 video_clip 字段
            relative_path = f"videos/scene_{scene_id}.mp4"
            pm.update_scene_asset(
                project_name, script_filename,
                scene_id, 'video_clip', relative_path
            )

            completed_scenes.append(scene_id)

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
    scene_id: str,
    prompt: str = None
) -> Path:
    """
    生成单个场景的视频

    Args:
        project_name: 项目名称
        script_filename: 剧本文件名
        scene_id: 场景 ID
        prompt: 视频生成 prompt（应由 Claude 根据场景动态生成）

    Returns:
        生成的视频路径
    """
    pm = ProjectManager()
    project_dir = pm.get_project_path(project_name)

    # 加载剧本
    script = pm.load_script(project_name, script_filename)

    # 找到指定场景
    scene = None
    for s in script['scenes']:
        if s['scene_id'] == scene_id:
            scene = s
            break

    if not scene:
        raise ValueError(f"场景 '{scene_id}' 不存在")

    # 检查分镜图
    storyboard_image = scene.get('generated_assets', {}).get('storyboard_image')
    if not storyboard_image:
        raise ValueError(f"场景 '{scene_id}' 没有分镜图，请先运行 generate-storyboard")

    storyboard_path = project_dir / storyboard_image
    if not storyboard_path.exists():
        raise FileNotFoundError(f"分镜图不存在: {storyboard_path}")

    # 构建 prompt
    if not prompt:
        prompt = build_scene_prompt(scene, script.get('characters', {}))

    # 生成视频
    client = GeminiClient()
    output_path = project_dir / 'videos' / f"scene_{scene_id}.mp4"

    print(f"🎬 正在生成视频: 场景 {scene_id}")
    print(f"   动作: {scene.get('action', '')[:50]}...")
    print(f"   预计等待时间: 1-6 分钟")

    client.generate_video(
        prompt=prompt,
        start_image=storyboard_path,
        aspect_ratio="16:9",
        duration_seconds=str(scene.get('duration_seconds', 8)),
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
