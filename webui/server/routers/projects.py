"""
项目管理路由

处理项目的 CRUD 操作，复用 lib/project_manager.py
"""

import shutil
from typing import Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lib.project_manager import ProjectManager

router = APIRouter()

# 初始化项目管理器
project_root = Path(__file__).parent.parent.parent.parent
pm = ProjectManager(project_root / "projects")


class CreateProjectRequest(BaseModel):
    name: str
    title: str
    style: Optional[str] = ""


class UpdateProjectRequest(BaseModel):
    title: Optional[str] = None
    style: Optional[str] = None


@router.get("/projects")
async def list_projects():
    """列出所有项目"""
    projects = []
    for name in pm.list_projects():
        try:
            # 尝试加载项目元数据
            if pm.project_exists(name):
                project = pm.load_project(name)
                # 获取缩略图（第一个分镜图）
                project_dir = pm.get_project_path(name)
                storyboards_dir = project_dir / "storyboards"
                thumbnail = None
                if storyboards_dir.exists():
                    scene_images = sorted(storyboards_dir.glob("scene_*.png"))
                    if scene_images:
                        thumbnail = f"/api/v1/files/{name}/storyboards/{scene_images[0].name}"

                projects.append({
                    "name": name,
                    "title": project.get("title", name),
                    "style": project.get("style", ""),
                    "thumbnail": thumbnail,
                    "progress": project.get("status", {}).get("progress", {}),
                    "current_phase": project.get("status", {}).get("current_phase", "unknown")
                })
            else:
                # 没有 project.json 的项目
                status = pm.get_project_status(name)
                projects.append({
                    "name": name,
                    "title": name,
                    "style": "",
                    "thumbnail": None,
                    "progress": {},
                    "current_phase": status.get("current_stage", "empty")
                })
        except Exception as e:
            # 出错时返回基本信息
            projects.append({
                "name": name,
                "title": name,
                "style": "",
                "thumbnail": None,
                "progress": {},
                "current_phase": "error",
                "error": str(e)
            })

    return {"projects": projects}


@router.post("/projects")
async def create_project(req: CreateProjectRequest):
    """创建新项目"""
    try:
        # 创建项目目录结构
        pm.create_project(req.name)
        # 创建项目元数据
        project = pm.create_project_metadata(req.name, req.title, req.style)
        return {"success": True, "project": project}
    except FileExistsError:
        raise HTTPException(status_code=400, detail=f"项目 '{req.name}' 已存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{name}")
async def get_project(name: str):
    """获取项目详情"""
    try:
        if not pm.project_exists(name):
            raise HTTPException(status_code=404, detail=f"项目 '{name}' 不存在或未初始化")

        project = pm.load_project(name)

        # 同步项目状态
        project = pm.sync_project_status(name)

        # 加载所有剧本
        scripts = {}
        for ep in project.get("episodes", []):
            script_file = ep.get("script_file", "").replace("scripts/", "")
            if script_file:
                try:
                    scripts[script_file] = pm.load_script(name, script_file)
                except FileNotFoundError:
                    pass

        return {
            "project": project,
            "scripts": scripts
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"项目 '{name}' 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/projects/{name}")
async def update_project(name: str, req: UpdateProjectRequest):
    """更新项目元数据"""
    try:
        project = pm.load_project(name)

        if req.title is not None:
            project["title"] = req.title
        if req.style is not None:
            project["style"] = req.style

        pm.save_project(name, project)
        return {"success": True, "project": project}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"项目 '{name}' 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/projects/{name}")
async def delete_project(name: str):
    """删除项目"""
    try:
        project_dir = pm.get_project_path(name)
        shutil.rmtree(project_dir)
        return {"success": True, "message": f"项目 '{name}' 已删除"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"项目 '{name}' 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{name}/scripts/{script_file}")
async def get_script(name: str, script_file: str):
    """获取剧本内容"""
    try:
        script = pm.load_script(name, script_file)
        return {"script": script}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"剧本 '{script_file}' 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class UpdateSceneRequest(BaseModel):
    script_file: str
    updates: dict


@router.patch("/projects/{name}/scenes/{scene_id}")
async def update_scene(name: str, scene_id: str, req: UpdateSceneRequest):
    """更新场景"""
    try:
        script = pm.load_script(name, req.script_file)

        # 找到并更新场景
        scene_found = False
        for scene in script.get("scenes", []):
            if scene.get("scene_id") == scene_id:
                scene_found = True
                # 更新允许的字段
                for key, value in req.updates.items():
                    if key in ["duration_seconds", "visual", "audio", "dialogue",
                               "characters_in_scene", "clues_in_scene", "segment_break"]:
                        scene[key] = value
                break

        if not scene_found:
            raise HTTPException(status_code=404, detail=f"场景 '{scene_id}' 不存在")

        pm.save_script(name, script, req.script_file)
        return {"success": True, "scene": scene}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"剧本不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
