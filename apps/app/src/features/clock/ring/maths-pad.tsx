import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { plannerMathsProblemsOf } from '@smarteverything/domain';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import {
  FIRST_ENTRY,
  eraseDigit,
  mathsSolved,
  submitAnswer,
  typeDigit,
  type ChallengePlan,
  type MathsEntry,
} from './challenge-model';

type MathsPlan = Extract<ChallengePlan, { readonly kind: 'maths' }>;

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

const KEY_FRAME = 'h-14 flex-1 items-center justify-center rounded-lg';

function DigitKey({
  digit,
  enabled,
  onPress,
}: {
  readonly digit: string;
  readonly enabled: boolean;
  readonly onPress: (digit: string) => void;
}): ReactNode {
  return (
    <Interactive
      label={digit}
      disabled={!enabled}
      className={cn(KEY_FRAME, 'bg-surface-2')}
      onPress={() => {
        onPress(digit);
      }}
    >
      <Text className="font-mono-medium text-figure-s tabular">{digit}</Text>
    </Interactive>
  );
}

function ActionKey({
  icon,
  label,
  enabled,
  primary,
  onPress,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly enabled: boolean;
  readonly primary: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={label}
      disabled={!enabled}
      onTone={primary ? 'primary' : 'surface'}
      className={cn(KEY_FRAME, primary ? 'bg-primary' : 'bg-surface-1')}
      onPress={onPress}
    >
      <Icon name={icon} size={24} tone={primary ? 'onPrimary' : 'default'} />
    </Interactive>
  );
}

function Keypad({
  entry,
  enabled,
  onEntry,
  onSubmit,
}: {
  readonly entry: MathsEntry;
  readonly enabled: boolean;
  readonly onEntry: (next: MathsEntry) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  const type = (digit: string): void => {
    onEntry(typeDigit(entry, digit));
  };
  const rows = [DIGITS.slice(0, 3), DIGITS.slice(3, 6), DIGITS.slice(6, 9)];
  return (
    <View className="gap-2">
      {rows.map((row) => (
        <View key={row.join('')} className="flex-row gap-2">
          {row.map((digit) => (
            <DigitKey key={digit} digit={digit} enabled={enabled} onPress={type} />
          ))}
        </View>
      ))}
      <View className="flex-row gap-2">
        <ActionKey
          icon="arrowLeft"
          label="Erase a digit"
          enabled={enabled ? entry.typed !== '' : false}
          primary={false}
          onPress={() => {
            onEntry(eraseDigit(entry));
          }}
        />
        <DigitKey digit="0" enabled={enabled} onPress={type} />
        <ActionKey
          icon="check"
          label="Check the answer"
          enabled={enabled ? entry.typed !== '' : false}
          primary
          onPress={onSubmit}
        />
      </View>
    </View>
  );
}

function Problem({
  text,
  typed,
  wrong,
}: {
  readonly text: string;
  readonly typed: string;
  readonly wrong: boolean;
}): ReactNode {
  return (
    <View className="items-center gap-2">
      <Text className="font-mono-medium text-figure-l tracking-tight tabular" align="center">
        {`${text} =`}
      </Text>
      <View
        className={cn(
          'min-h-14 w-full items-center justify-center rounded-lg border-2 px-4',
          wrong ? 'border-critical' : 'border-outline',
        )}
      >
        <Text className="font-mono-medium text-figure-m tabular" align="center">
          {typed === '' ? ' ' : typed}
        </Text>
      </View>
      <Text variant="caption" tone={wrong ? 'critical' : 'variant'} align="center" role="alert">
        {wrong ? 'Not quite. Try again.' : 'Type the answer to stop the alarm.'}
      </Text>
    </View>
  );
}

export function MathsPad({
  plan,
  seed,
  enabled,
  onSolved,
}: {
  readonly plan: MathsPlan;
  readonly seed: string;
  readonly enabled: boolean;
  readonly onSolved: () => void;
}): ReactNode {
  const problems = useMemo(
    () => plannerMathsProblemsOf(seed, plan.difficulty, plan.count),
    [seed, plan.difficulty, plan.count],
  );
  const [entry, setEntry] = useState(FIRST_ENTRY);
  const problem = problems[entry.index];
  const submit = (): void => {
    const next = submitAnswer(entry, problems);
    setEntry(next);
    if (mathsSolved(next, problems)) onSolved();
  };
  return (
    <View className="gap-4 rounded-xl bg-surface-1/80 p-card-pad">
      <View className="flex-row items-center gap-2">
        <Icon name="calculator" size={16} tone="primary" />
        <Text variant="callout" tone="variant">
          {`Problem ${String(Math.min(entry.index + 1, problems.length))} of ${String(problems.length)}`}
        </Text>
      </View>
      {problem === undefined ? (
        <Text variant="body-strong" align="center">
          Solved. Stopping it…
        </Text>
      ) : (
        <Problem text={problem.text} typed={entry.typed} wrong={entry.wrong} />
      )}
      <Keypad
        entry={entry}
        enabled={enabled ? problem !== undefined : false}
        onEntry={setEntry}
        onSubmit={submit}
      />
    </View>
  );
}
