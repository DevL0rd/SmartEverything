import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  BURN_MINUTES_MAX,
  BURN_MINUTES_MIN,
  type AiBudgetChange,
  type AiBudgetSettings,
} from '@smarteverything/domain';
import { LoadedQuery } from '../../../components/loaded-query';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { SwitchRow } from '../../../components/rows';
import { notifyFailure } from '../../../components/toast-store';
import type { IconName } from '../../../components/icon-glyphs';
import { useIsOwner } from '../../../store/selectors';
import { useBudgetStatus, useBudgetUpdate } from '../data/budget';
import { useMoney, type Money } from '../../region';
import { BudgetSheet, type BudgetField, type BudgetValues } from './budget-sheet';

const USD_MIN = 0.01;
const USD_MAX = 100_000;

export interface LimitSpec {
  readonly title: string;
  readonly icon: IconName;
  readonly value: (settings: AiBudgetSettings, money: Money) => string;
  readonly fields: (settings: AiBudgetSettings, money: Money) => readonly BudgetField[];
  readonly change: (values: BudgetValues, money: Money) => AiBudgetChange;
  readonly off: AiBudgetChange;
}

const USD_KEY = 'usd';

function moneyField(money: Money, label: string, helper: string, usd: number | null): BudgetField {
  const { min, max } = money.bounds(USD_MIN, USD_MAX);
  return {
    key: USD_KEY,
    label: `${label}, in ${money.format.currency}`,
    helper,
    unit: 'money',
    initial: usd === null ? null : money.toLocal(usd),
    min,
    max,
  };
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
    value: (s, m) => (s.daily_usd === null ? 'Off' : m.dollars(s.daily_usd)),
    fields: (s, m) => [moneyField(m, 'Per day', 'Counts every AI source.', s.daily_usd)],
    change: (v, m) => ({ daily_usd: m.toUsd(amountOf(v, USD_KEY)) }),
    off: { daily_usd: null },
  },
  monthly: {
    title: 'Monthly limit',
    icon: 'calendar',
    value: (s, m) => (s.monthly_usd === null ? 'Off' : m.dollars(s.monthly_usd)),
    fields: (s, m) => [moneyField(m, 'Per month', 'Counts every AI source.', s.monthly_usd)],
    change: (v, m) => ({ monthly_usd: m.toUsd(amountOf(v, USD_KEY)) }),
    off: { monthly_usd: null },
  },
  burn: {
    title: 'Spending spike alert',
    icon: 'flame',
    value: (s, m) =>
      s.burn === null ? 'Off' : `${m.dollars(s.burn.usd)} in ${String(s.burn.minutes)} min`,
    fields: (s, m) => [
      moneyField(m, 'Alert when more than', 'Spent within the time below.', s.burn?.usd ?? null),
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
    change: (v, m) => ({
      burn: { usd: m.toUsd(amountOf(v, USD_KEY)), minutes: amountOf(v, 'minutes') },
    }),
    off: { burn: null },
  },
  credits: {
    title: 'Low credits alert',
    icon: 'battery',
    value: (s, m) => (s.low_credits_usd === null ? 'Off' : `Below ${m.dollars(s.low_credits_usd)}`),
    fields: (s, m) => [moneyField(m, 'Alert below', 'OpenRouter credits left.', s.low_credits_usd)],
    change: (v, m) => ({ low_credits_usd: m.toUsd(amountOf(v, USD_KEY)) }),
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
  return (
    <LoadedQuery query={useBudgetStatus()}>{(status) => children(status.settings)}</LoadedQuery>
  );
}

export function LimitRow({ spec }: { readonly spec: LimitSpec }): ReactNode {
  const owner = useIsOwner();
  const change = useBudgetChange();
  const money = useMoney();
  const [open, setOpen] = useState(false);
  return (
    <Loaded>
      {(settings) => (
        <>
          <ListRow
            title={spec.title}
            icon={spec.icon}
            value={spec.value(settings, money)}
            chevron={owner}
            disabled={!owner}
            onPress={() => {
              setOpen(true);
            }}
          />
          {open ? (
            <BudgetSheet
              title={spec.title}
              fields={spec.fields(settings, money)}
              open
              onClose={() => {
                setOpen(false);
              }}
              onSave={(values) => change(spec.change(values, money))}
              onTurnOff={() => change(spec.off)}
            />
          ) : null}
        </>
      )}
    </Loaded>
  );
}

const failed = notifyFailure('The budget was not changed');

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
