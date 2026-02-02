/**
 * Project page shared state (mutable).
 *
 * Keep this as a simple object store so different ES modules can share state
 * without a build step or framework.
 */

export const state = {
  currentProject: null,
  currentScripts: {},
  currentDrafts: {},
  projectName: null,
  cacheBuster: Date.now(),

  // 说书模式片段编辑上下文（用于版本控制逻辑）
  currentEditingSegment: null,

  // 版本缓存
  currentVersions: {
    storyboards: {},
    videos: {},
    characters: {},
    clues: {},
  },
};

