import { Logger, background } from '@smarteverything/logging';
import { useReducer, useState, type Dispatch } from 'react';
import { useRouter } from 'expo-router';
import type { AutomationRow, AutomationRunRow } from '@smarteverything/domain';
import { saveAutomation, testAutomation } from '../../../api/automations';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { attempt, removeAutomation } from '../data/actions';
import { inScope, type Catalog } from '../data/use-automations';
import { sameDraft, type Draft, type DraftChange } from '../model/editor-state';
import {
  changeHistory,
  identifiedDraft,
  type DraftHistory,
  type HistoryChange,
} from '../model/draft-history';
import { validateDraft, type Problems, type Validation } from '../model/validate';
import type { ValidationChoices } from '../model/validate-steps';
import { useClose, useDiscardPrompt } from './editor-navigation';
import { useLibraryReturn } from './library-return';

const log = new Logger('app.automations');
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
  readonly setRun: (run: AutomationRunRow | null) => void;
  readonly canTest: boolean;
  readonly asking: boolean;
  readonly setAsking: (asking: boolean) => void;
  readonly embedded: boolean;
  readonly catalog: Catalog;
}

interface Session {
  readonly dirty: boolean;
  readonly draft: Draft;
  readonly validation: Validation;
  readonly automationId: string | null;
  readonly revision: number | null;
  readonly attempt: () => void;
}

function choicesOf(catalog: Catalog): ValidationChoices {
  return {
    devices: catalog.allDevices,
    sceneIds: catalog.scenes.map((scene) => scene.id),
    profileIds: catalog.people.map((person) => person.id),
    valueIds: catalog.values.map((value) => value.id),
    groupIds: catalog.groups.map((group) => group.id),
    roomIds: catalog.rooms.map((room) => room.id),
    automationIds: catalog.automations.map((row) => row.id),
    callable: catalog.callable,
    inputs: catalog.inputs.map((input) => input.name),
  };
}

function useSave(
  session: Session,
  onSaved: (saved: AutomationRow, draft: Draft) => void,
): readonly [boolean, () => void] {
  const [saving, setSaving] = useState(false);
  return [
    saving,
    (): void => {
      if (saving) return;
      session.attempt();
      const { validation, draft, automationId, revision } = session;
      if (!validation.valid) {
        log.info('automation.save_blocked', { automationId, reason: 'invalid' });
        notify({ message: 'Fix the marked parts to save', tone: 'critical' });
        return;
      }
      setSaving(true);
      background(
        attempt(
          'It wasn’t saved',
          async () => {
            const saved = await saveAutomation({
              automationId,
              name: validation.name,
              enabled: draft.enabled,
              definition: validation.automation,
              ...(revision === null ? {} : { expectedRevision: revision }),
            });
            onSaved(saved, draft);
            log.info('automation.saved', {
              automationId: saved.id,
              created: automationId === null,
              enabled: draft.enabled,
              revision: revision ?? null,
            });
            notify({ message: `${validation.name} saved`, tone: 'positive' });
          },
          { action: 'save', automationId, revision: revision ?? null },
        ).finally(() => {
          setSaving(false);
        }),
        'use_editor.attempt_failed',
      );
    },
  ];
}

function useTest(
  session: Session,
  onRun: (run: AutomationRunRow) => void,
  onAsk: () => void,
): readonly [boolean, () => void] {
  const [testing, setTesting] = useState(false);
  return [
    testing,
    (): void => {
      if (testing) return;
      session.attempt();
      const { validation, automationId } = session;
      if (!validation.valid) {
        log.info('automation.test_blocked', { automationId, reason: 'invalid' });
        notify({ message: 'Fix the marked parts to test it', tone: 'critical' });
        return;
      }
      if ((validation.automation.inputs ?? []).length > 0) {
        log.debug('automation.test_asking_inputs', () => ({
          automationId,
          inputs: (validation.automation.inputs ?? []).length,
        }));
        onAsk();
        return;
      }
      setTesting(true);
      background(
        attempt(
          'The test didn’t start',
          async () => {
            const run = await testAutomation(automationId, validation.automation);
            log.info('automation.test_started', { automationId, runId: run.id });
            onRun(run);
          },
          { action: 'test', automationId },
        ).finally(() => {
          setTesting(false);
        }),
        'use_editor.attempt_failed',
      );
    },
  ];
}

function useRemove(session: Session, close: () => void): () => void {
  return () => {
    const { automationId, draft } = session;
    if (automationId === null) {
      close();
      return;
    }
    background(
      confirm({
        title: `Delete ${draft.name.trim() === '' ? 'this automation' : draft.name.trim()}?`,
        confirmLabel: 'Delete',
        tone: 'destructive',
      }).then((accepted) => {
        if (!accepted) return;
        removeAutomation(automationId);
        close();
      }),
      'use_editor.confirm_failed',
    );
  };
}

function problemsToShow(session: Session, attempted: boolean): Problems | null {
  return attempted && !session.validation.valid ? session.validation.problems : null;
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

interface EditorStart {
  readonly draft: Draft;
  readonly savedId: string | null;
  readonly revision: number | null;
  readonly reusable: boolean;
}

interface SessionState {
  readonly session: Session;
  readonly history: DraftHistory;
  readonly change: Dispatch<HistoryChange>;
  readonly catalog: Catalog;
  readonly attempted: boolean;
  readonly markSaved: (saved: AutomationRow, draft: Draft) => void;
}

function useSessionState(start: EditorStart, base: Catalog): SessionState {
  const [initial] = useState(() => identifiedDraft(start.draft));
  const [history, change] = useReducer(changeHistory, { present: initial, past: [], future: [] });
  const [baseline, setBaseline] = useState(initial);
  const [automationId, setAutomationId] = useState(start.savedId);
  const [revision, setRevision] = useState(start.revision);
  const [attempted, setAttempted] = useState(false);
  const catalog = inScope(base, {
    self: automationId,
    inputs: history.present.automation.inputs ?? [],
  });
  const session: Session = {
    dirty: !sameDraft(history.present, baseline),
    draft: history.present,
    validation: validateDraft(history.present, choicesOf(catalog), { reusable: start.reusable }),
    automationId,
    revision,
    attempt: () => {
      setAttempted(true);
    },
  };
  return {
    session,
    history,
    change,
    catalog,
    attempted,
    markSaved: (saved, draft): void => {
      setBaseline(draft);
      setAutomationId(saved.id);
      setRevision(saved.revision);
    },
  };
}

export function useEditor(start: EditorStart, base: Catalog): Editor {
  const router = useRouter();
  const { session, history, change, catalog, attempted, markSaved } = useSessionState(start, base);
  const [run, setRun] = useState<AutomationRunRow | null>(null);
  const [closing, close] = useClose();
  const destination = useLibraryReturn(session.dirty);
  const [saving, save] = useSave(session, (saved, draft) => {
    markSaved(saved, draft);
    if (destination === null) router.setParams({ automationId: saved.id });
    else destination.reusableSaved(saved);
  });
  const [asking, setAsking] = useState(false);
  const [testing, test] = useTest(session, setRun, (): void => {
    setAsking(true);
  });
  useDiscardPrompt(destination === null && session.dirty && !closing && !saving);
  const { validation, automationId } = session;
  const canTest = !saving;
  return {
    automationId,
    draft: session.draft,
    change,
    validation,
    problems: problemsToShow(session, attempted),
    status: editorStatus(session),
    saving,
    testing,
    save,
    test,
    remove: useRemove(session, destination?.close ?? close),
    ...historyActions(history, change),
    run,
    setRun,
    canTest,
    asking,
    setAsking,
    embedded: destination !== null,
    catalog,
  };
}
