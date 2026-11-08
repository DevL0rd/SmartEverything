import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { GraphNode } from '@smarteverything/domain';
import { Banner } from '../../../../../components/banner';
import { DeleteStep } from './delete-step';
import { GraphAdmit, hasAdmit } from './graph-admit';
import { GraphConnections } from './graph-connections';
import type { GraphSectionProps } from './graph-connections-model';
import { hasConnections } from './graph-connections-model';
import { GraphJoinOptions } from './graph-join-options';
import { FORK_KIND, JOIN_KIND } from './graph-paths-model';
import { GraphPaths } from './graph-paths';
import { GraphRowEditors } from './graph-row-editors';
import { rowKindOf } from './graph-row-model';
import { GraphValuesAfter } from './graph-values-after';
import { hasValuesAfter } from './graph-values-after-model';
import type { GraphEnv, InspectorActions } from './section-types';

export interface GraphPanelProps {
  readonly node: GraphNode;
  readonly env: GraphEnv;
  readonly actions: InspectorActions;
}

export function graphSectionOf(
  node: GraphNode,
  env: GraphEnv,
  actions: InspectorActions,
): GraphSectionProps {
  return {
    program: env.graph,
    kinds: env.registry,
    node,
    locked: env.locked,
    actions: { apply: actions.apply, intent: actions.intent, jump: actions.jump },
    renderValue: env.renderValue,
    subjectChoices: env.subjectChoices,
  };
}

function Problems({ env, actions }: Pick<GraphPanelProps, 'env' | 'actions'>): ReactNode {
  return env.findings.length === 0 ? null : (
    <View className="gap-2 px-4">
      {env.findings.map((found) => (
        <Banner
          key={found.id}
          tone={found.severity === 'error' ? 'critical' : 'warning'}
          title={found.message}
          wrapBody
          {...(found.fix === undefined
            ? {}
            : {
                action: {
                  label: found.fix,
                  onPress: (): void => {
                    actions.fix(found.id);
                  },
                },
              })}
        />
      ))}
    </View>
  );
}

export function GraphPanel(props: GraphPanelProps): ReactNode {
  const section = graphSectionOf(props.node, props.env, props.actions);
  const { node } = props;
  return (
    <View className="gap-5 pb-6">
      <Problems env={props.env} actions={props.actions} />
      {hasAdmit(section) ? <GraphAdmit {...section} /> : null}
      {rowKindOf(node) === undefined ? null : <GraphRowEditors {...section} />}
      {node.kind === FORK_KIND ? <GraphPaths {...section} /> : null}
      {node.kind === JOIN_KIND ? <GraphJoinOptions {...section} /> : null}
      {hasValuesAfter(node) ? <GraphValuesAfter {...section} /> : null}
      {hasConnections(node, section.kinds) ? <GraphConnections {...section} /> : null}
      <DeleteStep id={node.id} env={props.env} actions={props.actions} />
    </View>
  );
}
