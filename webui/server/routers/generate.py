"""
生成 API 路由（异步入队）。
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lib.generation_queue import get_generation_queue
from lib.project_manager import ProjectManager


router = APIRouter()

project_root = Path(__file__).parent.parent.parent.parent
pm = ProjectManager(project_root / "projects")


class GenerateStoryboardRequest(BaseModel):
    prompt: Union[str, dict]
    script_file: str


class GenerateVideoRequest(BaseModel):
    prompt: Union[str, dict]
    script_file: str
    duration_seconds: Optional[int] = 4


class GenerateCharacterRequest(BaseModel):
    prompt: str


class GenerateClueRequest(BaseModel):
    prompt: str


@router.post("/projects/{project_name}/generate/storyboard/{segment_id}")
async def generate_storyboard(
    project_name: str,
    segment_id: str,
    req: GenerateStoryboardRequest,
):
    try:
        # 提前校验项目和剧本存在，避免无效任务入队
        pm.load_project(project_name)
        pm.load_script(project_name, req.script_file)

        queue = get_generation_queue()
        enqueue_result = queue.enqueue_task(
            project_name=project_name,
            task_type="storyboard",
            media_type="image",
            resource_id=segment_id,
            payload={
                "prompt": req.prompt,
                "script_file": req.script_file,
            },
            script_file=req.script_file,
            source="webui",
        )

        return {
            "success": True,
            **enqueue_result,
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/projects/{project_name}/generate/video/{segment_id}")
async def generate_video(
    project_name: str,
    segment_id: str,
    req: GenerateVideoRequest,
):
    try:
        pm.load_project(project_name)
        pm.load_script(project_name, req.script_file)
        project_path = pm.get_project_path(project_name)

        # 与旧同步接口保持一致：无分镜图时立即返回可执行错误，而不是入队后异步失败。
        storyboard_file = project_path / "storyboards" / f"scene_{segment_id}.png"
        if not storyboard_file.exists():
            raise HTTPException(
                status_code=400,
                detail=f"请先生成分镜图 scene_{segment_id}.png",
            )

        queue = get_generation_queue()
        enqueue_result = queue.enqueue_task(
            project_name=project_name,
            task_type="video",
            media_type="video",
            resource_id=segment_id,
            payload={
                "prompt": req.prompt,
                "script_file": req.script_file,
                "duration_seconds": req.duration_seconds,
            },
            script_file=req.script_file,
            source="webui",
        )

        return {
            "success": True,
            **enqueue_result,
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/projects/{project_name}/generate/character/{char_name}")
async def generate_character(
    project_name: str,
    char_name: str,
    req: GenerateCharacterRequest,
):
    try:
        project = pm.load_project(project_name)
        if char_name not in project.get("characters", {}):
            raise HTTPException(status_code=404, detail=f"人物 '{char_name}' 不存在")

        queue = get_generation_queue()
        enqueue_result = queue.enqueue_task(
            project_name=project_name,
            task_type="character",
            media_type="image",
            resource_id=char_name,
            payload={
                "prompt": req.prompt,
            },
            source="webui",
        )

        return {
            "success": True,
            **enqueue_result,
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/projects/{project_name}/generate/clue/{clue_name}")
async def generate_clue(
    project_name: str,
    clue_name: str,
    req: GenerateClueRequest,
):
    try:
        project = pm.load_project(project_name)
        if clue_name not in project.get("clues", {}):
            raise HTTPException(status_code=404, detail=f"线索 '{clue_name}' 不存在")

        queue = get_generation_queue()
        enqueue_result = queue.enqueue_task(
            project_name=project_name,
            task_type="clue",
            media_type="image",
            resource_id=clue_name,
            payload={
                "prompt": req.prompt,
            },
            source="webui",
        )

        return {
            "success": True,
            **enqueue_result,
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
