import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { gapText, stripOf, type LoopInfo, type Outcome, type StripItem } from './run-loops';

const OUTCOME_FILL: Readonly<Record<Outcome, string>> = {
  ok: 'bg-positive',
  failed: 'bg-critical',
  running: 'bg-primary',
};

const OUTCOME_WORD: Readonly<Record<Outcome, string>> = {
  ok: 'done',
  failed: 'failed',
  running: 'running',
};

export interface LoopStepperProps {
  readonly info: LoopInfo;
  readonly name: string;
  readonly onPick: (loopId: string, iteration: number) => void;
}

export function loopTitle(name: string, position: number, total: number): string {
  return `${name} ${String(position)} of ${String(total)}`;
}

function Cell({
  item,
  info,
  name,
  onPick,
}: LoopStepperProps & { readonly item: Extract<StripItem, { kind: 'pass' }> }): ReactNode {
  const iteration = info.iterations[item.position - 1];
  const here = item.position === info.position;
  return (
    <Interactive
      label={`${loopTitle(name, item.position, info.total)}, ${OUTCOME_WORD[item.outcome]}`}
      selected={here}
      hitSlop={6}
      onPress={() => {
        if (iteration !== undefined) onPick(info.nodeId, iteration);
      }}
      className="min-h-touch-min min-w-6 items-center justify-center"
    >
      <View
        className={cn('w-2.5 rounded-full', OUTCOME_FILL[item.outcome], here ? 'h-7' : 'h-4')}
      />
    </Interactive>
  );
}

function Strip(props: LoopStepperProps): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center">
      {stripOf(props.info).map((item) =>
        item.kind === 'pass' ? (
          <Cell key={item.position} {...props} item={item} />
        ) : (
          <Text key={`gap-${String(item.from)}`} variant="caption" tone="variant" className="px-1">
            {gapText(item)}
          </Text>
        ),
      )}
    </View>
  );
}

export const LoopStepper = memo(function LoopStepper(props: LoopStepperProps): ReactNode {
  const { info, name, onPick } = props;
  const before = info.iterations[info.position - 2];
  const after = info.iterations[info.position];
  return (
    <View className="gap-1 rounded-md bg-surface-1 px-2 py-1">
      <View className="flex-row items-center gap-1">
        <IconButton
          icon="chevronLeft"
          label={`Previous ${name.toLowerCase()}`}
          disabled={before === undefined}
          onPress={() => {
            if (before !== undefined) onPick(info.nodeId, before);
          }}
        />
        <Text variant="body-strong" className="min-w-0 flex-1 text-center tabular">
          {loopTitle(name, info.position, info.total)}
        </Text>
        <IconButton
          icon="chevronRight"
          label={`Next ${name.toLowerCase()}`}
          disabled={after === undefined}
          onPress={() => {
            if (after !== undefined) onPick(info.nodeId, after);
          }}
        />
      </View>
      <Strip info={info} name={name} onPick={onPick} />
    </View>
  );
});
