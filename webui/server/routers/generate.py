"""
生成 API 路由

处理分镜图、视频、人物图、线索图的生成请求。
使用 MediaGenerator 中间层自动处理版本管理。
"""

from typing import Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from lib.project_manager import ProjectManager
from lib.media_generator import MediaGenerator
from lib.gemini_client import RateLimiter

router = APIRouter()

# 初始化管理器
project_root = Path(__file__).parent.parent.parent.parent
pm = ProjectManager(project_root / "projects")

# 初始化限流器（共享给 MediaGenerator）
rate_limiter = RateLimiter({
    "gemini-3-pro-image-preview": 15,
    "veo-3.1-generate-preview": 10,
})


def get_media_generator(project_name: str) -> MediaGenerator:
    """获取项目的媒体生成器（带自动版本管理）"""
    project_path = pm.get_project_path(project_name)
    return MediaGenerator(project_path, rate_limiter=rate_limiter)


def get_aspect_ratio(project: dict, resource_type: str) -> str:
    """
    根据项目配置获取画面比例

    Args:
        project: 项目元数据
        resource_type: 资源类型 (storyboards, videos, characters, clues)

    Returns:
        画面比例字符串
    """
    content_mode = project.get("content_mode", "narration")

    # 检查自定义比例
    custom_ratios = project.get("aspect_ratio", {})
    if resource_type in custom_ratios:
        return custom_ratios[resource_type]

    # 默认比例
    if resource_type == "characters":
        return "3:4"  # 人物设计图使用 3:4 竖版
    elif resource_type == "clues":
        return "16:9"  # 线索设计图保持 16:9
    elif content_mode == "narration":
        return "9:16"  # 说书模式竖屏
    else:
        return "16:9"  # 剧集模式横屏


def normalize_veo_duration_seconds(duration_seconds: Optional[int]) -> str:
    """
    Veo 视频生成仅支持 4/6/8 秒，将输入值归一化到最近的可用值（向上取整，最大 8）。
    """
    try:
        value = int(duration_seconds) if duration_seconds is not None else 4
    except (TypeError, ValueError):
        value = 4

    if value <= 4:
        return "4"
    if value <= 6:
        return "6"
    return "8"


# ==================== 请求模型 ====================

class GenerateStoryboardRequest(BaseModel):
    prompt: str
    script_file: str


class GenerateVideoRequest(BaseModel):
    prompt: str
    script_file: str
    duration_seconds: Optional[int] = 4


class GenerateCharacterRequest(BaseModel):
    prompt: str


class GenerateClueRequest(BaseModel):
    prompt: str


# ==================== 分镜图生成 ====================

@router.post("/projects/{project_name}/generate/storyboard/{segment_id}")
async def generate_storyboard(
    project_name: str,
    segment_id: str,
    req: GenerateStoryboardRequest
):
    """
    生成分镜图（首次生成或重新生成）

    使用 MediaGenerator 自动处理版本管理。
    """
    try:
        project = pm.load_project(project_name)
        project_path = pm.get_project_path(project_name)
        generator = get_media_generator(project_name)

        # 获取画面比例
        aspect_ratio = get_aspect_ratio(project, "storyboards")

        # 加载剧本获取参考图
        script = pm.load_script(project_name, req.script_file)
        content_mode = script.get("content_mode", project.get("content_mode", "narration"))

        # 查找 segment/scene 获取参考角色和线索
        items = script.get("segments" if content_mode == "narration" else "scenes", [])
        id_field = "segment_id" if content_mode == "narration" else "scene_id"
        target_item = None
        for item in items:
            if item.get(id_field) == segment_id:
                target_item = item
                break

        if not target_item:
            raise HTTPException(status_code=404, detail=f"片段/场景 '{segment_id}' 不存在")

        # 收集参考图
        reference_images = []
        chars_field = "characters_in_segment" if content_mode == "narration" else "characters_in_scene"
        clues_field = "clues_in_segment" if content_mode == "narration" else "clues_in_scene"

        for char_name in target_item.get(chars_field, []):
            char_data = project.get("characters", {}).get(char_name, {})
            sheet = char_data.get("character_sheet")
            if sheet:
                sheet_path = project_path / sheet
                if sheet_path.exists():
                    reference_images.append(sheet_path)

        for clue_name in target_item.get(clues_field, []):
            clue_data = project.get("clues", {}).get(clue_name, {})
            sheet = clue_data.get("clue_sheet")
            if sheet:
                sheet_path = project_path / sheet
                if sheet_path.exists():
                    reference_images.append(sheet_path)

        # 使用 MediaGenerator 生成图片（自动处理版本管理）
        _, new_version = await generator.generate_image_async(
            prompt=req.prompt,
            resource_type="storyboards",
            resource_id=segment_id,
            reference_images=reference_images if reference_images else None,
            aspect_ratio=aspect_ratio,
            image_size="2K"
        )

        # 更新剧本中的 generated_assets
        pm.update_scene_asset(
            project_name=project_name,
            script_filename=req.script_file,
            scene_id=segment_id,
            asset_type="storyboard_image",
            asset_path=f"storyboards/scene_{segment_id}.png"
        )

        return {
            "success": True,
            "version": new_version,
            "file_path": f"storyboards/scene_{segment_id}.png",
            "created_at": generator.versions.get_versions("storyboards", segment_id)["versions"][-1]["created_at"]
        }

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 视频生成 ====================

@router.post("/projects/{project_name}/generate/video/{segment_id}")
async def generate_video(
    project_name: str,
    segment_id: str,
    req: GenerateVideoRequest
):
    """
    生成视频（首次生成或重新生成）

    使用 MediaGenerator 自动处理版本管理。
    需要先有分镜图作为起始帧。
    """
    try:
        project = pm.load_project(project_name)
        project_path = pm.get_project_path(project_name)
        generator = get_media_generator(project_name)

        # 获取画面比例
        aspect_ratio = get_aspect_ratio(project, "videos")
        duration_seconds = normalize_veo_duration_seconds(req.duration_seconds)

        # 检查分镜图是否存在
        storyboard_file = project_path / "storyboards" / f"scene_{segment_id}.png"
        if not storyboard_file.exists():
            raise HTTPException(
                status_code=400,
                detail=f"请先生成分镜图 scene_{segment_id}.png"
            )

        # 使用 MediaGenerator 生成视频（自动处理版本管理）
        _, new_version, _, video_uri = await generator.generate_video_async(
            prompt=req.prompt,
            resource_type="videos",
            resource_id=segment_id,
            start_image=storyboard_file,
            aspect_ratio=aspect_ratio,
            duration_seconds=duration_seconds
        )

        # 更新剧本中的 generated_assets
        pm.update_scene_asset(
            project_name=project_name,
            script_filename=req.script_file,
            scene_id=segment_id,
            asset_type="video_clip",
            asset_path=f"videos/scene_{segment_id}.mp4"
        )

        # 保存 video_uri 用于后续扩展
        if video_uri:
            pm.update_scene_asset(
                project_name=project_name,
                script_filename=req.script_file,
                scene_id=segment_id,
                asset_type="video_uri",
                asset_path=video_uri
            )

        return {
            "success": True,
            "version": new_version,
            "file_path": f"videos/scene_{segment_id}.mp4",
            "created_at": generator.versions.get_versions("videos", segment_id)["versions"][-1]["created_at"]
        }

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 人物设计图生成 ====================

@router.post("/projects/{project_name}/generate/character/{char_name}")
async def generate_character(
    project_name: str,
    char_name: str,
    req: GenerateCharacterRequest
):
    """
    生成人物设计图（首次生成或重新生成）

    使用 MediaGenerator 自动处理版本管理。
    """
    try:
        project = pm.load_project(project_name)
        generator = get_media_generator(project_name)

        # 检查人物是否存在
        if char_name not in project.get("characters", {}):
            raise HTTPException(status_code=404, detail=f"人物 '{char_name}' 不存在")

        # 获取画面比例（人物设计图 3:4）
        aspect_ratio = get_aspect_ratio(project, "characters")

        # 构建完整的生成 prompt（优化后的格式）
        style = project.get("style", "")
        style_part = f"，{style}" if style else ""

        full_prompt = f"""人物设计参考图{style_part}。

「{char_name}」的全身立绘。

{req.prompt}

构图要求：单人全身像，站立姿态自然，面向镜头。
背景：纯净浅灰色，无任何装饰元素。
光线：柔和均匀的摄影棚照明，无强烈阴影。
画质：高清，细节清晰，色彩准确。"""

        # 使用 MediaGenerator 生成图片（自动处理版本管理）
        _, new_version = await generator.generate_image_async(
            prompt=full_prompt,
            resource_type="characters",
            resource_id=char_name,
            aspect_ratio=aspect_ratio,
            image_size="2K"
        )

        # 更新 project.json 中的 character_sheet
        project["characters"][char_name]["character_sheet"] = f"characters/{char_name}.png"
        pm.save_project(project_name, project)

        return {
            "success": True,
            "version": new_version,
            "file_path": f"characters/{char_name}.png",
            "created_at": generator.versions.get_versions("characters", char_name)["versions"][-1]["created_at"]
        }

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 线索设计图生成 ====================

@router.post("/projects/{project_name}/generate/clue/{clue_name}")
async def generate_clue(
    project_name: str,
    clue_name: str,
    req: GenerateClueRequest
):
    """
    生成线索设计图（首次生成或重新生成）

    使用 MediaGenerator 自动处理版本管理。
    """
    try:
        project = pm.load_project(project_name)
        generator = get_media_generator(project_name)

        # 检查线索是否存在
        if clue_name not in project.get("clues", {}):
            raise HTTPException(status_code=404, detail=f"线索 '{clue_name}' 不存在")

        clue_data = project["clues"][clue_name]

        # 获取画面比例（设计图始终 16:9）
        aspect_ratio = get_aspect_ratio(project, "clues")

        # 构建完整的生成 prompt
        style = project.get("style", "")
        clue_type = clue_data.get("type", "prop")

        if clue_type == "prop":
            prefix = "道具设计图，单独展示，白色背景。"
        else:
            prefix = "场景设计图，环境概念图。"

        full_prompt = f"{prefix}{req.prompt}"
        if style:
            full_prompt = f"{style}。{full_prompt}"

        # 使用 MediaGenerator 生成图片（自动处理版本管理）
        _, new_version = await generator.generate_image_async(
            prompt=full_prompt,
            resource_type="clues",
            resource_id=clue_name,
            aspect_ratio=aspect_ratio,
            image_size="2K"
        )

        # 更新 project.json 中的 clue_sheet
        project["clues"][clue_name]["clue_sheet"] = f"clues/{clue_name}.png"
        pm.save_project(project_name, project)

        return {
            "success": True,
            "version": new_version,
            "file_path": f"clues/{clue_name}.png",
            "created_at": generator.versions.get_versions("clues", clue_name)["versions"][-1]["created_at"]
        }

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
