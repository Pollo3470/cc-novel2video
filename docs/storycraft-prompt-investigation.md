# StoryCraft Prompt 生成全流程调研报告

## 项目概述

**StoryCraft** 是一个基于 Google AI 服务的短视频故事生成平台，使用 Next.js 15 构建。该项目通过多阶段的 Prompt 生成流程，将用户的文字描述转化为完整的视频故事，包括场景、角色、图像、视频、配音和音乐。

### 技术栈
- **前端**: Next.js 15, React 19, Tailwind CSS, Zustand
- **AI服务**: Google Vertex AI (Gemini, Imagen, Veo, Lyria, TTS)
- **存储**: Google Cloud Storage, Firestore
- **SDK**: `@google/genai`

---

## 一、Prompt 生成全流程架构图

```
用户输入 (Story Pitch + 设置)
        │
        ▼
┌───────────────────────────────────────────┐
│  阶段1: 场景生成 (Scenario Generation)     │
│  getScenarioPrompt() → Gemini LLM         │
│  输出: 场景JSON (characters, settings,    │
│        props, music, mood)                │
└───────────────────────────────────────────┘
        │
        ├──────────────────────────────────────────┐
        │                                          │
        ▼                                          ▼
┌───────────────────────────────┐  ┌───────────────────────────────┐
│ 阶段2a: 实体图像生成           │  │ 阶段2b: 风格图像分析           │
│ (角色/场景/道具)               │  │ (可选)                        │
│ generateImageForScenario()    │  │ analyzeStyleImageAction()     │
│ → Gemini Image Model          │  │ → Gemini 2.5 Flash            │
└───────────────────────────────┘  └───────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────┐
│  阶段3: 分镜生成 (Storyboard Generation)   │
│  getScenesPrompt() → Gemini LLM           │
│  输出: 场景数组 (imagePrompt, videoPrompt,│
│        description, voiceover)            │
└───────────────────────────────────────────┘
        │
        ├──────────────────┬────────────────┐
        │                  │                │
        ▼                  ▼                ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ 阶段4a: 图像生成  │ │ 阶段4b: 视频生成  │ │ 阶段4c: 音频生成  │
│ imagePrompt →    │ │ videoPrompt →    │ │ voiceover text → │
│ YAML → Gemini    │ │ YAML → Veo       │ │ TTS API          │
│ Image Model      │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ 阶段5: 音乐生成       │
                │ scenario.music →     │
                │ Lyria API            │
                └──────────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ 阶段6: 时间轴/导出    │
                │ FFmpeg 合成          │
                └──────────────────────┘
```

---

## 二、核心 Prompt 文件详解

### 2.1 主 Prompt 文件：`/app/prompts.ts`

这是项目的核心 Prompt 定义文件，包含两个主要的 Prompt 生成函数及其对应的 JSON Schema。

---

### 2.2 场景生成 Prompt：`getScenarioPrompt()`

**文件位置**: `/app/prompts.ts` (第4-101行)

**函数签名**:
```typescript
export function getScenarioPrompt(
    pitch: string,
    numScenes: number,
    style: string,
    language: Language,
): string
```

**参数说明**:
- `pitch`: 用户输入的故事概念
- `numScenes`: 要生成的场景数量
- `style`: 视觉风格
- `language`: 目标语言 (包含 name 和 code)

**完整 Prompt 模板**:

```
You are tasked with generating a creative scenario for a short movie and creating prompts for storyboard illustrations. Follow these instructions carefully:
1. First, you will be given a story pitch. This story pitch will be the foundation for your scenario.

<pitch>
${pitch}
</pitch>

2. Generate a scenario in ${language.name} for a movie based on the story pitch. Stick as close as possible to the pitch. Do not include children in your scenario.

3. What Music Genre will best fit this video, pick from:
- Alternative & Punk
- Ambient
- Children's
- Cinematic
- Classical
- Country & Folk
- Dance & Electronic
- Hip-Hop & Rap
- Holiday
- Jazz & Blues
- Pop
- R&B & Soul
- Reggae
- Rock

4. What is the mood of this video, pick from:
- Angry
- Bright
- Calm
- Dark
- Dramatic
- Funky
- Happy
- Inspirational
- Romantic
- Sad

5. Generate a short description of the music, in English only, that will be used in the video. No references to the story, no references to known artists or songs.

6. Format your output as follows:
- First, provide a detailed description of your scenario in ${language.name}.
- Then from this scenario provide a short description of each character in the story inside the characters key.
- Then from this scenario provide a short description of each setting in the story inside the settings key.
- Then, optionally, and only for very important props (products for ads, recurring objects, vehicles), if any, 0 to 2 props max, a short description of each prop important for the story

Format the response as a JSON object.
Here's an example of how your output should be structured:
{
 "scenario": "[Brief description of your creative scenario based on the given story pitch]",
 "genre": "[Music genre]",
 "mood": "[Mood]",
 "music": "[Short description of the music that will be used in the video, no references to the story, no references to known artists or songs]",
 "language": {
   "name": "${language.name}",
   "code": "${language.code}"
 },
 "characters": [
  {
    "name": "[character 1 name]",
    "voice" "[character's voice description. One sentence.],
    "description": "character 1 description in ${language.name}. Be hyper-specific and affirmative and short, one sentence max. Include age, gender, ethnicity, specific facial features if any, hair style and color, facial hair or absence of it for male, skin details and exact clothing, including textures and accessories.",
  },
  ...
 ],
 "settings": [
  {
    "name": "[setting 1 name]",
    "description": "setting 1 description in ${language.name}. This description establishes the atmosphere, lighting, and key features that must remain consistent. Be Evocative and short, one sentence max: Describe the mood, the materials, the lighting, and even the smell or feeling of the air."
  },
  ...
 ],
 "props": [
  {
    "name": "[prop 1 name]",
    "description": "prop 1 description in ${language.name}, This description establishes the atmosphere, lighting, and key features that must remain consistent. Be Evocative and short, one sentence max."
  }
  ...
 ]
}

Remember, your goal is to create a compelling and visually interesting story that can be effectively illustrated through a storyboard. Be creative, consistent, and detailed in your scenario and prompts.
```

**响应 Schema** (`scenarioSchema`, 第103-206行):

```typescript
export const scenarioSchema = {
    type: Type.OBJECT,
    properties: {
        scenario: { type: Type.STRING, nullable: false },
        genre: { type: Type.STRING, nullable: false },
        mood: { type: Type.STRING, nullable: false },
        music: { type: Type.STRING, nullable: false },
        language: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING },
                code: { type: Type.STRING }
            },
            required: ["name", "code"]
        },
        characters: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    voice: { type: Type.STRING },
                    description: { type: Type.STRING }
                },
                required: ["name", "voice", "description"]
            }
        },
        settings: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING }
                },
                required: ["name", "description"]
            }
        },
        props: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING }
                },
                required: ["name", "description"]
            }
        }
    },
    required: ["scenario", "genre", "mood", "music", "language", "characters", "settings", "props"]
};
```

---

### 2.3 分镜生成 Prompt：`getScenesPrompt()`

**文件位置**: `/app/prompts.ts` (第208-357行)

**函数签名**:
```typescript
export function getScenesPrompt(
    scenario: Scenario,
    numScenes: number,
    style: string,
    language: Language,
): string
```

**参数说明**:
- `scenario`: 完整的场景对象 (包含scenario文本、characters、settings、props、music、mood)
- `numScenes`: 要生成的分镜数量
- `style`: 视觉风格
- `language`: 目标语言

**完整 Prompt 模板**:

```
You are tasked with generating a creative scenes for a short movie and creating prompts for storyboard illustrations. Follow these instructions carefully:
1. First, you will be given a scenario in ${scenario.language.name}. This scenario will be the foundation for your storyboard.

<scenario>
${scenario.scenario}
</scenario>

<characters>
${scenario.characters.map((character) => `Name: ${character.name}
  Description: ${character.description}
  Voice Description: ${character.voice}`).join("\n\n\n")}
</characters>

<props>
${scenario.props?.map((prop) => `${prop.name}\n\n${prop.description}`).join("\n\n\n")}
</props>

<settings>
${scenario.settings.map((setting) => `${setting.name}\n\n${setting.description}`).join("\n\n\n")}
</settings>

<music>
${scenario.music}
</music>

<mood>
${scenario.mood}
</mood>

2. Generate exactly ${numScenes}, creative scenes to create a storyboard illustrating the scenario. Follow these guidelines for the scenes:
 a. For each scene, provide:
 1. A video prompt in ${language.name}, focusing on the movement of the characters, objects, in the scene, the style should be ${style}. No children. Return as a JSON object with the following schema:
{
  "Action": "Describe precisely what the subject(s) is(are) doing within the ${durationSeconds} seconds clip. Be specific and evocative. Describe the action in detail : characters and objects positions, actions, and interactions.",
  "Camera_Motion": "Explicitly state the camera movement, even if it's static. This removes ambiguity.",
  "Ambiance_Audio": "Diegetic Sound Only. This is crucial. Describe only the sounds that exist within the world of the scene. Do not mention music or narration, as those are post-production layers for different models. Be specific.",
  "Dialogue": [
    {
      "name": "speaker name, only the name, choices are [${scenario.characters?.map((character) => `${character.name}`).join(",")}]",
      "speaker": "Assign lines using physical descriptions, not names, for maximum clarity (e.g., 'The man in the blue shirt', 'The woman with red hair')",
      "line": "The actual dialogue spoken"
    }
  ]
}
 2. A detailed visual description for AI image generation (imagePrompt) in ${language.name} for the first frame of the video, the style should be ${style}.
 Keep in mind that the image prompt is for the first frame of the video, so it should be a single frame happening before the action in the video.
 No split screen. No frame on frame.
 No children. Return as a JSON object with the following schema:
{
  "Style": "Define the visual language of your project",
  "Scene": "Describe the specific scene being depicted - what is happening in this moment, the action or situation being shown, and how it fits into the overall narrative flow. Focus on the immediate action and situation. Describe the scene : characters (short description only) and objects positions, actions, and interactions. Ensure the depiction avoids showing elements beyond this specific moment. Exclude any details that suggest a broader story or character arcs. The scene should be self-contained, not implying past events or future developments.",
  "Composition": {
    "shot_type": "Examples include Cinematic close-up, Wide establishing shot, etc.",
    "lighting": "Examples include high-contrast, soft natural light, etc.",
    "overall_mood": "Examples include gritty realism, atmospheric"
  },
  "Subject": [
    {
      "name": "character name, only the name, choices are [${scenario.characters?.map((character) => `${character.name}`).join(",")}]",
    }
  ],
  "Prop": [
    {
      "name": "prop name, only the name, choices are [${scenario.props?.map((prop) => `${prop.name}`).join(",")}]",
    }
  ],
  "Context": [
    {
      "name": "setting name, only the name, choices are [${scenario.settings?.map((setting) => `${setting.name}`).join(",")}]",
    }
  ],
}
 3. A scene description in ${language.name} explaining what happens (description). You can use the character(s) name(s) in your descriptions.
 4. A short, narrator voiceover text in ${language.name}. One full sentence, ${durationSeconds - 2}s max. (voiceover). You can use the character(s) name(s) in your voiceovers.
a. Each image prompt should describe a key scene or moment from your scenario.
b. Ensure that the image prompts, when viewed in sequence, tell a coherent story.
c. Include descriptions of characters, settings, and actions that are consistent across all image prompts.
d. Make each image prompt vivid and detailed enough to guide the creation of a storyboard illustration.

7. Format your output as follows:
- List the ${numScenes} scenes
- Each image prompt in the scenes should reuse the full characters and settings description generated on the <characters> and <settings> tags every time, on every prompt
- Do not include any additional text or explanations between the prompts.

Format the response as a JSON object.
Here's an example of how your output should be structured:
{
 "scenes": [
 {
  "imagePrompt": {
    "Style": "visual style description",
    "Composition": {
      "shot_type": "type of shot",
      "lighting": "lighting description",
      "overall_mood": "mood description"
    },
    "Subject": [
      {
        "name": "subject name",
      }
    ],
    "Prop": [
      {
        "name": "prop name",
      }
    ],
    "Context": [
      {
        "name": "context name",
      }
    ],
    "Scene": "scene description"
  },
  "videoPrompt": {
    "Action": "action description",
    "Camera_Motion": "camera movement",
    "Ambiance_Audio": "ambient sounds",
    "Dialogue": [
      {
        "name": "speaker name",
        "speaker": "speaker description",
        "line": "dialogue line"
      }
    ]
  },
  "description": [A scene description explaining what happens],
  "voiceover": [A short, narrator voiceover text. One full sentence, ${durationSeconds - 2}s max.],
  "charactersPresent": [An array list of names of characters visually present in the scene]
 },
 [...]
 }
 ]
}

Remember, your goal is to create a compelling and visually interesting story that can be effectively illustrated through a storyboard. Be creative, consistent, and detailed in your prompts.
Remember, the number of scenes should be exactly ${numScenes}.
```

**响应 Schema** (`storyboardSchema`, 第359-526行):

复杂的嵌套 Schema，包含 scenes 数组，每个 scene 包含:
- `imagePrompt`: 图像生成结构化提示
- `videoPrompt`: 视频生成结构化提示
- `description`: 场景描述
- `voiceover`: 旁白文本
- `charactersPresent`: 出场角色数组

---

## 三、Prompt 工具函数

### 3.1 Prompt 格式化工具：`/lib/utils/prompt-utils.ts`

**图像 Prompt 转字符串**:
```typescript
export function imagePromptToString(imagePrompt: ImagePrompt): string {
    const orderedPrompt = {
        Style: imagePrompt.Style,
        Scene: imagePrompt.Scene,
        Composition: {
            shot_type: imagePrompt.Composition.shot_type,
            lighting: imagePrompt.Composition.lighting,
            overall_mood: imagePrompt.Composition.overall_mood,
        },
        Subject: imagePrompt.Subject.map((subject) => ({
            name: subject.name,
            description: subject.description,
        })),
        Context: imagePrompt.Context.map((context) => ({
            name: context.name,
            description: context.description,
        })),
    };
    return yaml.dump(orderedPrompt, { indent: 2, lineWidth: -1 });
}
```

**视频 Prompt 转字符串**:
```typescript
export function videoPromptToString(
    videoPrompt: VideoPrompt,
    scenario: Scenario,
): string {
    const dialogue = videoPrompt.Dialogue.map((dialogue) => {
        const character = scenario.characters.find(
            (character) => dialogue.name === character.name,
        );
        const voicePrompt = character ? character.voice : "";
        return {
            Speaker: dialogue.speaker,
            Voice: voicePrompt,
            Line: dialogue.line,
        };
    });

    const orderedPrompt = {
        Action: videoPrompt.Action,
        Camera_Motion: videoPrompt.Camera_Motion,
        Ambiance_Audio: videoPrompt.Ambiance_Audio + " No music. No music! No music whatsoever.",
        Dialogue: dialogue,
    };
    return yaml.dump(orderedPrompt, { indent: 2, lineWidth: -1 });
}
```

---

## 四、图像生成 Prompt 详解

### 4.1 图像生成核心文件：`/app/features/shared/actions/image-generation.ts`

**风格参考 Prompt 常量**:

```typescript
const STYLE_INSTRUCTION = `I am providing a reference image. Use this image strictly for its visual style (color palette, lighting, texture, and art medium). Ignore the subjects, settings, locations, and objects matter of the reference image entirely.
Constraints:

* Adopt: The color grading, shadow density, and line quality of the reference.
* Discard: The original composition and subject matter.
* Reference Strength: High for style, 0% for content.`;

const CONTENT_STYLE_INSTRUCTION = `I am providing a reference image. Update the visual style of this image to match the provided description and scenario style, while maintaining the subject matter and composition of the reference image.
Constraints:

* Adopt: The scenario style, lighting, and overall mood.
* Preserve: The subjects, setting, and core composition of the reference image.`;
```

**图像 Prompt 构建逻辑** (在 `generateImageForScenario` 中):

1. **风格参考图像**: 添加 `STYLE_INSTRUCTION` + 风格图像 URI
2. **场景生成**: 创建有序 YAML prompt，包含 Style, Scene, Composition
3. **实体生成** (角色/场景/道具): 创建结构化 prompt:
   ```yaml
   style: {scenario.style}
   shot_type: "Medium Shot" | "Wide Shot" | "Close Shot"
   description: {entity.description}
   ```

---

## 五、风格分析 Prompt

### 文件：`/app/features/create/actions/analyze-style.ts`

**分析上传风格图像的 Prompt**:
```typescript
const prompt = [
    {
        fileData: {
            mimeType: "image/jpeg",
            fileUri: gcsUri,
        },
    },
    {
        text: "Analyze the visual style of this image. Describe the lighting, color palette, medium (e.g., oil painting, digital art, photography), texture, and overall mood. Do NOT describe the subject matter (e.g., people, objects) or specific content. Focus ONLY on the artistic style. Provide a concise comma-separated list of descriptors suitable for an image generation prompt.",
    },
];
```

---

## 六、场景修改相关 Prompt

### 文件：`/app/features/scenario/actions/modify-scenario.ts`

**更新场景文本 Prompt**:
```
Update the following scenario to reflect ${entityType} changes. The ${entityType} previously named "${oldName}" is now named "${newName}" with the following updated description: "${newDescription}".

CURRENT SCENARIO:
"${currentScenario}"

INSTRUCTIONS:
1. Replace all references to "${oldName}" with "${newName}" (if the name changed)
2. Update any ${entityType} descriptions in the scenario to match the new ${entityType} description
3. Ensure the story flow and narrative remain coherent
4. Maintain the same tone and style as the original scenario
5. Keep the scenario length similar to the original

Return ONLY the updated scenario text, no additional formatting or explanations.
```

**删除实体 Prompt**:
```
Delete the following ${entityType} from the scenario.

CURRENT SCENARIO:
"${currentScenario}"

INSTRUCTIONS:
1. Delete all references to "${oldName}" and "${oldDescription}" from the scenario
2. Ensure the story flow and narrative remain coherent
3. Maintain the same tone and style as the original scenario
4. Keep the scenario length similar to the original

Return ONLY the updated scenario text, no additional formatting or explanations.
```

**从图像同步角色 Prompt**:
```
Analyze the provided image and update the character description and voice to match the visual characteristics shown.

ALL CHARACTERS IN THE STORY:
${characterListText}

CHARACTER TO UPDATE (${characterName}):
"Description: ${currentCharacterDescription}"
"Voice: ${currentCharacterVoice}"

INSTRUCTIONS:
1. Examine the uploaded image carefully
2. Update ONLY the description and voice of ${characterName} to accurately reflect what you see in the image (appearance, clothing, features, etc.)
3. Do NOT modify the scenario text.

Return a JSON object with updatedCharacter (name, description, voice).
```

**从图像同步场景 Prompt**:
```
Analyze the provided image and update the setting description to match the visual characteristics shown.

ALL SETTINGS IN THE STORY:
${settingListText}

SETTING TO UPDATE (${settingName}):
"${currentSettingDescription}"

INSTRUCTIONS:
1. Examine the uploaded image carefully
2. Update ONLY the description of ${settingName} to accurately reflect what you see in the image
3. Do NOT modify the scenario text.

Return a JSON object with updatedSetting (name, description).
```

**从图像同步道具 Prompt**:
```
Analyze the provided image and update the prop description to match the visual characteristics shown.

ALL PROPS IN THE STORY:
${propListText}

PROP TO UPDATE (${propName}):
"${currentPropDescription}"

INSTRUCTIONS:
1. Examine the uploaded image carefully
2. Update ONLY the description of ${propName} to accurately reflect what you see in the image
3. Do NOT modify the scenario text.

Return a JSON object with updatedProp (name, description).
```

---

## 七、TTS/配音 Prompt

### 文件：`/lib/api/tts.ts`

```typescript
const request = {
    input: {
        text: text,
        prompt: "Voiceover for a short movie. Fast paced and engaging.",
    },
    voice: {
        languageCode: language,
        name: selectedVoiceName,  // 默认: "Algenib"
        modelName: "gemini-2.5-flash-tts",
    },
    audioConfig: {
        audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
    },
};
```

---

## 八、视频生成 Prompt 修改

### 文件：`/lib/api/veo.ts`

```typescript
const modifiedPrompt = prompt + "\nSubtitles: off";
```

---

## 九、核心类型定义

### 文件：`/app/types.ts`

**ImagePrompt 接口**:
```typescript
export interface ImagePrompt {
    Style: string;
    Scene: string;
    Composition: {
        shot_type: string;
        lighting: string;
        overall_mood: string;
    };
    Subject: Array<{ name: string; description?: string }>;
    Prop: Array<{ name: string; description?: string }>;
    Context: Array<{ name: string; description?: string }>;
}
```

**VideoPrompt 接口**:
```typescript
export interface VideoPrompt {
    Action: string;
    Camera_Motion: string;
    Ambiance_Audio: string;
    Dialogue: Array<{
        name: string;
        speaker: string;
        line: string;
    }>;
}
```

**Scene 接口**:
```typescript
export interface Scene {
    imagePrompt: ImagePrompt;
    videoPrompt: VideoPrompt;
    description: string;
    voiceover: string;
    charactersPresent: string[];
    imageGcsUri?: string;
    videoUri?: string;
    voiceoverAudioUri?: string;
    errorMessage?: string;
}
```

---

## 十、AI 配置

### 文件：`/lib/ai-config.ts`

**默认设置**:
```typescript
export const DEFAULT_SETTINGS: Settings = {
    llmModel: "gemini-3-flash-preview",
    thinkingBudget: 0,
    imageModel: "gemini-3-pro-image-preview",
    videoModel: "veo-3.1-fast-generate-preview",
    videoResolution: "1080p",
    generateAudio: false,
};
```

**可用模型选项**:
- **LLM**: gemini-3-pro-preview, gemini-3-flash-preview, gemini-2.5-flash, gemini-2.5-pro
- **Image**: gemini-3-pro-image-preview, gemini-2.5-flash-image
- **Video**: veo-3.1-fast-generate-preview, veo-3.1-generate-preview, veo-3.0-fast-generate-001, veo-3.0-generate-001

---

## 十一、API 端点使用 Prompt 汇总

| 端点 | 用途 | Prompt 来源 |
|------|------|-------------|
| `POST /api/regenerate-image` | 重新生成场景图像 | scene 中的 imagePrompt |
| `PUT /api/regenerate-image` | 生成实体图像 | description 字符串 |
| `POST /api/videos` | 生成场景视频 | videoPromptToString() |
| `POST /api/scenarios` | 保存场景 | N/A (仅存储) |

---

## 十二、关键文件总结

| 文件路径 | 用途 |
|----------|------|
| `/app/prompts.ts` | 主 Prompt 模板和 Schema |
| `/lib/utils/prompt-utils.ts` | Prompt 转 YAML 工具 |
| `/app/features/shared/actions/image-generation.ts` | 带风格参考的图像生成 |
| `/app/features/create/actions/generate-scenario.ts` | 场景生成 Action |
| `/app/features/scenario/actions/generate-scenes.ts` | 分镜生成 Action |
| `/app/features/scenario/actions/modify-scenario.ts` | 实体修改 Prompt |
| `/app/features/create/actions/analyze-style.ts` | 风格图像分析 Prompt |
| `/lib/api/gemini.ts` | Gemini API 客户端 |
| `/lib/api/imagen.ts` | Imagen API 客户端 |
| `/lib/api/veo.ts` | Veo 视频生成 API |
| `/lib/api/lyria.ts` | Lyria 音乐生成 API |
| `/lib/api/tts.ts` | 文本转语音 API |
| `/lib/ai-config.ts` | AI 模型配置 |
| `/app/types.ts` | TypeScript 类型定义 |
| `/app/schemas.ts` | Zod 验证 Schema |

---

## 十三、AI 调用流程详解

### 13.1 文本生成 (LLM)

**文件**: `/lib/api/gemini.ts`

```typescript
export async function generateContent(
    prompt: ContentListUnion,
    config: GenerateContentConfig = {
        thinkingConfig: {
            thinkingBudget: -1,
        },
        responseMimeType: "application/json",
    },
    model: string = DEFAULT_SETTINGS.llmModel,
): Promise<string | undefined> {
    // 对于 Gemini 3.x 模型，使用 ThinkingLevel.LOW
    if (model === "gemini-3-pro-preview" || model === "gemini-3-flash-preview") {
        config = {
            ...config,
            thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
            },
        };
    }

    const response = await ai.models.generateContent({
        model,
        config,
        contents: prompt,
    });

    return response.text;
}
```

**关键特性**:
- 支持通过 `responseMimeType: "application/json"` 的结构化 JSON 输出
- 支持通过 `responseSchema` 的 JSON Schema 强制
- 可配置的思考预算用于推理模型
- 非流式 - 同步返回完整响应

### 13.2 图像生成

```typescript
export async function generateImage(
    prompt: ContentListUnion,
    config: GenerateContentConfig = {
        responseModalities: ["IMAGE"],
    },
    model: string = DEFAULT_SETTINGS.imageModel,
): Promise<GenerateNanoBananaImageResponse> {
    return withRetry(async () => {
        const response = await ai.models.generateContent({
            model,
            config,
            contents: prompt,
        });

        // 从内联数据提取图像并上传到 GCS
        for (const part of firstCandidate.content!.parts!) {
            if (part.inlineData) {
                const imageBuffer = Buffer.from(part.inlineData!.data!, "base64");
                imageGcsUri = await uploadImage(imageBuffer.toString("base64"), `gemini-${uuid}.png`);
                return { success: true, imageGcsUri };
            }
        }
    }, { maxRetries: 5 });
}
```

### 13.3 视频生成 (Veo)

```typescript
export async function generateSceneVideo(
    prompt: string,
    imageGcsUri: string,
    aspectRatio: string = "16:9",
    model: string = DEFAULT_SETTINGS.videoModel,
    generateAudio: boolean = DEFAULT_SETTINGS.generateAudio,
    durationSeconds: number = 8,
    resolution: string = "1080p",
): Promise<GenerateVideosResponse> {
    let operation = await ai.models.generateVideos({
        model: model,
        prompt: modifiedPrompt,
        image: { gcsUri: imageGcsUri, mimeType: "image/png" },
        config: {
            outputGcsUri: env.GCS_VIDEOS_STORAGE_URI,
            numberOfVideos: 1,
            aspectRatio,
            generateAudio,
            durationSeconds,
            resolution,
        },
    });

    // 轮询完成状态 (最多60次轮询，5秒间隔)
    while (!operation.done && pollCount < maxPolls) {
        operation = await ai.operations.get({ operation });
        await delay(5000);
        pollCount++;
    }
}
```

---

## 十四、错误处理和重试逻辑

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
                const baseDelay = initialDelay * Math.pow(2, attempt);
                const jitter = Math.random() * 2000;
                await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
            } else {
                throw error;
            }
        }
    }
}
```

图像生成和音乐生成函数使用此重试机制。

---

## 十五、总结

StoryCraft 项目实现了一个完整的多阶段 Prompt 生成流程：

1. **场景生成阶段**: 使用结构化 Prompt 将用户故事概念转化为包含角色、场景、道具的完整场景描述
2. **分镜生成阶段**: 基于场景生成详细的分镜，每个分镜包含图像提示、视频提示、旁白和描述
3. **媒体生成阶段**: 并行生成图像、视频、配音和音乐
4. **后期处理阶段**: 使用 FFmpeg 进行时间轴编辑和导出

所有 Prompt 都采用结构化 JSON Schema 强制输出格式，确保 AI 响应的一致性和可解析性。项目使用 YAML 格式传递图像和视频 Prompt 给 AI 模型，提高了提示的可读性和结构化程度。
