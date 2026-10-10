import { useEffect, useReducer, useState } from 'react';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { saveAutomation } from '../../../api/automations';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { attempt, removeAutomation, testRun } from '../data/actions';
import type { Catalog } from '../data/use-automations';
import { changeDraft, definitionOf, type Draft, type DraftChange } from '../model/editor-state';
import { validateDraft, type Problems, type Validation } from '../model/validate';

export type EditorStatus = 'New' | 'Unsaved changes' | 'Saved';

export interface Editor {
  readonly automationId: string | null;
  readonly draft: Draft;
  readonly change: (change: DraftChange) => void;
  readonly validation: Validation;
  readonly problems: Problems | null;
  readonly status: EditorStatus;
  readonly saving: boolean;
  readonly testing: boolean;
  readonly save: () => void;
  readonly test: () => void;
  readonly remove: () => void;
}

function sameDraft(left: Draft, right: Draft): boolean {
  return (
    left.name === right.name &&
    left.enabled === right.enabled &&
    JSON.stringify(definitionOf(left)) === JSON.stringify(definitionOf(right))
  );
}

function statusOf(automationId: string | null, dirty: boolean): EditorStatus {
  if (automationId === null) {
    return 'New';
  }
  return dirty ? 'Unsaved changes' : 'Saved';
}

export function useDiscardPrompt(dirty: boolean): void {
  const navigation = useNavigation();
  usePreventRemove(dirty, ({ data }) => {
    void confirm({
      title: 'Discard changes?',
      body: 'Your edits will be lost.',
      confirmLabel: 'Discard',
      tone: 'destructive',
    }).then((discard) => {
      if (discard) {
        navigation.dispatch(data.action);
      }
    });
  });
}

export function useClose(): readonly [boolean, () => void] {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (closing) {
      router.back();
    }
  }, [closing, router]);
  return [
    closing,
    (): void => {
      setClosing(true);
    },
  ];
}

interface Session {
  readonly draft: Draft;
  readonly validation: Validation;
  readonly automationId: string | null;
  readonly attempt: () => void;
}

function useSave(
  session: Session,
  onSaved: (automationId: string, draft: Draft) => void,
): readonly [boolean, () => void] {
  const [saving, setSaving] = useState(false);
  const save = (): void => {
    session.attempt();
    const { validation, draft, automationId } = session;
    if (!validation.valid) {
      notify({ message: 'Fix the marked parts to save', tone: 'critical' });
      return;
    }
    setSaving(true);
    void attempt('It wasn’t saved', async () => {
      const id = await saveAutomation({
        automationId,
        name: validation.name,
        enabled: draft.enabled,
        definition: validation.definition,
      });
      onSaved(id, draft);
      notify({ message: `${validation.name} saved`, tone: 'positive' });
    }).finally(() => {
      setSaving(false);
    });
  };
  return [saving, save];
}

function useTest(session: Session, catalog: Catalog): readonly [boolean, () => void] {
  const [testing, setTesting] = useState(false);
  const test = (): void => {
    session.attempt();
    const { validation } = session;
    if (!validation.valid) {
      notify({ message: 'Fix the marked parts to test it', tone: 'critical' });
      return;
    }
    setTesting(true);
    void testRun(validation.name, validation.definition.actions, {
      devices: catalog.allDevices,
      scenes: catalog.scenes,
    }).finally(() => {
      setTesting(false);
    });
  };
  return [testing, test];
}

function useRemove(session: Session, close: () => void): () => void {
  return () => {
    const { automationId, draft, validation } = session;
    if (automationId === null) {
      close();
      return;
    }
    const name = draft.name.trim();
    const restore = validation.valid ? { ...validation, enabled: draft.enabled } : null;
    void confirm({
      title: `Delete ${name === '' ? 'this automation' : name}?`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    }).then(async (accepted) => {
      if (accepted && (await removeAutomation(automationId, restore))) {
        close();
      }
    });
  };
}

export function useEditor(start: Draft, savedId: string | null, catalog: Catalog): Editor {
  const router = useRouter();
  const [draft, change] = useReducer(changeDraft, start);
  const [baseline, setBaseline] = useState(start);
  const [automationId, setAutomationId] = useState(savedId);
  const [attempted, setAttempted] = useState(false);
  const [closing, close] = useClose();
  const validation = validateDraft(draft, {
    devices: catalog.allDevices,
    sceneIds: catalog.scenes.map((scene) => scene.id),
    profileIds: catalog.people.map((person) => person.id),
  });
  const session: Session = {
    draft,
    validation,
    automationId,
    attempt: (): void => {
      setAttempted(true);
    },
  };
  const [saving, save] = useSave(session, (id, saved) => {
    setBaseline(saved);
    setAutomationId(id);
    router.setParams({ automationId: id });
  });
  const [testing, test] = useTest(session, catalog);
  const dirty = !sameDraft(draft, baseline);
  useDiscardPrompt(dirty && !closing && !saving);
  return {
    automationId,
    draft,
    change,
    validation,
    problems: attempted && !validation.valid ? validation.problems : null,
    status: statusOf(automationId, dirty),
    saving,
    testing,
    save,
    test,
    remove: useRemove(session, close),
  };
}
