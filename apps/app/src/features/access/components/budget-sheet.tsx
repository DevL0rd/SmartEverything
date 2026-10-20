import type { ReactNode } from 'react';
import { useState } from 'react';
import { SwitchRow } from '../../../components/rows';
import { TextField } from '../../../components/text-field';
import { notifyFailure } from '../../../components/toast-store';
import { DEFAULT_WARN_PERCENT, budgetOf, usdOf } from '../model/scopes';
import { EditorSheet, type EditorProps } from './editor-sheet';

function textOf(usd: number | null | undefined): string {
  return usd === null || usd === undefined ? '' : String(usd);
}

export function BudgetSheet({ access, actions, onClose }: EditorProps): ReactNode {
  const [daily, setDaily] = useState(textOf(access.budget?.daily_usd));
  const [monthly, setMonthly] = useState(textOf(access.budget?.monthly_usd));
  const [hardStop, setHardStop] = useState(access.budget?.hard_stop ?? true);
  const budget = budgetOf(
    usdOf(daily),
    usdOf(monthly),
    hardStop,
    access.budget?.warn_at_percent ?? DEFAULT_WARN_PERCENT,
  );
  return (
    <EditorSheet
      title="AI budget"
      intro="What this person may spend on the AI. Leave both empty for no limit."
      fit
      disabled={budget === 'invalid'}
      onClose={onClose}
      onSave={() => {
        if (budget !== 'invalid') {
          actions
            .change(access.profile_id, { budget })
            .catch(notifyFailure('The AI budget was not saved'));
        }
      }}
    >
      <TextField
        label="Per day, in dollars"
        value={daily}
        onChange={setDaily}
        kind="number"
        error={budget === 'invalid' ? 'Use an amount between 0.01 and 100000' : null}
      />
      <TextField
        label="Per month, in dollars"
        value={monthly}
        onChange={setMonthly}
        kind="number"
      />
      <SwitchRow
        title="Stop at the limit"
        subtitle="Otherwise the owner and the person are only warned"
        wrapSubtitle
        value={hardStop}
        onChange={setHardStop}
      />
    </EditorSheet>
  );
}
