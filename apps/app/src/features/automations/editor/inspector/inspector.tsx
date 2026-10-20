import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Button } from '../../../../components/button';
import { Sheet } from '../../../../components/sheet';
import { SheetHeader } from '../../../../components/sheet-header';
import { NodeSections } from './sections';
import type { NodeView } from './sections/node-view';
import { nodeView } from './sections/node-view';
import type { InspectorActions, InspectorEnv } from './sections/section-types';

export interface InspectorProps {
  readonly selectedId: string | null;
  readonly env: InspectorEnv;
  readonly actions: InspectorActions;
  readonly docked: boolean;
  readonly onClose: () => void;
}

function DockedPanel({
  view,
  env,
  actions,
  onClose,
}: Pick<InspectorProps, 'env' | 'actions' | 'onClose'> & {
  readonly view: NodeView;
}): ReactNode {
  return (
    <View
      accessibilityLabel="Step options"
      className="h-full w-inspector max-w-full border-l border-outline-variant bg-surface-raised"
    >
      <View className="pt-4">
        <SheetHeader title={view.title} onClose={onClose} touch={false} />
      </View>
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="pt-2">
        <NodeSections key={view.id} view={view} env={env} actions={actions} />
      </ScrollView>
    </View>
  );
}

export function Inspector({
  selectedId,
  env,
  actions,
  docked,
  onClose,
}: InspectorProps): ReactNode {
  const view = selectedId === null ? undefined : nodeView(env.index, selectedId, env.registry);
  if (docked) {
    return view === undefined ? null : (
      <DockedPanel view={view} env={env} actions={actions} onClose={onClose} />
    );
  }
  return (
    <Sheet
      open={view !== undefined}
      title={view?.title ?? 'Step'}
      label="Step options"
      kind="inspector"
      detents={['half', 'full']}
      footer={<Button label="Done" onPress={onClose} />}
      onClose={onClose}
    >
      {view === undefined ? null : (
        <NodeSections key={view.id} view={view} env={env} actions={actions} />
      )}
    </Sheet>
  );
}
