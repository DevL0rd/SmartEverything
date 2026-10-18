import type { ReactNode } from 'react';
import { View } from 'react-native';
import { MAX_AUTOMATION_PARALLEL, MAX_AUTOMATION_QUEUE } from '@smarteverything/domain';
import { NumberStepper } from '../../../components/number-stepper';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import type { RunBehaviour } from '../model/editor-state';
import { Labelled } from './labelled';

type Mode = NonNullable<RunBehaviour['mode']>;

const MODE_LABELS: Readonly<Record<Mode, string>> = {
  single: 'Ignore the new start',
  restart: 'Stop the old run and start again',
  queue: 'Wait for the old run, then run',
  parallel: 'Run both at the same time',
};

const MODE_HELP: Readonly<Record<Mode, string>> = {
  single: 'A start that comes while it is still running does nothing.',
  restart: 'The earlier run ends and a fresh one begins.',
  queue: 'Starts line up and run one after another, in order.',
  parallel: 'Each start runs on its own, side by side.',
};

const MODES = ['single', 'restart', 'queue', 'parallel'] as const;
const DEFAULT_LIMIT = 2;

function withMode(run: RunBehaviour, mode: Mode): RunBehaviour {
  if (mode === 'queue') return { ...run, mode, max: run.max ?? DEFAULT_LIMIT };
  if (mode === 'parallel') return { mode, max: run.max, key: run.key };
  return { mode: mode === 'single' ? undefined : mode, max: undefined, key: run.key };
}

export function RunBehaviourFields({
  run,
  focusKey,
  onChange,
}: {
  readonly run: RunBehaviour;
  readonly focusKey?: boolean;
  readonly onChange: (run: RunBehaviour) => void;
}): ReactNode {
  const mode = run.mode ?? 'single';
  return (
    <View className="gap-3">
      <Select
        label="If it starts again while running"
        value={mode}
        options={MODES.map((value) => ({ value, label: MODE_LABELS[value] }))}
        onChange={(next) => {
          onChange(withMode(run, next));
        }}
      />
      <Text variant="callout" tone="variant">
        {MODE_HELP[mode]}
      </Text>
      {mode === 'queue' || mode === 'parallel' ? (
        <Labelled label={mode === 'queue' ? 'How many can wait' : 'How many at once'}>
          <NumberStepper
            label={mode === 'queue' ? 'How many can wait' : 'How many at once'}
            value={run.max ?? DEFAULT_LIMIT}
            min={1}
            max={mode === 'queue' ? MAX_AUTOMATION_QUEUE : MAX_AUTOMATION_PARALLEL}
            step={1}
            onChange={(max) => {
              onChange({ ...run, max });
            }}
          />
        </Labelled>
      ) : null}
      <TextField
        label="Stop key (optional)"
        focusOnMount={focusKey === true}
        helper="Give automations the same key so one Stop step can end all of their runs."
        value={run.key ?? ''}
        onChange={(key) => {
          onChange({ ...run, key: key.trim() === '' ? undefined : key });
        }}
      />
    </View>
  );
}
