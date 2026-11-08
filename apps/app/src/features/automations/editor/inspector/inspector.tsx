import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { nodeName } from '@smarteverything/flow/graph/problem-types';
import { Button } from '../../../../components/button';
import { Sheet } from '../../../../components/sheet';
import { SheetHeader } from '../../../../components/sheet-header';
import { NodeSections } from './sections';
import { GraphPanel } from './sections/graph-panel';
import { nodeView } from './sections/node-view';
import type { GraphEnv, InspectorActions, InspectorEnv } from './sections/section-types';

export interface InspectorModel {
  readonly graph: GraphEnv;
  readonly steps: InspectorEnv | null;
}

export interface InspectorProps {
  readonly selectedId: string | null;
  readonly model: InspectorModel;
  readonly actions: InspectorActions;
  readonly docked: boolean;
  readonly onClose: () => void;
}

interface Subject {
  readonly id: string;
  readonly title: string;
  readonly body: ReactNode;
}

function subjectOf(
  selectedId: string | null,
  model: InspectorModel,
  actions: InspectorActions,
): Subject | undefined {
  if (selectedId === null) return undefined;
  const { steps } = model;
  const view = steps === null ? undefined : nodeView(steps.index, selectedId, steps.registry);
  if (view !== undefined && steps !== null) {
    return {
      id: view.id,
      title: view.title,
      body: <NodeSections key={view.id} view={view} env={steps} actions={actions} />,
    };
  }
  const node = model.graph.graph.nodes.find((item) => item.id === selectedId);
  if (node === undefined) return undefined;
  return {
    id: node.id,
    title: nodeName(node, model.graph.registry),
    body: <GraphPanel key={node.id} node={node} env={model.graph} actions={actions} />,
  };
}

function DockedPanel({
  subject,
  onClose,
}: Pick<InspectorProps, 'onClose'> & { readonly subject: Subject }): ReactNode {
  return (
    <View
      accessibilityLabel="Step options"
      className="h-full w-inspector max-w-full border-l border-outline-variant bg-surface-raised"
    >
      <View className="pt-4">
        <SheetHeader title={subject.title} onClose={onClose} touch={false} />
      </View>
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="pt-2">
        {subject.body}
      </ScrollView>
    </View>
  );
}

export function Inspector({
  selectedId,
  model,
  actions,
  docked,
  onClose,
}: InspectorProps): ReactNode {
  const subject = subjectOf(selectedId, model, actions);
  if (docked) {
    return subject === undefined ? null : <DockedPanel subject={subject} onClose={onClose} />;
  }
  return (
    <Sheet
      open={subject !== undefined}
      title={subject?.title ?? 'Step'}
      label="Step options"
      kind="inspector"
      detents={['half', 'full']}
      footer={<Button label="Done" onPress={onClose} />}
      onClose={onClose}
    >
      {subject?.body ?? null}
    </Sheet>
  );
}
