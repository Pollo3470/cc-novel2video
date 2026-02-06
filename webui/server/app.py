"""
视频项目管理 WebUI - FastAPI 主应用

启动方式:
    cd cc-novel2video
    python -m uvicorn webui.server.app:app --reload --port 8080
"""

import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from lib.generation_worker import GenerationWorker
from webui.server.routers import (
    projects,
    characters,
    clues,
    files,
    generate,
    versions,
    usage,
    tasks,
)

# 创建 FastAPI 应用
app = FastAPI(
    title="视频项目管理 WebUI",
    description="AI 视频生成工作空间的 Web 管理界面",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册 API 路由
app.include_router(projects.router, prefix="/api/v1", tags=["项目管理"])
app.include_router(characters.router, prefix="/api/v1", tags=["人物管理"])
app.include_router(clues.router, prefix="/api/v1", tags=["线索管理"])
app.include_router(files.router, prefix="/api/v1", tags=["文件管理"])
app.include_router(generate.router, prefix="/api/v1", tags=["生成"])
app.include_router(versions.router, prefix="/api/v1", tags=["版本管理"])
app.include_router(usage.router, prefix="/api/v1", tags=["费用统计"])
app.include_router(tasks.router, prefix="/api/v1", tags=["任务队列"])

# 静态文件服务 - 前端页面
webui_dir = Path(__file__).parent.parent
app.mount("/js", StaticFiles(directory=webui_dir / "js"), name="js")
app.mount("/css", StaticFiles(directory=webui_dir / "css"), name="css")


@app.get("/", include_in_schema=False)
async def serve_index():
    """服务首页"""
    return FileResponse(webui_dir / "index.html")


@app.get("/project.html", include_in_schema=False)
async def serve_project():
    """服务项目详情页"""
    return FileResponse(webui_dir / "project.html")


@app.get("/usage.html", include_in_schema=False)
async def serve_usage():
    """服务费用统计页"""
    return FileResponse(webui_dir / "usage.html")


@app.get("/queue.html", include_in_schema=False)
async def serve_queue():
    """服务全局队列页"""
    return FileResponse(webui_dir / "queue.html")


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "message": "视频项目管理 WebUI 运行正常"}


@app.on_event("startup")
async def startup_generation_worker():
    """启动任务 worker（单活由 lease 控制）。"""
    worker = GenerationWorker()
    app.state.generation_worker = worker
    await worker.start()


@app.on_event("shutdown")
async def shutdown_generation_worker():
    """停止任务 worker。"""
    worker = getattr(app.state, "generation_worker", None)
    if worker:
        await worker.stop()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, reload=True)
