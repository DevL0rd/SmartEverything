import type { FunctionV3 } from '@smarteverything/domain';
import { useCallback, useState } from 'react';
import { applyInterfaceEdit, type InterfaceEdit, type PortSide } from './interface-model';
import {
  NO_ISSUES,
  blankDraft,
  draftOfInput,
  draftOfOutput,
  identOf,
  inputOf,
  outputOf,
  type DraftIssues,
  type PortDraft,
} from './row-draft-model';

export type EditSide = PortSide | 'exits';

export interface Editing {
  readonly side: EditSide;
  readonly draft: PortDraft;
}

export interface Routing {
  readonly exit: string;
  readonly returns: readonly string[];
}

export interface InterfacePanelState {
  readonly editing: Editing | null;
  readonly issues: DraftIssues;
  readonly routing: Routing | null;
  readonly notice: string | null;
  readonly add: (side: EditSide) => void;
  readonly edit: (side: PortSide, name: string) => void;
  readonly change: (draft: PortDraft) => void;
  readonly save: () => void;
  readonly cancel: () => void;
  readonly reorder: (side: EditSide, order: readonly string[]) => void;
  readonly remove: (side: EditSide, name: string) => void;
  readonly route: (to: string) => void;
  readonly cancelRoute: () => void;
}

function draftFor(program: FunctionV3, side: PortSide, name: string): PortDraft | null {
  if (side === 'inputs') {
    const port = program.inputs.find((entry) => entry.name === name);
    return port === undefined ? null : draftOfInput(port);
  }
  const port = program.outputs.find((entry) => entry.name === name);
  return port === undefined ? null : draftOfOutput(port);
}

function editOf(program: FunctionV3, editing: Editing): InterfaceEdit | DraftIssues {
  const { side, draft } = editing;
  if (side === 'exits') {
    const taken = program.exits;
    return draft.label.trim() === ''
      ? { label: 'Give it a name.', defaultValue: null }
      : { op: 'add-exit', name: identOf(draft.label, taken) };
  }
  const taken = (side === 'inputs' ? program.inputs : program.outputs).map((port) => port.name);
  if (side === 'inputs') {
    const result = inputOf(draft, taken);
    return result.ok ? { op: 'put-input', port: result.port } : result.issues;
  }
  const result = outputOf(draft, taken);
  return result.ok ? { op: 'put-output', port: result.port } : result.issues;
}

interface RowEditing {
  readonly editing: Editing | null;
  readonly issues: DraftIssues;
  readonly add: (side: EditSide) => void;
  readonly edit: (side: PortSide, name: string) => void;
  readonly change: (draft: PortDraft) => void;
  readonly cancel: () => void;
  readonly save: () => void;
}

function useRowEditing(program: FunctionV3, run: (edit: InterfaceEdit) => boolean): RowEditing {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [issues, setIssues] = useState<DraftIssues>(NO_ISSUES);
  const open = useCallback((next: Editing): void => {
    setIssues(NO_ISSUES);
    setEditing(next);
  }, []);
  const cancel = useCallback((): void => {
    setEditing(null);
    setIssues(NO_ISSUES);
  }, []);
  const save = useCallback((): void => {
    if (editing === null) return;
    const edit = editOf(program, editing);
    if (!('op' in edit)) {
      setIssues(edit);
    } else if (run(edit)) {
      cancel();
    }
  }, [editing, program, run, cancel]);
  return {
    editing,
    issues,
    add: (side): void => {
      open({ side, draft: blankDraft() });
    },
    edit: (side, name): void => {
      const draft = draftFor(program, side, name);
      if (draft !== null) open({ side, draft });
    },
    change: (draft): void => {
      setEditing((current) => (current === null ? null : { ...current, draft }));
    },
    cancel,
    save,
  };
}

export function useInterfacePanel(
  program: FunctionV3,
  onProgram: (program: FunctionV3) => void,
): InterfacePanelState {
  const [routing, setRouting] = useState<Routing | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = useCallback(
    (edit: InterfaceEdit): boolean => {
      const outcome = applyInterfaceEdit(program, edit);
      if (outcome.ok) {
        setNotice(null);
        onProgram(outcome.program);
        return true;
      }
      if (outcome.reason === 'needs-route' && edit.op === 'remove-exit') {
        setRouting({ exit: edit.name, returns: outcome.returns });
      } else {
        setNotice(outcome.message);
      }
      return false;
    },
    [program, onProgram],
  );
  const rows = useRowEditing(program, run);
  return {
    ...rows,
    routing,
    notice,
    reorder: (side, order): void => {
      run({ op: 'reorder', side, order });
    },
    remove: (side, name): void => {
      run(side === 'exits' ? { op: 'remove-exit', name } : { op: 'remove-port', side, name });
    },
    route: (to): void => {
      if (routing !== null && run({ op: 'remove-exit', name: routing.exit, routeTo: to })) {
        setRouting(null);
      }
    },
    cancelRoute: (): void => {
      setRouting(null);
    },
  };
}
