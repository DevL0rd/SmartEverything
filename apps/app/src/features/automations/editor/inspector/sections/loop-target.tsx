import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Segmented } from '../../../../../components/segmented';
import { breakTarget, LOOP_EXIT_KINDS, targetOps } from './loop-model';
import { swapKindOps } from './edits';
import { enclosingLoops, flowNodeOf } from './node-view';
import { RadioRows } from './radio-rows';
import type { SectionProps } from './section-types';

const INNERMOST = '';

export function LoopTarget(section: SectionProps): ReactNode {
  const { view, env, actions } = section;
  const node = flowNodeOf(view);
  if (node === undefined) return null;
  const loops = enclosingLoops(env.index, view, env.describe, env.scope);
  const current = breakTarget(node) ?? INNERMOST;
  return (
    <View className="gap-3">
      <View className="px-4">
        <Segmented
          label="What this step does to the loop"
          options={LOOP_EXIT_KINDS.map((entry) => ({ value: entry.kind, label: entry.label }))}
          value={node.kind}
          disabled={env.locked}
          onChange={(kind) => {
            actions.apply(swapKindOps(view, kind));
          }}
        />
      </View>
      <RadioRows
        title="Which loop"
        value={current}
        disabled={env.locked}
        options={loops.map((loop) => ({
          value: loop.innermost ? INNERMOST : loop.key,
          title: loop.label,
          subtitle: loop.innermost ? 'Innermost' : 'Outer',
        }))}
        onChange={(target) => {
          actions.apply(targetOps(view.key, target === INNERMOST ? undefined : target));
        }}
      />
    </View>
  );
}
