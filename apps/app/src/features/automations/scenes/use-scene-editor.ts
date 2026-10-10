import { useReducer, useState } from 'react';
import { useRouter } from 'expo-router';
import { saveScene } from '../../../api/scenes';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { attempt, removeScene, runSceneNow } from '../data/actions';
import { useClose, useDiscardPrompt, type EditorStatus } from '../editor/use-editor';
import type { DeviceLike } from '../model/capability-choices';
import {
  changeScene,
  validateScene,
  type SceneChange,
  type SceneDraft,
  type SceneProblems,
} from '../model/scene-state';

export interface SceneEditor {
  readonly sceneId: string | null;
  readonly draft: SceneDraft;
  readonly change: (change: SceneChange) => void;
  readonly problems: SceneProblems | null;
  readonly status: EditorStatus;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly save: () => void;
  readonly run: () => void;
  readonly remove: () => void;
}

function sameScene(left: SceneDraft, right: SceneDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

interface SceneStart {
  readonly draft: SceneDraft;
  readonly sceneId: string | null;
  readonly position: number;
}

function useSceneSave(
  start: SceneStart,
  draft: SceneDraft,
  devices: readonly DeviceLike[],
  onSaved: (sceneId: string) => void,
): {
  readonly saving: boolean;
  readonly attempted: boolean;
  readonly save: (sceneId: string | null) => void;
} {
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const save = (sceneId: string | null): void => {
    setAttempted(true);
    const validation = validateScene(draft, devices);
    if (!validation.valid) {
      notify({ message: 'Fix the marked parts to save', tone: 'critical' });
      return;
    }
    setSaving(true);
    void attempt('It wasn’t saved', async () => {
      const id = await saveScene({ sceneId, ...validation.scene, position: start.position });
      onSaved(id);
      notify({ message: `${validation.scene.name} saved`, tone: 'positive' });
    }).finally(() => {
      setSaving(false);
    });
  };
  return { saving, attempted, save };
}

export function useSceneEditor(start: SceneStart, devices: readonly DeviceLike[]): SceneEditor {
  const router = useRouter();
  const [draft, change] = useReducer(changeScene, start.draft);
  const [baseline, setBaseline] = useState(start.draft);
  const [sceneId, setSceneId] = useState(start.sceneId);
  const [closing, close] = useClose();
  const saver = useSceneSave(start, draft, devices, (id) => {
    setBaseline(draft);
    setSceneId(id);
    router.setParams({ sceneId: id });
  });
  const validation = validateScene(draft, devices);
  const dirty = !sameScene(draft, baseline);
  useDiscardPrompt(dirty && !closing && !saver.saving);
  const remove = (): void => {
    if (sceneId === null) {
      close();
      return;
    }
    const id = sceneId;
    void confirm({
      title: `Delete ${baseline.name}?`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    }).then(async (accepted) => {
      if (accepted && (await removeScene(id, { ...baseline, position: start.position }))) {
        close();
      }
    });
  };
  return {
    sceneId,
    draft,
    change,
    problems: saver.attempted && !validation.valid ? validation.problems : null,
    status: sceneId === null ? 'New' : dirty ? 'Unsaved changes' : 'Saved',
    dirty,
    saving: saver.saving,
    save: (): void => {
      saver.save(sceneId);
    },
    run: (): void => {
      if (sceneId !== null) {
        runSceneNow({ id: sceneId, name: baseline.name });
      }
    },
    remove,
  };
}
