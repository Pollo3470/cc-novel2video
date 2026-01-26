"""
文件管理路由

处理文件上传和静态资源服务
"""

import os
import urllib.parse
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Body
from fastapi.responses import FileResponse, PlainTextResponse

from lib.project_manager import ProjectManager

router = APIRouter()

# 初始化项目管理器
project_root = Path(__file__).parent.parent.parent.parent
pm = ProjectManager(project_root / "projects")

# 允许的文件类型
ALLOWED_EXTENSIONS = {
    "source": [".txt", ".md", ".doc", ".docx"],
    "character": [".png", ".jpg", ".jpeg", ".webp"],
    "clue": [".png", ".jpg", ".jpeg", ".webp"],
    "storyboard": [".png", ".jpg", ".jpeg", ".webp"],
}


@router.get("/files/{project_name}/{path:path}")
async def serve_project_file(project_name: str, path: str):
    """服务项目内的静态文件（图片/视频）"""
    try:
        project_dir = pm.get_project_path(project_name)
        file_path = project_dir / path

        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"文件不存在: {path}")

        # 安全检查：确保路径在项目目录内
        try:
            file_path.resolve().relative_to(project_dir.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="禁止访问项目目录外的文件")

        return FileResponse(file_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"项目 '{project_name}' 不存在")


@router.post("/projects/{project_name}/upload/{upload_type}")
async def upload_file(
    project_name: str,
    upload_type: str,
    file: UploadFile = File(...),
    name: str = None
):
    """
    上传文件

    Args:
        project_name: 项目名称
        upload_type: 上传类型 (source/character/clue)
        file: 上传的文件
        name: 可选，用于人物/线索名称（自动更新元数据）
    """
    if upload_type not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"无效的上传类型: {upload_type}")

    # 检查文件扩展名
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS[upload_type]:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型 {ext}，允许的类型: {ALLOWED_EXTENSIONS[upload_type]}"
        )

    try:
        project_dir = pm.get_project_path(project_name)

        # 确定目标目录
        if upload_type == "source":
            target_dir = project_dir / "source"
            filename = file.filename
        elif upload_type == "character":
            target_dir = project_dir / "characters"
            # 使用提供的名称或原文件名
            filename = f"{name}{ext}" if name else file.filename
        elif upload_type == "clue":
            target_dir = project_dir / "clues"
            filename = f"{name}{ext}" if name else file.filename
        else:
            target_dir = project_dir / upload_type
            filename = file.filename

        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / filename

        # 保存文件
        content = await file.read()
        with open(target_path, "wb") as f:
            f.write(content)

        # 更新元数据
        relative_path = f"{upload_type}s/{filename}" if upload_type != "source" else f"source/{filename}"

        if upload_type == "character" and name:
            try:
                pm.update_project_character_sheet(project_name, name, f"characters/{filename}")
            except KeyError:
                pass  # 人物不存在，忽略

        if upload_type == "clue" and name:
            try:
                pm.update_clue_sheet(project_name, name, f"clues/{filename}")
            except KeyError:
                pass  # 线索不存在，忽略

        return {
            "success": True,
            "filename": filename,
            "path": relative_path,
            "url": f"/api/v1/files/{project_name}/{relative_path}"
        }

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"项目 '{project_name}' 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_name}/files")
async def list_project_files(project_name: str):
    """列出项目中的所有文件"""
    try:
        project_dir = pm.get_project_path(project_name)

        files = {
            "source": [],
            "characters": [],
            "clues": [],
            "storyboards": [],
            "videos": [],
            "output": []
        }

        for subdir, file_list in files.items():
            subdir_path = project_dir / subdir
            if subdir_path.exists():
                for f in subdir_path.iterdir():
                    if f.is_file() and not f.name.startswith("."):
                        file_list.append({
                            "name": f.name,
                            "size": f.stat().st_size,
                            "url": f"/api/v1/files/{project_name}/{subdir}/{f.name}"
                        })

        return {"files": files}

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"项目 '{project_name}' 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_name}/source/{filename}")
async def get_source_file(project_name: str, filename: str):
    """获取 source 文件的文本内容"""
    try:
        project_dir = pm.get_project_path(project_name)
        source_path = project_dir / "source" / filename

        if not source_path.exists():
            raise HTTPException(status_code=404, detail=f"文件不存在: {filename}")

        # 安全检查：确保路径在项目目录内
        try:
            source_path.resolve().relative_to(project_dir.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="禁止访问项目目录外的文件")

        content = source_path.read_text(encoding="utf-8")
        return PlainTextResponse(content)

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"项目 '{project_name}' 不存在")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="文件编码错误，无法读取")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/projects/{project_name}/source/{filename}")
async def update_source_file(project_name: str, filename: str, content: str = Body(..., media_type="text/plain")):
    """更新或创建 source 文件"""
    try:
        project_dir = pm.get_project_path(project_name)
        source_dir = project_dir / "source"
        source_dir.mkdir(parents=True, exist_ok=True)
        source_path = source_dir / filename

        # 安全检查：确保路径在项目目录内
        try:
            source_path.resolve().relative_to(project_dir.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="禁止访问项目目录外的文件")

        source_path.write_text(content, encoding="utf-8")
        return {"success": True, "path": f"source/{filename}"}

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"项目 '{project_name}' 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/projects/{project_name}/source/{filename}")
async def delete_source_file(project_name: str, filename: str):
    """删除 source 文件"""
    try:
        project_dir = pm.get_project_path(project_name)
        source_path = project_dir / "source" / filename

        # 安全检查：确保路径在项目目录内
        try:
            source_path.resolve().relative_to(project_dir.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="禁止访问项目目录外的文件")

        if source_path.exists():
            source_path.unlink()
            return {"success": True}
        else:
            raise HTTPException(status_code=404, detail=f"文件不存在: {filename}")

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"项目 '{project_name}' 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
