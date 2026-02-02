# StoryCraft 项目内容安全处理机制调研报告

## 项目概述

StoryCraft 是一个基于 Next.js 的 AI 驱动电影/视频创作平台，主要使用 Google Cloud 的 AI 服务：
- **Gemini** - 文本生成和图像生成
- **Imagen** - 专用图像生成
- **Veo** - 视频生成
- **Lyria** - 音乐生成
- **TTS** - 文字转语音

本报告详细分析该项目如何处理内容安全问题，避免 API 拒绝生成。

---

## 1. 安全策略架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        内容安全处理层级                           │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: Prompt 工程层                                          │
│  ├── 禁止儿童内容的明确指令                                        │
│  ├── 音乐/字幕抑制指令                                            │
│  └── 样式约束指令                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: API 配置层                                             │
│  ├── safetySetting: "block_only_high" (宽松安全级别)              │
│  ├── personGeneration: "allow_all" (允许人物生成)                 │
│  └── includeRaiReason: true (返回 RAI 原因)                       │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: 错误处理层                                              │
│  ├── RAI 错误码映射 (用户友好消息)                                 │
│  ├── 指数退避重试机制                                             │
│  └── 统一错误响应格式                                             │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: 前端容错层                                              │
│  ├── React Query 自动重试                                        │
│  ├── 错误边界组件                                                 │
│  └── 优雅降级处理                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1: Prompt 工程层

### 2.1 禁止儿童内容

**文件**: `/app/prompts.ts`

在场景生成 prompt 中明确禁止儿童内容：

```typescript
// 第 18 行
"2. Generate a scenario in ${language.name} for a movie based on the story pitch.
 Stick as close as possible to the pitch. Do not include children in your scenario."
```

在分镜生成 prompt 中也有类似约束：
```typescript
// 第 251 行 - Video Prompt
"A video prompt in ${language.name}... No children."

// 第 267 行 - Image Prompt
"No children. Return as a JSON object..."
```

### 2.2 音乐抑制策略

**文件**: `/lib/utils/prompt-utils.ts`

为防止 Veo 视频模型自动添加背景音乐（可能导致版权问题或不期望的内容）：

```typescript
// 第 58-61 行
const orderedPrompt = {
    Action: videoPrompt.Action,
    Camera_Motion: videoPrompt.Camera_Motion,
    Ambiance_Audio:
        videoPrompt.Ambiance_Audio +
        " No music. No music! No music whatsoever.",  // 三重强调
    Dialogue: dialogue,
};
```

### 2.3 字幕抑制策略

**文件**: `/lib/api/veo.ts`

```typescript
// 第 36 行
const modifiedPrompt = prompt + "\nSubtitles: off";
```

### 2.4 样式约束指令

**文件**: `/app/features/shared/actions/image-generation.ts`

定义了严格的样式控制指令：

```typescript
const STYLE_INSTRUCTION = `I am providing a reference image. Use this image strictly
for its visual style (color palette, lighting, texture, and art medium).
Ignore the subjects, settings, locations, and objects matter of the reference image entirely.
Constraints:
* Adopt: The color grading, shadow density, and line quality of the reference.
* Discard: The original composition and subject matter.
* Reference Strength: High for style, 0% for content.`;
```

---

## 3. Layer 2: API 配置层

### 3.1 Imagen API 安全配置

**文件**: `/lib/api/imagen.ts`

```typescript
export async function generateImageRest(
    prompt: string,
    aspectRatio?: string,
    enhancePrompt?: boolean,
): Promise<GenerateImageResponse> {
    // ...
    body: JSON.stringify({
        instances: [{ prompt: prompt }],
        parameters: {
            safetySetting: "block_only_high",     // 仅阻止高风险内容
            personGeneration: "allow_all",        // 允许生成所有人物
            sampleCount: 1,
            aspectRatio: aspectRatio || "16:9",
            includeRaiReason: true,               // 返回 RAI 拒绝原因
            addWatermark: false,                  // 禁用水印
            language: "auto",
            sampleImageSize: "2K",
        },
    }),
}
```

### 3.2 安全参数说明

| 参数 | 值 | 说明 |
|-----|---|------|
| `safetySetting` | `"block_only_high"` | 最宽松的安全级别，仅阻止高风险内容 |
| `personGeneration` | `"allow_all"` | 允许生成所有类型的人物，包括真实感人物 |
| `includeRaiReason` | `true` | 当内容被拒绝时返回具体原因码 |
| `addWatermark` | `false` | 不添加水印 |

### 3.3 不同 API 的重试配置

| API | 最大重试次数 | 文件位置 |
|-----|------------|---------|
| Imagen 图像生成 | 5 | `/lib/api/imagen.ts` |
| Imagen 自定义生成 | 1 | `/lib/api/imagen.ts` |
| Gemini 图像生成 | 5 | `/lib/api/gemini.ts` |
| 图像放大 | 5 | `/lib/api/gemini.ts` |
| Lyria 音乐生成 | 1 | `/lib/api/lyria.ts` |

---

## 4. Layer 3: 错误处理层

### 4.1 RAI 错误码映射系统

**文件**: `/lib/utils/rai.ts`

这是项目的核心内容安全处理模块，将 API 返回的技术性错误代码转换为用户友好的消息：

```typescript
export function getRAIUserMessage(reasonString: string): string {
    logger.warn(
        `Media generation blocked due to RAI filter reason: ${reasonString}`,
    );

    let userMessage = reasonString;

    // 检测不同类型的安全违规
    if (reasonString.includes("58061214") || reasonString.includes("17301594")) {
        userMessage = "Media generation blocked: Detected potentially harmful child content.";
    }
    else if (reasonString.includes("29310472") || reasonString.includes("15236754")) {
        userMessage = "Media generation blocked: Detected a photorealistic celebrity likeness.";
    }
    // ... 更多错误码映射

    return userMessage;
}
```

### 4.2 完整 RAI 错误码映射表

| 错误码 | 内容类型 | 用户消息 |
|-------|---------|---------|
| 58061214, 17301594 | 儿童有害内容 | "Detected potentially harmful child content" |
| 29310472, 15236754 | 名人肖像 | "Detected a photorealistic celebrity likeness" |
| 64151117, 42237218 | 安全违规 | "Detected a safety violation" |
| 62263041 | 危险内容 | "Detected potentially dangerous content" |
| 57734940, 22137204 | 仇恨言论 | "Detected hate speech or related content" |
| 74803281, 29578790, 42876398 | 其他安全问题 | "Miscellaneous safety issue detected" |
| 39322892 | 人脸检测限制 | "Detected people/faces when not permitted" |
| 92201652 | 个人身份信息 | "Detected potential PII" |
| 89371032, 49114662, 72817394 | 禁止内容 | "Detected prohibited content" |
| 90789179, 63429089, 43188360 | 色情内容 | "Detected sexually explicit or adult content" |
| 78610348 | 有毒语言 | "Detected toxic language or content" |
| 61493863, 56562880 | 暴力内容 | "Detected violence-related content" |
| 32635315 | 粗俗内容 | "Detected vulgar language or content" |

### 4.3 RAI 错误在视频生成中的应用

**文件**: `/app/api/videos/route.ts`

```typescript
if (generateVideoResponse.raiMediaFilteredReasons) {
    // 使用 RAI 工具转换为用户友好消息并抛出错误
    throw new Error(
        getRAIUserMessage(
            generateVideoResponse.raiMediaFilteredReasons[0],
        ),
    );
}
```

### 4.4 指数退避重试机制

**文件**: `/lib/utils/retry.ts`

```typescript
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
): Promise<T> {
    const { maxRetries = 5, initialDelay = 1000, onRetry } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt < maxRetries) {
                // 指数退避算法
                const baseDelay = initialDelay * Math.pow(2, attempt);
                // 随机抖动防止雷群效应
                const jitter = Math.random() * 2000;
                const delay = baseDelay + jitter;

                await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
}
```

**重试延迟计算**:
- 第 1 次重试: 1000ms + 随机(0-2000ms)
- 第 2 次重试: 2000ms + 随机(0-2000ms)
- 第 3 次重试: 4000ms + 随机(0-2000ms)
- 第 4 次重试: 8000ms + 随机(0-2000ms)
- 第 5 次重试: 16000ms + 随机(0-2000ms)

### 4.5 统一错误响应格式

**文件**: `/lib/api/response.ts`

```typescript
export function errorResponse(
    message: string,
    code: string = "INTERNAL_ERROR",
    status: number = 500,
    details?: unknown,
): NextResponse<ApiResponse<never>> {
    return NextResponse.json(
        {
            success: false,
            error: {
                code,
                message,
                details,
            },
            meta: {
                timestamp: new Date().toISOString(),
            },
        },
        { status },
    );
}
```

---

## 5. Layer 4: 前端容错层

### 5.1 React Query 自动重试

**文件**: `/app/features/scenario/hooks/use-scenarios-query.ts`

```typescript
export function useScenarios() {
    return useQuery({
        queryKey: SCENARIO_KEYS.lists(),
        queryFn: async () => {...},
        staleTime: 5 * 60 * 1000,  // 5分钟
        retry: 3,                   // 自动重试3次
        refetchOnWindowFocus: false,
    });
}
```

### 5.2 错误边界组件

**文件**: `/app/features/shared/components/error-boundary.tsx`

```typescript
export class ErrorBoundary extends Component<Props, State> {
    public state: State = { hasError: false, error: null };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        clientLogger.error("Uncaught error:", error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            // 显示错误UI，带有"Try again"按钮
        }
        return this.props.children;
    }
}
```

### 5.3 图像生成失败的优雅降级

**文件**: `/app/features/create/actions/generate-scenario.ts`

```typescript
// 即使单个实体图像生成失败，整体流程不会中断
const charactersWithImages = await Promise.all(
    scenario.characters.map((character) =>
        limit(async () => {
            try {
                const result = await generateImageForScenario({...});
                return { ...character, imageGcsUri: result.imageGcsUri };
            } catch (error) {
                logger.error(`Failed to generate image for character ${character.name}:`, error);
                return character;  // 返回没有图像的原始角色数据
            }
        }),
    ),
);
```

### 5.4 开发/测试模式的占位内容

**文件**: `/app/api/videos/route.ts`

```typescript
const USE_COSMO = process.env.USE_COSMO === "true";

if (USE_COSMO) {
    // 使用占位视频进行测试，避免真实API调用
    url = placeholderVideoUrls[Math.floor(Math.random() * placeholderVideoUrls.length)];
} else {
    // 真实视频生成
    const generateVideoResponse = await generateSceneVideo(...);
}
```

---

## 6. Rate Limiting 处理

### 6.1 服务端限流

**文件**: `/lib/utils/rate-limit.ts`

```typescript
export const rateLimit = (options?: Options) => {
    const cache = new LRUCache<string, number>({
        max: options?.maxItems || 500,
        ttl: options?.interval || 60000,  // 60秒
    });

    return {
        check: (limit: number, identifier: string) =>
            new Promise<void>((resolve, reject) => {
                const currentUsage = cache.get(identifier) || 0;
                if (currentUsage >= limit) {
                    return reject(new Error("Rate limit exceeded"));
                }
                cache.set(identifier, currentUsage + 1);
                return resolve();
            }),
    };
};
```

### 6.2 Middleware 中的应用

**文件**: `/proxy.ts`

```typescript
if (nextUrl.pathname.startsWith("/api")) {
    const userId = session?.user?.id || "anonymous";
    try {
        await limiter.check(200, userId);  // 每用户每分钟200请求
    } catch {
        return NextResponse.json({
            success: false,
            error: {
                code: "RATE_LIMIT_EXCEEDED",
                message: "Too many requests.",
            },
        }, { status: 429 });
    }
}
```

---

## 7. 关键文件路径汇总

| 功能模块 | 文件路径 |
|---------|---------|
| RAI 错误处理 | `/lib/utils/rai.ts` |
| Imagen API (安全设置) | `/lib/api/imagen.ts` |
| Gemini API | `/lib/api/gemini.ts` |
| Veo 视频 API | `/lib/api/veo.ts` |
| 视频路由 (RAI 处理) | `/app/api/videos/route.ts` |
| Prompt 模板 (儿童限制) | `/app/prompts.ts` |
| Prompt 工具 (音乐抑制) | `/lib/utils/prompt-utils.ts` |
| 重试机制 | `/lib/utils/retry.ts` |
| 错误响应 | `/lib/api/response.ts` |
| Rate Limiting | `/lib/utils/rate-limit.ts` |
| 错误边界 | `/app/features/shared/components/error-boundary.tsx` |
| RAI 测试 | `/__tests__/lib/utils/rai.test.ts` |

---

## 8. 策略总结与评估

### 8.1 优点

1. **多层防御**: 从 Prompt 工程到 API 配置再到错误处理，形成多层安全屏障
2. **用户友好**: RAI 错误码映射为清晰的用户消息，而非技术性错误
3. **弹性设计**: 指数退避重试 + 随机抖动，有效处理临时性 API 失败
4. **优雅降级**: 单个资源生成失败不影响整体流程
5. **可观测性**: 完整的日志记录便于调试和监控

### 8.2 潜在改进点

1. **RAI 重试策略缺失**: 当前对于 RAI 拒绝没有自动重写 prompt 的机制
2. **错误码硬编码**: RAI 错误码直接硬编码在代码中，不便于维护
3. **缺少内容预检**: 没有在调用 API 前对用户输入进行预检
4. **安全级别固定**: `safetySetting: "block_only_high"` 是硬编码的，无法按需调整

### 8.3 安全策略流程图

```
用户输入 Pitch
    │
    ▼
┌──────────────────────────┐
│  Prompt 工程层处理        │
│  - 添加 "No children"     │
│  - 添加样式约束           │
└──────────────────────────┘
    │
    ▼
┌──────────────────────────┐
│  API 调用                 │
│  - safetySetting: block_only_high │
│  - includeRaiReason: true │
└──────────────────────────┘
    │
    ▼
┌──────────────────────────┐
│  API 响应检查             │
│  - 检查 raiMediaFilteredReasons │
│  - 检查 raiFilteredReason │
└──────────────────────────┘
    │
    ├── 成功 → 返回结果
    │
    └── RAI 拒绝 → getRAIUserMessage() → 用户友好错误消息
```

---

## 9. 结论

StoryCraft 项目采用了一套相对完善的内容安全处理机制：

1. **预防为主**: 通过 Prompt 工程在源头避免敏感内容生成
2. **宽松配置**: 使用 `block_only_high` 安全级别，在安全与创作自由间取得平衡
3. **透明处理**: 当拒绝发生时，通过 RAI 错误码映射提供清晰的反馈
4. **容错机制**: 通过重试和降级策略提高系统可用性

该项目的内容安全策略主要依赖于 Google Cloud AI 平台的内置安全过滤，并通过配置 `safetySetting: "block_only_high"` 选择了较为宽松的过滤级别，以便在保证基本安全的前提下最大化创作自由度。
