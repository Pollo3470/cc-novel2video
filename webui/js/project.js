/**
 * Project detail page entry (ES Module).
 *
 * This file intentionally stays small; the actual logic lives in `webui/js/project/*`.
 */

import { state } from "./project/state.js";
import { loadProject } from "./project/actions_project.js";
import { editCharacter, deleteCharacter } from "./project/characters.js";
import { editClue, deleteClue } from "./project/clues.js";
import { openDraftModal } from "./project/drafts.js";
import { setupEventListeners, toggleEpisode } from "./project/events.js";
import { editSegment, editScene } from "./project/scenes_segments.js";
import { deleteSourceFile, editSourceFile } from "./project/source_files.js";
import {
  refreshProjectTasksSnapshot,
  renderProjectTaskQueue,
  startProjectTaskStream,
  stopProjectTaskStream,
} from "./project/tasks.js";
import { closeLightbox, openLightbox } from "./project/ui.js";

function exposeGlobals() {
  Object.assign(window, {
    // Used by HTML template strings with inline onclick handlers
    openLightbox,
    closeLightbox,
    editCharacter,
    deleteCharacter,
    editClue,
    deleteClue,
    toggleEpisode,
    editSegment,
    editScene,
    openDraftModal,
    editSourceFile,
    deleteSourceFile,
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  state.projectName = params.get("name");

  if (!state.projectName) {
    alert("未指定项目");
    window.location.href = "/";
    return;
  }

  exposeGlobals();
  renderProjectTaskQueue();
  void loadProject();
  void refreshProjectTasksSnapshot();
  startProjectTaskStream();
  setupEventListeners();

  window.addEventListener("beforeunload", () => {
    stopProjectTaskStream();
  });
});
