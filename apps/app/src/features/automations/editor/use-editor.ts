import { useReducer, useState, type Dispatch } from 'react';
import { useRouter } from 'expo-router';
import { LEGACY_AUTOMATION_DEFINITION, type AutomationRunRow } from '@smarteverything/domain';
import { saveAutomationRevision } from '../../../api/automations';
import { startOwnedRun } from '../../../api/automation-runtime';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { attempt, removeAutomation, testDraftRun } from '../data/actions';
import type { Catalog } from '../data/use-automations';
import { definitionOf, type Draft, type DraftChange } from '../model/editor-state';
import {
  changeHistory,
  identifiedDraft,
  type DraftHistory,
  type HistoryChange,
} from '../model/draft-history';
import { validateDraft, type Problems, type Validation } from '../model/validate';
import { useClose, useDiscardPrompt } from './editor-navigation';
export { useClose, useDiscardPrompt } from './editor-navigation';

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
  readonly undo: (() => void) | null;
  readonly redo: (() => void) | null;
  readonly run: AutomationRunRow | null;
  readonly closeRun: () => void;
  readonly testLabel: string;
  readonly canTest: boolean;
}
interface Session {
  readonly dirty: boolean;
  readonly draft: Draft;
  readonly validation: Validation;
  readonly automationId: string | null;
  readonly revision: string | null;
  readonly attempt: () => void;
}

function sameDraft(left: Draft, right: Draft): boolean {
  return (
    left.name === right.name &&
    left.enabled === right.enabled &&
    JSON.stringify(definitionOf(left)) === JSON.stringify(definitionOf(right))
  );
}

function useSave(
  session: Session,
  onSaved: (automationId: string, draft: Draft, revision: string) => void,
): readonly [boolean, () => void] {
  const [saving, setSaving] = useState(false);
  return [
    saving,
    (): void => {
      if (saving) return;
      session.attempt();
      const { validation, draft, automationId, revision } = session;
      if (!validation.valid) {
        notify({ message: 'Fix the marked parts to save', tone: 'critical' });
        return;
      }
      if (automationId !== null && revision === null) {
        notify({ message: 'Reload this program before saving', tone: 'critical' });
        return;
      }
      setSaving(true);
      void attempt('It wasn’t saved', async () => {
        const saved = await saveAutomationRevision({
          automationId,
          name: validation.name,
          enabled: draft.enabled,
          definition: validation.definition,
          ...(revision === null ? {} : { expectedRevision: revision }),
        });
        onSaved(saved.automation.id, draft, saved.definitionRevision);
        notify({ message: `${validation.name} saved`, tone: 'positive' });
      }).finally(() => {
        setSaving(false);
      });
    },
  ];
}

function useTest(
  session: Session,
  catalog: Catalog,
  onRun: (run: AutomationRunRow) => void,
): readonly [boolean, () => void] {
  const [testing, setTesting] = useState(false);
  return [
    testing,
    (): void => {
      if (testing) return;
      session.attempt();
      const { validation, automationId, dirty } = session;
      if (!validation.valid) {
        notify({ message: 'Fix the marked parts to test it', tone: 'critical' });
        return;
      }
      const legacy = LEGACY_AUTOMATION_DEFINITION.safeParse(validation.definition);
      if ((automationId === null || dirty) && !legacy.success) {
        notify({ message: 'Save to test this program', tone: 'critical' });
        return;
      }
      setTesting(true);
      void attempt('The test didn’t start', async () => {
        if (automationId !== null && !dirty) onRun(await startOwnedRun(automationId));
        else if (legacy.success)
          await testDraftRun(validation.name, legacy.data.actions, {
            devices: catalog.allDevices,
            scenes: catalog.scenes,
          });
      }).finally(() => {
        setTesting(false);
      });
    },
  ];
}

function useRemove(session: Session, close: () => void): () => void {
  return () => {
    const { automationId, draft, validation } = session;
    if (automationId === null) {
      close();
      return;
    }
    const restore = validation.valid ? { ...validation, enabled: draft.enabled } : null;
    void confirm({
      title: `Delete ${draft.name.trim() === '' ? 'this automation' : draft.name.trim()}?`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    }).then(async (accepted) => {
      if (accepted && (await removeAutomation(automationId, restore))) close();
    });
  };
}

interface DraftSession {
  readonly session: Session;
  readonly history: DraftHistory;
  readonly change: Dispatch<HistoryChange>;
  readonly attempted: boolean;
  readonly saving: boolean;
  readonly save: () => void;
}
function editorStatus(session: Session): EditorStatus {
  if (session.automationId === null) return 'New';
  return session.dirty ? 'Unsaved changes' : 'Saved';
}
function historyActions(
  history: DraftHistory,
  change: Dispatch<HistoryChange>,
): Pick<Editor, 'undo' | 'redo'> {
  return {
    undo:
      history.past.length === 0
        ? null
        : (): void => {
            change({ type: 'undo' });
          },
    redo:
      history.future.length === 0
        ? null
        : (): void => {
            change({ type: 'redo' });
          },
  };
}

function useDraftSession(
  start: Draft,
  savedId: string | null,
  initialRevision: string | null,
  catalog: Catalog,
): DraftSession {
  const router = useRouter();
  const [initial] = useState(() => identifiedDraft(start));
  const [history, change] = useReducer(changeHistory, { present: initial, past: [], future: [] });
  const [baseline, setBaseline] = useState(initial);
  const [automationId, setAutomationId] = useState(savedId);
  const [revision, setRevision] = useState(initialRevision);
  const [attempted, setAttempted] = useState(false);
  const validation = validateDraft(history.present, {
    devices: catalog.allDevices,
    sceneIds: catalog.scenes.map((scene) => scene.id),
    profileIds: catalog.people.map((person) => person.id),
  });
  const session: Session = {
    dirty: !sameDraft(history.present, baseline),
    draft: history.present,
    validation,
    automationId,
    revision,
    attempt: () => {
      setAttempted(true);
    },
  };
  const [saving, save] = useSave(session, (id, saved, nextRevision) => {
    setBaseline(saved);
    setAutomationId(id);
    setRevision(nextRevision);
    router.setParams({ automationId: id });
  });
  return { session, history, change, attempted, saving, save };
}

export function useEditor(
  start: Draft,
  savedId: string | null,
  catalog: Catalog,
  initialRevision: string | null,
): Editor {
  const { session, history, change, attempted, saving, save } = useDraftSession(
    start,
    savedId,
    initialRevision,
    catalog,
  );
  const [run, setRun] = useState<AutomationRunRow | null>(null);
  const [closing, close] = useClose();
  const [testing, test] = useTest(session, catalog, setRun);
  const structured = !LEGACY_AUTOMATION_DEFINITION.safeParse(definitionOf(session.draft)).success;
  const needsSave = structured && (session.automationId === null || session.dirty);
  useDiscardPrompt(session.dirty && !closing && !saving);
  return {
    automationId: session.automationId,
    draft: session.draft,
    change,
    validation: session.validation,
    problems: attempted && !session.validation.valid ? session.validation.problems : null,
    status: editorStatus(session),
    saving,
    testing,
    save,
    test,
    remove: useRemove(session, close),
    ...historyActions(history, change),
    run,
    closeRun: (): void => {
      setRun(null);
    },
    testLabel: needsSave ? 'Save to test' : 'Test run',
    canTest: !needsSave && !saving,
  };
}
