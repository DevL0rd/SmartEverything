import type { NodeKindLookup } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { isExecNode, type ProgramV4 } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { Text } from '../../../../../components/text';
import { deleteEffectOf, type DeleteEffect } from '../../host/delete-intent';
import type { GraphEnv, InspectorActions } from './section-types';

const EFFECT_TEXT: Readonly<Record<Exclude<DeleteEffect, 'stays'>, string>> = {
  heals: 'The steps before and after it are joined up. Undo brings it back.',
  loose: 'The steps it leads to stay on the canvas, unconnected. Undo brings it back.',
};

const CLEARED = 'Wires that read it are cleared. Undo brings it back.';

interface Wording {
  readonly label: string;
  readonly text: string;
}

function wordingOf(
  graph: ProgramV4,
  id: string,
  effect: Exclude<DeleteEffect, 'stays'>,
  kinds: NodeKindLookup,
): Wording {
  if (graph.kind === 'automation' && graph.triggers.some((trigger) => trigger.id === id)) {
    return { label: 'Delete trigger', text: CLEARED };
  }
  const node = graph.nodes.find((item) => item.id === id);
  if (node !== undefined && !isExecNode(node.kind, kinds))
    return { label: 'Delete value', text: CLEARED };
  return { label: 'Delete step', text: EFFECT_TEXT[effect] };
}

export function DeleteStep({
  id,
  env,
  actions,
}: {
  readonly id: string;
  readonly env: GraphEnv;
  readonly actions: InspectorActions;
}): ReactNode {
  const effect = deleteEffectOf(env.graph, id, env.registry);
  if (effect === 'stays' || env.locked) return null;
  const wording = wordingOf(env.graph, id, effect, env.registry);
  return (
    <View className="gap-2 border-t border-outline-variant px-4 pt-4">
      <View className="self-start">
        <Button
          label={wording.label}
          icon="trash"
          variant="destructive"
          onPress={() => {
            actions.deleteStep(id);
          }}
        />
      </View>
      <Text variant="footnote" tone="variant">
        {wording.text}
      </Text>
    </View>
  );
}
