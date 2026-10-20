import { Logger, background } from '@smarteverything/logging';
import { useReducer, useState } from 'react';
import { useRouter } from 'expo-router';
import { saveScene } from '../../../api/scenes';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { attempt, removeScene, runSceneNow } from '../shared/actions';
import { useClose, useDiscardPrompt } from '../shared/editor-navigation';
import type { DeviceLike } from '../shared/capability-choices';
import {
  changeScene,
  validateScene,
  type SceneChange,
  type SceneDraft,
  type SceneProblems,
} from './scene-state';

const log = new Logger('app.automations');
type EditorStatus = 'New' | 'Unsaved changes' | 'Saved';

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
      log.info('scene.save_blocked', { sceneId, reason: 'invalid' });
      notify({ message: 'Fix the marked parts to save', tone: 'critical' });
      return;
    }
    setSaving(true);
    background(
      attempt(
        'It wasn’t saved',
        async () => {
          const id = await saveScene({ sceneId, ...validation.scene, position: start.position });
          log.info('scene.saved', { sceneId: id, created: sceneId === null });
          onSaved(id);
          notify({ message: `${validation.scene.name} saved`, tone: 'positive' });
        },
        { action: 'save-scene', sceneId },
      ).finally(() => {
        setSaving(false);
      }),
      'use_scene_editor.attempt_failed',
    );
  };
  return { saving, attempted, save };
}

function confirmRemove(
  id: string,
  scene: NonNullable<Parameters<typeof removeScene>[1]>,
  close: () => void,
): void {
  background(
    confirm({
      title: `Delete ${scene.name}?`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    }).then(async (accepted) => {
      if (accepted && (await removeScene(id, scene))) {
        close();
      }
    }),
    'use_scene_editor.confirm_failed',
  );
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
    confirmRemove(sceneId, { ...baseline, position: start.position }, close);
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
