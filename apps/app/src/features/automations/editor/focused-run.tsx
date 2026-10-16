import type { ReactNode } from 'react';
import { useRows } from '../../../store/selectors';
import { OwnedRunSheet } from '../components/owned-runs';
import { useEditorFocus } from './editor-focus';

export function FocusedRun(): ReactNode {
  const focus = useEditorFocus();
  const rows = useRows('automation_runs');
  return (
    <OwnedRunSheet
      run={rows.find((row) => `run:${row.id}` === focus.target) ?? null}
      onClose={focus.close}
    />
  );
}
