"""
Gemini API 统一封装

提供图片生成和视频生成的统一接口。
"""

import os
import time
import base64
import functools
import random
import asyncio
from pathlib import Path
from typing import Optional, List, Union, Tuple, Type, Dict
from PIL import Image
import io
import threading
from collections import deque

# 可重试的错误类型
RETRYABLE_ERRORS: Tuple[Type[Exception], ...] = (
    ConnectionError,
    TimeoutError,
)

# 尝试导入 Google API 错误类型
try:
    from google.api_core import exceptions as google_exceptions
    from google import genai # Import genai to access its errors

    RETRYABLE_ERRORS = RETRYABLE_ERRORS + (
        google_exceptions.ResourceExhausted,  # 429 Too Many Requests
        google_exceptions.ServiceUnavailable,  # 503
        google_exceptions.DeadlineExceeded,    # 超时
        google_exceptions.InternalServerError, # 500
        genai.errors.ClientError, # 4xx errors from new SDK
        genai.errors.ServerError, # 5xx errors from new SDK
    )
except ImportError:
    pass


class RateLimiter:
    """
    多模型滑动窗口限流器
    """
    def __init__(self, limits_dict: Dict[str, int] = None):
        """
        Args:
            limits_dict: {model_name: rpm} 字典。例如 {"gemini-3-pro-image-preview": 20}
        """
        self.limits = limits_dict or {}
        # 存储请求时间戳：{model_name: deque([timestamp1, timestamp2, ...])}
        self.request_logs: Dict[str, deque] = {}
        self.lock = threading.Lock()

    def acquire(self, model_name: str):
        """
        阻塞直到获得令牌
        """
        if model_name not in self.limits:
            return  # 该模型无限流配置

        limit = self.limits[model_name]
        if limit <= 0:
            return

        with self.lock:
            if model_name not in self.request_logs:
                self.request_logs[model_name] = deque()

            log = self.request_logs[model_name]

            while True:
                now = time.time()

                # 清理超过 60 秒的旧记录
                while log and now - log[0] > 60:
                    log.popleft()

                # 强制增加请求间隔（用户要求 > 3s）
                # 即使获得了令牌，也要确保距离上一次请求至少 3s
                # 获取最新的请求时间（可能是其他线程刚刚写入的）
                min_gap = float(os.environ.get('GEMINI_REQUEST_GAP', 3.1))
                if log:
                    last_request = log[-1]
                    gap = time.time() - last_request
                    if gap < min_gap:
                        time.sleep(min_gap - gap)
                        # 更新时间，重新检查
                        continue

                if len(log) < limit:
                    # 获取令牌成功
                    log.append(time.time())
                    return

                # 达到限制，计算等待时间
                # 等待直到最早的记录过期
                wait_time = 60 - (now - log[0]) + 0.1  # 多加 0.1s 缓冲
                if wait_time > 0:
                    time.sleep(wait_time)

    async def acquire_async(self, model_name: str):
        """
        异步阻塞直到获得令牌
        """
        if model_name not in self.limits:
            return  # 该模型无限流配置

        limit = self.limits[model_name]
        if limit <= 0:
            return

        while True:
            with self.lock:
                now = time.time()

                if model_name not in self.request_logs:
                    self.request_logs[model_name] = deque()

                log = self.request_logs[model_name]

                # 清理超过 60 秒的旧记录
                while log and now - log[0] > 60:
                    log.popleft()

                min_gap = float(os.environ.get('GEMINI_REQUEST_GAP', 3.1))
                wait_needed = 0
                if log:
                    last_request = log[-1]
                    gap = now - last_request
                    if gap < min_gap:
                        # 释放锁后异步等待
                        wait_needed = min_gap - gap

                if len(log) >= limit:
                    # 达到限制，计算等待时间
                    wait_needed = max(wait_needed, 60 - (now - log[0]) + 0.1)

                if wait_needed == 0 and len(log) < limit:
                    # 获取令牌成功
                    log.append(now)
                    return

            # 在锁外异步等待
            if wait_needed > 0:
                await asyncio.sleep(wait_needed)
            else:
                await asyncio.sleep(0.1)  # 短暂让出控制权


def with_retry(
    max_attempts: int = 5,
    backoff_seconds: Tuple[int, ...] = (2, 4, 8, 16, 32),
    retryable_errors: Tuple[Type[Exception], ...] = RETRYABLE_ERRORS
):
    """
    带指数退避的重试装饰器
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # 尝试提取 output_path 以便在日志中显示上下文
            output_path = kwargs.get('output_path')
            # 如果是位置参数，generate_image 的 output_path 是第 5 个参数 (self, prompt, ref, ar, output_path)
            if not output_path and len(args) > 4:
                output_path = args[4]

            context_str = ""
            if output_path:
                context_str = f"[{Path(output_path).name}] "

            last_error = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    # Catch ALL exceptions and check if they look like a retryable error
                    last_error = e
                    should_retry = False

                    # Check if it's in our explicit list
                    if isinstance(e, retryable_errors):
                        should_retry = True

                    # Check by string analysis (catch-all for 429/500/503)
                    error_str = str(e)
                    if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str:
                        should_retry = True
                    elif '500' in error_str or 'InternalServerError' in error_str:
                        should_retry = True
                    elif '503' in error_str or 'ServiceUnavailable' in error_str:
                        should_retry = True

                    if not should_retry:
                        raise e

                    if attempt < max_attempts - 1:
                        # 确保不超过 backoff 数组长度
                        backoff_idx = min(attempt, len(backoff_seconds) - 1)
                        base_wait = backoff_seconds[backoff_idx]
                        jitter = random.uniform(0, 2)  # 0-2秒随机抖动
                        wait_time = base_wait + jitter
                        print(f"⚠️  {context_str}捕获异常: {type(e).__name__} - {str(e)[:100]}...")
                        print(f"⚠️  {context_str}重试 {attempt + 1}/{max_attempts - 1}，{wait_time:.1f}秒后...")
                        time.sleep(wait_time)
            raise last_error
        return wrapper
    return decorator


def with_retry_async(
    max_attempts: int = 5,
    backoff_seconds: Tuple[int, ...] = (2, 4, 8, 16, 32),
    retryable_errors: Tuple[Type[Exception], ...] = RETRYABLE_ERRORS
):
    """
    异步函数重试装饰器，带指数退避和随机抖动
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # 尝试提取 output_path 以便在日志中显示上下文
            output_path = kwargs.get('output_path')
            if not output_path and len(args) > 4:
                output_path = args[4]

            context_str = ""
            if output_path:
                context_str = f"[{Path(output_path).name}] "

            last_error = None
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    should_retry = False

                    if isinstance(e, retryable_errors):
                        should_retry = True

                    error_str = str(e)
                    if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str:
                        should_retry = True
                    elif '500' in error_str or 'InternalServerError' in error_str:
                        should_retry = True
                    elif '503' in error_str or 'ServiceUnavailable' in error_str:
                        should_retry = True

                    if not should_retry:
                        raise e

                    if attempt < max_attempts - 1:
                        backoff_idx = min(attempt, len(backoff_seconds) - 1)
                        base_wait = backoff_seconds[backoff_idx]
                        jitter = random.uniform(0, 2)  # 0-2秒随机抖动
                        wait_time = base_wait + jitter
                        print(f"⚠️  {context_str}捕获异常: {type(e).__name__} - {str(e)[:100]}...")
                        print(f"⚠️  {context_str}重试 {attempt + 1}/{max_attempts - 1}，{wait_time:.1f}秒后...")
                        await asyncio.sleep(wait_time)
            raise last_error
        return wrapper
    return decorator


# 加载 .env 文件
try:
    from dotenv import load_dotenv
    # 从项目根目录加载 .env
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
    else:
        # 也尝试从当前工作目录加载
        load_dotenv()
except ImportError:
    pass  # python-dotenv 未安装时跳过


class GeminiClient:
    """Gemini API 客户端封装"""

    # 跳过名称推断的文件名模式
    SKIP_NAME_PATTERNS = ('grid_', 'scene_', 'storyboard_', 'output_')

    def __init__(self, api_key: Optional[str] = None, rate_limiter: Optional[RateLimiter] = None):
        """
        初始化 Gemini 客户端

        支持两种后端：
        - AI Studio（默认）：使用 GEMINI_API_KEY
        - Vertex AI：使用 GCP 项目和应用默认凭据

        通过环境变量 GEMINI_BACKEND 切换：
        - GEMINI_BACKEND=aistudio（默认）
        - GEMINI_BACKEND=vertex

        Args:
            api_key: API 密钥（仅 AI Studio 模式），默认从环境变量 GEMINI_API_KEY 读取
            rate_limiter: 可选的限流器实例
        """
        from google import genai
        from google.genai import types

        self.types = types
        self.rate_limiter = rate_limiter
        self.backend = os.environ.get('GEMINI_BACKEND', 'aistudio').lower()
        self.credentials = None  # 用于 Vertex AI 模式
        self.project_id = None   # 用于 Vertex AI 模式
        self.gcs_bucket = None   # 用于 Vertex AI 模式的视频延长输出

        if self.backend == 'vertex':
            # Vertex AI 模式（使用 JSON 服务账号凭证）
            from google.oauth2 import service_account
            import json as json_module

            # 查找凭证文件
            credentials_dir = Path(__file__).parent.parent / 'vertex_keys'
            credentials_files = list(credentials_dir.glob('*.json')) if credentials_dir.exists() else []

            if not credentials_files:
                raise ValueError(
                    "未找到 Vertex AI 凭证文件\n"
                    "请将服务账号 JSON 文件放入 vertex_keys/ 目录"
                )

            credentials_file = credentials_files[0]  # 取第一个文件

            # 从凭证文件读取项目 ID
            with open(credentials_file) as f:
                creds_data = json_module.load(f)
            self.project_id = creds_data.get('project_id')

            if not self.project_id:
                raise ValueError(f"凭证文件 {credentials_file} 中未找到 project_id")

            # 读取 GCS bucket 配置（用于视频延长）
            self.gcs_bucket = os.environ.get('VERTEX_GCS_BUCKET')

            # 加载服务账号凭证并添加必要的 scopes
            VERTEX_SCOPES = [
                "https://www.googleapis.com/auth/cloud-platform",
                "https://www.googleapis.com/auth/generative-language",
            ]
            self.credentials = service_account.Credentials.from_service_account_file(
                str(credentials_file),
                scopes=VERTEX_SCOPES
            )

            self.client = genai.Client(
                vertexai=True,
                project=self.project_id,
                location="us-central1",
                credentials=self.credentials,
            )
            print(f"✓ 使用 Vertex AI 后端（凭证: {credentials_file.name}）")
        else:
            # AI Studio 模式（默认）
            self.api_key = api_key or os.environ.get('GEMINI_API_KEY')
            if not self.api_key:
                raise ValueError(
                    "GEMINI_API_KEY 环境变量未设置\n"
                    "请在 .env 文件中添加：GEMINI_API_KEY=your-api-key"
                )

            self.client = genai.Client(api_key=self.api_key)
            print("✓ 使用 AI Studio 后端")

        # 模型配置（两种后端使用相同的模型名）
        self.IMAGE_MODEL = "gemini-3-pro-image-preview"
        self.VIDEO_MODEL = "veo-3.1-generate-preview"

    def _extract_name_from_path(self, image: Union[str, Path, Image.Image]) -> Optional[str]:
        """
        从图片路径推断名称

        Args:
            image: 图片路径或 PIL Image 对象

        Returns:
            推断出的名称，或 None（无法推断时）

        Examples:
            characters/姜月茴.png → "姜月茴"
            clues/玉佩.png → "玉佩"
            storyboards/grid_001.png → None (跳过)
            PIL.Image.Image → None (跳过)
        """
        # PIL Image 对象无法推断
        if isinstance(image, Image.Image):
            return None

        path = Path(image)
        filename = path.stem  # 不含扩展名的文件名

        # 跳过通用文件名模式
        for pattern in self.SKIP_NAME_PATTERNS:
            if filename.startswith(pattern):
                return None

        return filename

    def _build_contents_with_labeled_refs(
        self,
        prompt: str,
        reference_images: Optional[List[Union[str, Path, Image.Image]]] = None
    ) -> List:
        """
        构建带名称标签的 contents 列表

        格式：[名称1, 图片1, 名称2, 图片2, ..., prompt]
        - 每张参考图片前添加名称标签（如果能推断）
        - prompt 放在最后

        Args:
            prompt: 图片生成提示词
            reference_images: 参考图片列表

        Returns:
            构建好的 contents 列表
        """
        contents = []

        # 添加带标签的参考图片
        if reference_images:
            labeled_refs = []
            for img in reference_images:
                name = self._extract_name_from_path(img)
                if name:
                    labeled_refs.append(name)
                    contents.append(name)

                # 加载图片
                if isinstance(img, (str, Path)):
                    loaded_img = Image.open(img)
                else:
                    loaded_img = img
                contents.append(loaded_img)

            # 打印日志
            if labeled_refs:
                print(f"📝 参考图片标签: {', '.join(labeled_refs)}")

        # prompt 放最后
        contents.append(prompt)

        return contents

    def _prepare_image_config(self, aspect_ratio: str):
        """构建图片生成配置"""
        return self.types.GenerateContentConfig(
            response_modalities=['TEXT', 'IMAGE'],
            image_config=self.types.ImageConfig(
                aspect_ratio=aspect_ratio
            )
        )

    def _process_image_response(
        self,
        response,
        output_path: Optional[Union[str, Path]] = None
    ) -> Image.Image:
        """解析图片生成响应并可选保存"""
        for part in response.parts:
            if part.inline_data is not None:
                image = part.as_image()
                if output_path:
                    output_path = Path(output_path)
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    image.save(output_path)
                return image
        raise RuntimeError("API 未返回图片")

    @with_retry(max_attempts=5, backoff_seconds=(2, 4, 8, 16, 32))
    def generate_image(
        self,
        prompt: str,
        reference_images: Optional[List[Union[str, Path, Image.Image]]] = None,
        aspect_ratio: str = "9:16",
        output_path: Optional[Union[str, Path]] = None
    ) -> Image.Image:
        """
        生成图片

        Args:
            prompt: 图片生成提示词
            reference_images: 参考图片列表（用于人物一致性）
            aspect_ratio: 宽高比，默认 9:16（竖屏）
            output_path: 可选的输出路径

        Returns:
            生成的 PIL Image 对象
        """
        # 应用限流
        if self.rate_limiter:
            self.rate_limiter.acquire(self.IMAGE_MODEL)

        # 构建带名称标签的 contents（参考图在前，prompt 在后）
        contents = self._build_contents_with_labeled_refs(prompt, reference_images)
        config = self._prepare_image_config(aspect_ratio)

        # 调用 API
        response = self.client.models.generate_content(
            model=self.IMAGE_MODEL,
            contents=contents,
            config=config
        )

        return self._process_image_response(response, output_path)

    @with_retry_async(max_attempts=5, backoff_seconds=(2, 4, 8, 16, 32))
    async def generate_image_async(
        self,
        prompt: str,
        reference_images: Optional[List[Union[str, Path, Image.Image]]] = None,
        aspect_ratio: str = "9:16",
        output_path: Optional[Union[str, Path]] = None
    ) -> Image.Image:
        """
        异步生成图片

        使用 genai 原生异步 API: client.aio.models.generate_content()

        Args:
            prompt: 图片生成提示词
            reference_images: 参考图片列表（用于人物一致性）
            aspect_ratio: 宽高比，默认 9:16（竖屏）
            output_path: 可选的输出路径

        Returns:
            生成的 PIL Image 对象
        """
        # 应用限流
        if self.rate_limiter:
            await self.rate_limiter.acquire_async(self.IMAGE_MODEL)

        # 构建带名称标签的 contents（参考图在前，prompt 在后）
        contents = self._build_contents_with_labeled_refs(prompt, reference_images)
        config = self._prepare_image_config(aspect_ratio)

        # 调用异步 API
        response = await self.client.aio.models.generate_content(
            model=self.IMAGE_MODEL,
            contents=contents,
            config=config
        )

        return self._process_image_response(response, output_path)

    @with_retry(max_attempts=3, backoff_seconds=(2, 4, 8))
    def generate_image_with_chat(
        self,
        prompt: str,
        chat_session=None,
        reference_images: Optional[List[Union[str, Path, Image.Image]]] = None
    ) -> tuple:
        """
        使用多轮对话生成图片（保持上下文一致性）

        Args:
            prompt: 图片生成提示词
            chat_session: 现有的对话会话，如果为 None 则创建新会话
            reference_images: 参考图片列表

        Returns:
            (生成的图片, 对话会话) 元组
        """
        # 应用限流
        if self.rate_limiter:
            self.rate_limiter.acquire(self.IMAGE_MODEL)

        if chat_session is None:
            chat_session = self.client.chats.create(
                model=self.IMAGE_MODEL
            )

        # 构建带名称标签的消息内容（参考图在前，prompt 在后）
        message_content = self._build_contents_with_labeled_refs(prompt, reference_images)

        # 发送消息
        response = chat_session.send_message(message_content)

        # 提取图片
        for part in response.parts:
            if part.inline_data is not None:
                image = part.as_image()
                return image, chat_session

        raise RuntimeError("API 未返回图片")

    @with_retry(max_attempts=3, backoff_seconds=(2, 4, 8))
    def generate_video(
        self,
        prompt: str,
        # 生成模式参数
        start_image: Optional[Union[str, Path, Image.Image]] = None,
        reference_images: Optional[List[dict]] = None,
        # 延长模式参数
        video: Optional[Union[str, Path]] = None,
        # 配置参数
        aspect_ratio: str = "9:16",
        duration_seconds: str = "8",
        resolution: str = "720p",
        negative_prompt: str = "background music, BGM, soundtrack, musical accompaniment",
        output_path: Optional[Union[str, Path]] = None,
        output_gcs_uri: Optional[str] = None,
        poll_interval: int = 10,
        max_wait_time: int = 600
    ) -> tuple:
        """
        统一的视频生成/延长方法

        Args:
            prompt: 视频生成/延长提示词（支持对话和音效描述）

            # 生成模式参数
            start_image: 起始帧图片（image-to-video 模式）
            reference_images: 参考图片列表，格式为 [{"image": path, "description": str}]

            # 延长模式参数
            video: 要延长的视频，支持以下类型：
                - Video 对象（来自之前调用的返回值）
                - URI 字符串（gs:// 或 https://）
                - 本地视频文件路径

            # 配置参数
            aspect_ratio: 宽高比，默认 9:16（生成模式使用）
            duration_seconds: 视频时长，可选 "4", "6", "8"（生成模式使用）
            resolution: 分辨率，可选 "720p", "1080p", "4k"（延长模式强制 720p）
            negative_prompt: 负面提示词，指定不想要的元素（默认禁止 BGM）
            output_path: 本地输出路径
            output_gcs_uri: GCS 输出路径（Vertex AI 延长模式必须设置）
            poll_interval: 轮询间隔（秒）
            max_wait_time: 最大等待时间（秒）

        Returns:
            (output_path, video_ref, video_uri) 三元组：
            - output_path: 视频文件路径（如果指定了 output_path）
            - video_ref: Video 对象，用于后续 extend_video()
            - video_uri: 字符串 URI，可保存用于跨会话恢复

        Examples:
            # 1. 生成视频（从起始帧）
            path, ref, uri = client.generate_video(
                prompt="角色缓慢转身...",
                start_image="storyboard.png",
                output_path="output.mp4"
            )

            # 2. 延长视频（使用返回的 ref）
            path2, ref2, uri2 = client.generate_video(
                prompt="继续当前动作...",
                video=ref,
                output_path="output_extended.mp4"
            )

            # 3. 延长视频（使用本地文件）
            path3, ref3, uri3 = client.generate_video(
                prompt="继续...",
                video="output.mp4",
                output_path="output_extended2.mp4"
            )
        """
        # 应用限流
        if self.rate_limiter:
            self.rate_limiter.acquire(self.VIDEO_MODEL)

        # 判断模式：如果提供了 video 参数则为延长模式
        is_extend_mode = video is not None

        if is_extend_mode:
            # ===== 延长模式 =====
            # 延长模式必须使用 720p，固定 7 秒
            config_params = {
                "number_of_videos": 1,
                "resolution": "720p",
                "duration_seconds": 7,
                "generate_audio": True,
            }

            # Vertex AI 模式需要 output_gcs_uri
            # 如果未提供，自动从环境变量构建
            if self.backend == 'vertex':
                if not output_gcs_uri and self.gcs_bucket:
                    # 根据 output_path 生成 GCS URI
                    if output_path:
                        filename = Path(output_path).name
                    else:
                        import uuid
                        filename = f"extend_{uuid.uuid4().hex[:8]}.mp4"
                    output_gcs_uri = f"gs://{self.gcs_bucket}/video_extend/{filename}"

                if output_gcs_uri:
                    config_params["output_gcs_uri"] = output_gcs_uri
                else:
                    raise ValueError(
                        "Vertex AI 模式下延长视频需要 output_gcs_uri 或设置 VERTEX_GCS_BUCKET 环境变量"
                    )

            config = self.types.GenerateVideosConfig(**config_params)

            # 准备视频参数
            video_param, video_bytes = self._prepare_video_param(video)

            if self.backend == 'vertex':
                # Vertex AI 模式：使用 source 参数和 video_bytes
                if video_bytes is None:
                    raise ValueError(
                        "Vertex AI 模式下延长视频需要提供 video_bytes，"
                        "请传入本地视频文件路径或包含 video_bytes 的 Video 对象"
                    )

                source = self.types.GenerateVideosSource(
                    prompt=prompt,
                    video=self.types.Video(
                        video_bytes=video_bytes,
                        mime_type="video/mp4",
                    ),
                )

                operation = self.client.models.generate_videos(
                    model=self.VIDEO_MODEL,
                    source=source,
                    config=config
                )
            else:
                # AI Studio 模式：使用 video 参数
                operation = self.client.models.generate_videos(
                    model=self.VIDEO_MODEL,
                    video=video_param,
                    prompt=prompt,
                    config=config
                )
        else:
            # ===== 生成模式 =====
            # 构建配置
            config = self.types.GenerateVideosConfig(
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                duration_seconds=duration_seconds,
                negative_prompt=negative_prompt
            )

            # 准备起始帧
            image_param = self._prepare_image_param(start_image)

            # 调用 API
            operation = self.client.models.generate_videos(
                model=self.VIDEO_MODEL,
                prompt=prompt,
                image=image_param,
                config=config
            )

        # 等待完成
        elapsed = 0
        mode_text = "扩展" if is_extend_mode else "生成"
        while not operation.done:
            if elapsed >= max_wait_time:
                raise TimeoutError(f"视频{mode_text}超时（{max_wait_time}秒）")
            time.sleep(poll_interval)
            elapsed += poll_interval
            operation = self.client.operations.get(operation)
            print(f"视频{mode_text}中... 已等待 {elapsed} 秒")

        # 检查结果
        if not operation.response or not operation.response.generated_videos:
            print(f"DEBUG: Operation details: {operation}")
            if hasattr(operation, 'error') and operation.error:
                raise RuntimeError(f"视频{mode_text}失败: {operation.error}")
            raise RuntimeError(f"视频{mode_text}失败: API 返回空结果")

        # 获取生成的视频和引用
        generated_video = operation.response.generated_videos[0]
        video_ref = generated_video.video
        video_uri = video_ref.uri if video_ref else None

        if output_path:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            if is_extend_mode and self.backend == 'vertex' and output_gcs_uri:
                # 从 GCS 下载视频
                from google.cloud import storage

                # 使用返回的实际 URI
                actual_gcs_uri = video_uri if video_uri else output_gcs_uri

                # 解析 gs://bucket-name/path/to/file
                gcs_parts = actual_gcs_uri.replace('gs://', '').split('/', 1)
                bucket_name = gcs_parts[0]
                blob_name = gcs_parts[1] if len(gcs_parts) > 1 else ''

                storage_client = storage.Client(
                    credentials=self.credentials,
                    project=self.project_id
                )
                bucket = storage_client.bucket(bucket_name)
                blob = bucket.blob(blob_name)
                blob.download_to_filename(str(output_path))
                print(f"✓ 已从 {actual_gcs_uri} 下载视频")
            else:
                # 下载视频文件
                self._download_video(video_ref, output_path)

            return output_path, video_ref, video_uri

        return None, video_ref, video_uri

    def _prepare_video_generate_config(
        self,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: str,
        negative_prompt: str
    ):
        """构建视频生成配置"""
        return self.types.GenerateVideosConfig(
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_seconds=duration_seconds,
            negative_prompt=negative_prompt
        )

    def _prepare_video_extend_config(
        self,
        output_gcs_uri: Optional[str] = None
    ):
        """构建视频延长配置"""
        config_params = {
            "number_of_videos": 1,
            "resolution": "720p",
            "duration_seconds": 7,
            "generate_audio": True,
        }
        if output_gcs_uri:
            config_params["output_gcs_uri"] = output_gcs_uri
        return self.types.GenerateVideosConfig(**config_params)

    def _process_video_result(
        self,
        operation,
        output_path: Optional[Union[str, Path]],
        is_extend_mode: bool,
        output_gcs_uri: Optional[str] = None
    ) -> tuple:
        """处理视频生成结果，下载并保存"""
        mode_text = "扩展" if is_extend_mode else "生成"

        # 检查结果
        if not operation.response or not operation.response.generated_videos:
            print(f"DEBUG: Operation details: {operation}")
            if hasattr(operation, 'error') and operation.error:
                raise RuntimeError(f"视频{mode_text}失败: {operation.error}")
            raise RuntimeError(f"视频{mode_text}失败: API 返回空结果")

        # 获取生成的视频和引用
        generated_video = operation.response.generated_videos[0]
        video_ref = generated_video.video
        video_uri = video_ref.uri if video_ref else None

        if output_path:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            if is_extend_mode and self.backend == 'vertex' and output_gcs_uri:
                # 从 GCS 下载视频
                from google.cloud import storage

                # 使用返回的实际 URI
                actual_gcs_uri = video_uri if video_uri else output_gcs_uri

                # 解析 gs://bucket-name/path/to/file
                gcs_parts = actual_gcs_uri.replace('gs://', '').split('/', 1)
                bucket_name = gcs_parts[0]
                blob_name = gcs_parts[1] if len(gcs_parts) > 1 else ''

                storage_client = storage.Client(
                    credentials=self.credentials,
                    project=self.project_id
                )
                bucket = storage_client.bucket(bucket_name)
                blob = bucket.blob(blob_name)
                blob.download_to_filename(str(output_path))
                print(f"✓ 已从 {actual_gcs_uri} 下载视频")
            else:
                # 下载视频文件
                self._download_video(video_ref, output_path)

            return output_path, video_ref, video_uri

        return None, video_ref, video_uri

    @with_retry_async(max_attempts=3, backoff_seconds=(2, 4, 8))
    async def generate_video_async(
        self,
        prompt: str,
        # 生成模式参数
        start_image: Optional[Union[str, Path, Image.Image]] = None,
        reference_images: Optional[List[dict]] = None,
        # 延长模式参数
        video: Optional[Union[str, Path]] = None,
        # 配置参数
        aspect_ratio: str = "9:16",
        duration_seconds: str = "8",
        resolution: str = "720p",
        negative_prompt: str = "background music, BGM, soundtrack, musical accompaniment",
        output_path: Optional[Union[str, Path]] = None,
        output_gcs_uri: Optional[str] = None,
        poll_interval: int = 10,
        max_wait_time: int = 600
    ) -> tuple:
        """
        异步生成/延长视频

        使用 genai 原生异步 API: client.aio.models.generate_videos()

        Args:
            prompt: 视频生成/延长提示词（支持对话和音效描述）

            # 生成模式参数
            start_image: 起始帧图片（image-to-video 模式）
            reference_images: 参考图片列表，格式为 [{"image": path, "description": str}]

            # 延长模式参数
            video: 要延长的视频，支持以下类型：
                - Video 对象（来自之前调用的返回值）
                - URI 字符串（gs:// 或 https://）
                - 本地视频文件路径

            # 配置参数
            aspect_ratio: 宽高比，默认 9:16（生成模式使用）
            duration_seconds: 视频时长，可选 "4", "6", "8"（生成模式使用）
            resolution: 分辨率，可选 "720p", "1080p", "4k"（延长模式强制 720p）
            negative_prompt: 负面提示词，指定不想要的元素（默认禁止 BGM）
            output_path: 本地输出路径
            output_gcs_uri: GCS 输出路径（Vertex AI 延长模式必须设置）
            poll_interval: 轮询间隔（秒）
            max_wait_time: 最大等待时间（秒）

        Returns:
            (output_path, video_ref, video_uri) 三元组
        """
        # 应用限流
        if self.rate_limiter:
            await self.rate_limiter.acquire_async(self.VIDEO_MODEL)

        # 判断模式：如果提供了 video 参数则为延长模式
        is_extend_mode = video is not None

        if is_extend_mode:
            # ===== 延长模式 =====
            # Vertex AI 模式需要 output_gcs_uri
            if self.backend == 'vertex':
                if not output_gcs_uri and self.gcs_bucket:
                    if output_path:
                        filename = Path(output_path).name
                    else:
                        import uuid
                        filename = f"extend_{uuid.uuid4().hex[:8]}.mp4"
                    output_gcs_uri = f"gs://{self.gcs_bucket}/video_extend/{filename}"

                if not output_gcs_uri:
                    raise ValueError(
                        "Vertex AI 模式下延长视频需要 output_gcs_uri 或设置 VERTEX_GCS_BUCKET 环境变量"
                    )

            config = self._prepare_video_extend_config(output_gcs_uri)

            # 准备视频参数
            video_param, video_bytes = self._prepare_video_param(video)

            if self.backend == 'vertex':
                if video_bytes is None:
                    raise ValueError(
                        "Vertex AI 模式下延长视频需要提供 video_bytes，"
                        "请传入本地视频文件路径或包含 video_bytes 的 Video 对象"
                    )

                source = self.types.GenerateVideosSource(
                    prompt=prompt,
                    video=self.types.Video(
                        video_bytes=video_bytes,
                        mime_type="video/mp4",
                    ),
                )

                operation = await self.client.aio.models.generate_videos(
                    model=self.VIDEO_MODEL,
                    source=source,
                    config=config
                )
            else:
                # AI Studio 模式
                operation = await self.client.aio.models.generate_videos(
                    model=self.VIDEO_MODEL,
                    video=video_param,
                    prompt=prompt,
                    config=config
                )
        else:
            # ===== 生成模式 =====
            config = self._prepare_video_generate_config(
                aspect_ratio, resolution, duration_seconds, negative_prompt
            )

            # 准备起始帧
            image_param = self._prepare_image_param(start_image)

            # 调用异步 API
            operation = await self.client.aio.models.generate_videos(
                model=self.VIDEO_MODEL,
                prompt=prompt,
                image=image_param,
                config=config
            )

        # 异步等待完成
        elapsed = 0
        mode_text = "扩展" if is_extend_mode else "生成"
        while not operation.done:
            if elapsed >= max_wait_time:
                raise TimeoutError(f"视频{mode_text}超时（{max_wait_time}秒）")
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval
            operation = await self.client.aio.operations.get(operation)
            print(f"视频{mode_text}中... 已等待 {elapsed} 秒")

        return self._process_video_result(operation, output_path, is_extend_mode, output_gcs_uri)

    def _prepare_text_config(
        self,
        response_schema: Optional[Dict]
    ) -> Optional[Dict]:
        """构建文本生成配置"""
        if response_schema:
            return {
                "response_mime_type": "application/json",
                "response_json_schema": response_schema,
            }
        return None

    def _process_text_response(self, response) -> str:
        """解析文本生成响应"""
        return response.text

    @with_retry(max_attempts=3, backoff_seconds=(2, 4, 8))
    def generate_text(
        self,
        prompt: str,
        model: str = "gemini-2.0-flash",
        response_schema: Optional[Dict] = None,
    ) -> str:
        """
        生成文本内容，支持 Structured Outputs

        Args:
            prompt: 提示词
            model: 模型名称，默认使用 flash 模型
            response_schema: 可选的 JSON Schema，用于 Structured Outputs

        Returns:
            生成的文本内容
        """
        config = self._prepare_text_config(response_schema)
        response = self.client.models.generate_content(
            model=model,
            contents=prompt,
            config=config,
        )
        return self._process_text_response(response)

    @with_retry_async(max_attempts=3, backoff_seconds=(2, 4, 8))
    async def generate_text_async(
        self,
        prompt: str,
        model: str = "gemini-2.0-flash",
        response_schema: Optional[Dict] = None,
    ) -> str:
        """
        异步生成文本内容，支持 Structured Outputs

        使用 genai 原生异步 API: client.aio.models.generate_content()

        Args:
            prompt: 提示词
            model: 模型名称，默认使用 flash 模型
            response_schema: 可选的 JSON Schema，用于 Structured Outputs

        Returns:
            生成的文本内容
        """
        config = self._prepare_text_config(response_schema)
        response = await self.client.aio.models.generate_content(
            model=model,
            contents=prompt,
            config=config,
        )
        return self._process_text_response(response)

    def _download_video(self, video_ref, output_path: Path) -> None:
        """
        下载视频到本地文件

        Args:
            video_ref: Video 对象
            output_path: 输出路径
        """
        if self.backend == 'vertex':
            # Vertex AI 模式：从 video_bytes 直接保存
            if video_ref and hasattr(video_ref, 'video_bytes') and video_ref.video_bytes:
                with open(output_path, 'wb') as f:
                    f.write(video_ref.video_bytes)
            elif video_ref and hasattr(video_ref, 'uri') and video_ref.uri:
                # 如果没有 video_bytes，尝试从 URI 下载
                import urllib.request
                urllib.request.urlretrieve(video_ref.uri, str(output_path))
            else:
                raise RuntimeError("视频生成成功但无法获取视频数据")
        else:
            # AI Studio 模式：使用 files.download
            self.client.files.download(file=video_ref)
            video_ref.save(str(output_path))

    def _prepare_image_param(
        self,
        image: Optional[Union[str, Path, Image.Image]]
    ):
        """
        准备图片参数用于 API 调用

        Args:
            image: 图片路径或 PIL Image 对象

        Returns:
            types.Image 对象或 None
        """
        if image is None:
            return None

        mime_type_png = 'image/png'

        if isinstance(image, (str, Path)):
            # 读取图片文件为 bytes
            with open(image, 'rb') as f:
                image_bytes = f.read()
            # 确定 MIME 类型
            suffix = Path(image).suffix.lower()
            mime_types = {
                '.png': mime_type_png,
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp'
            }
            mime_type = mime_types.get(suffix, mime_type_png)
            return self.types.Image(
                image_bytes=image_bytes,
                mime_type=mime_type
            )
        elif isinstance(image, Image.Image):
            # 将 PIL Image 转换为 bytes
            buffer = io.BytesIO()
            image.save(buffer, format='PNG')
            image_bytes = buffer.getvalue()
            return self.types.Image(
                image_bytes=image_bytes,
                mime_type=mime_type_png
            )
        else:
            return image

    def _prepare_video_param(self, video):
        """
        统一处理 video 参数，支持多种输入类型

        Args:
            video: 视频输入，支持以下类型：
                - None: 返回 (None, None)
                - Video 对象: 直接使用
                - URI 字符串 (gs:// 或 https://): 包装为 Video 对象
                - 本地文件路径: 读取为 video_bytes

        Returns:
            (video_param, video_bytes) 元组
            - video_param: 用于 API 调用的参数
            - video_bytes: 视频二进制数据（Vertex AI 模式下载时使用）
        """
        if video is None:
            return None, None

        # Video 对象 - 直接使用
        if hasattr(video, 'uri') or hasattr(video, 'video_bytes'):
            video_bytes = getattr(video, 'video_bytes', None)
            return video, video_bytes

        # URI 字符串
        if isinstance(video, str) and ('gs://' in video or '://' in video):
            return self.types.Video(uri=video, mime_type="video/mp4"), None

        # 本地文件路径
        if isinstance(video, (str, Path)) and Path(video).exists():
            with open(video, 'rb') as f:
                video_bytes = f.read()
            return self.types.Video(
                video_bytes=video_bytes,
                mime_type="video/mp4"
            ), video_bytes

        raise ValueError(f"无效的 video 参数: {video}")
