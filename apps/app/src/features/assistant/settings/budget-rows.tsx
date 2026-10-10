import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  BURN_MINUTES_MAX,
  BURN_MINUTES_MIN,
  microsOfUsd,
  type AiBudgetChange,
  type AiBudgetSettings,
} from '@smarteverything/domain';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { SwitchRow } from '../../../components/rows';
import { Skeleton } from '../../../components/skeleton';
import { notify } from '../../../components/toast-store';
import type { IconName } from '../../../components/icon-glyphs';
import { useIsOwner } from '../../../store/selectors';
import { useBudgetStatus, useBudgetUpdate } from '../data/budget';
import { costText } from '../data/cost';
import { BudgetSheet, type BudgetField, type BudgetValues } from './budget-sheet';

const USD_MAX = 100_000;

function usd(value: number): string {
  return costText(microsOfUsd(value));
}

export interface LimitSpec {
  readonly title: string;
  readonly icon: IconName;
  readonly value: (settings: AiBudgetSettings) => string;
  readonly fields: (settings: AiBudgetSettings) => readonly BudgetField[];
  readonly change: (values: BudgetValues) => AiBudgetChange;
  readonly off: AiBudgetChange;
}

function money(key: string, label: string, helper: string, initial: number | null): BudgetField {
  return { key, label, helper, unit: 'usd', initial, min: 0.01, max: USD_MAX };
}

function amountOf(values: BudgetValues, key: string): number {
  const value = values[key];
  if (value === undefined) {
    throw new Error(`The ${key} field is missing.`);
  }
  return value;
}

export const LIMITS: Readonly<Record<'daily' | 'monthly' | 'burn' | 'credits', LimitSpec>> = {
  daily: {
    title: 'Daily limit',
    icon: 'sun',
    value: (s) => (s.daily_usd === null ? 'Off' : usd(s.daily_usd)),
    fields: (s) => [money('usd', 'Per day, in US dollars', 'Counts every AI source.', s.daily_usd)],
    change: (v) => ({ daily_usd: amountOf(v, 'usd') }),
    off: { daily_usd: null },
  },
  monthly: {
    title: 'Monthly limit',
    icon: 'calendar',
    value: (s) => (s.monthly_usd === null ? 'Off' : usd(s.monthly_usd)),
    fields: (s) => [
      money('usd', 'Per month, in US dollars', 'Counts every AI source.', s.monthly_usd),
    ],
    change: (v) => ({ monthly_usd: amountOf(v, 'usd') }),
    off: { monthly_usd: null },
  },
  burn: {
    title: 'Spending spike alert',
    icon: 'flame',
    value: (s) => (s.burn === null ? 'Off' : `${usd(s.burn.usd)} in ${String(s.burn.minutes)} min`),
    fields: (s) => [
      money(
        'usd',
        'Alert when more than, in US dollars',
        'Spent within the time below.',
        s.burn?.usd ?? null,
      ),
      {
        key: 'minutes',
        label: 'Within, in minutes',
        helper: `${String(BURN_MINUTES_MIN)} to ${String(BURN_MINUTES_MAX)} minutes.`,
        unit: 'minutes',
        initial: s.burn?.minutes ?? null,
        min: BURN_MINUTES_MIN,
        max: BURN_MINUTES_MAX,
      },
    ],
    change: (v) => ({ burn: { usd: amountOf(v, 'usd'), minutes: amountOf(v, 'minutes') } }),
    off: { burn: null },
  },
  credits: {
    title: 'Low credits alert',
    icon: 'battery',
    value: (s) => (s.low_credits_usd === null ? 'Off' : `Below ${usd(s.low_credits_usd)}`),
    fields: (s) => [
      money('usd', 'Alert below, in US dollars', 'OpenRouter credits left.', s.low_credits_usd),
    ],
    change: (v) => ({ low_credits_usd: amountOf(v, 'usd') }),
    off: { low_credits_usd: null },
  },
};

function useBudgetChange(): (change: AiBudgetChange) => Promise<void> {
  const update = useBudgetUpdate();
  return async (change) => {
    await update(change);
  };
}

function Loaded({
  children,
}: {
  readonly children: (settings: AiBudgetSettings) => ReactNode;
}): ReactNode {
  const status = useBudgetStatus();
  if (status.isError) {
    return <ErrorState error={status.error} retry={() => void status.refetch()} />;
  }
  if (status.data === undefined) {
    return <Skeleton shape="line" className="h-12" />;
  }
  return children(status.data.settings);
}

export function LimitRow({ spec }: { readonly spec: LimitSpec }): ReactNode {
  const owner = useIsOwner();
  const change = useBudgetChange();
  const [open, setOpen] = useState(false);
  return (
    <Loaded>
      {(settings) => (
        <>
          <ListRow
            title={spec.title}
            icon={spec.icon}
            value={spec.value(settings)}
            chevron={owner}
            disabled={!owner}
            onPress={() => {
              setOpen(true);
            }}
          />
          {open ? (
            <BudgetSheet
              title={spec.title}
              fields={spec.fields(settings)}
              open
              onClose={() => {
                setOpen(false);
              }}
              onSave={(values) => change(spec.change(values))}
              onTurnOff={() => change(spec.off)}
            />
          ) : null}
        </>
      )}
    </Loaded>
  );
}

function failed(error: unknown): void {
  notify({ message: 'The budget was not changed', error });
}

export function WarnAtRow(): ReactNode {
  const owner = useIsOwner();
  const change = useBudgetChange();
  return (
    <Loaded>
      {(settings) => (
        <ListRow
          title="Warn me early at"
          icon="bell"
          trailing={
            <NumberStepper
              value={settings.warn_at_percent}
              min={10}
              max={99}
              step={5}
              unit="%"
              label="Warn me early at"
              disabled={!owner}
              onChange={(value) => {
                change({ warn_at_percent: value }).catch(failed);
              }}
            />
          }
        />
      )}
    </Loaded>
  );
}

export function HardStopRow(): ReactNode {
  const owner = useIsOwner();
  const change = useBudgetChange();
  return (
    <Loaded>
      {(settings) => (
        <SwitchRow
          title="Pause background AI at the limit"
          subtitle="Wake-ups, routines and helpers stop. Your own chats keep working."
          icon="power"
          value={settings.hard_stop}
          disabled={!owner}
          onChange={(value) => {
            change({ hard_stop: value }).catch(failed);
          }}
        />
      )}
    </Loaded>
  );
}
