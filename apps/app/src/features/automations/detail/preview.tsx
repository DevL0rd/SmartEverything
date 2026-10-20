import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { NODE_REGISTRY, type AutomationRowV3, type RefNames } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { CanvasHost } from '../editor/host/canvas-host';
import type { HostActions } from '../editor/host/intent-env';
import type { SceneOptions } from '../editor/host/use-canvas-props';
import { DocumentStore } from '../model/editor/document-store';

const PREVIEW_HEIGHT = 320;
const FRAME = { height: PREVIEW_HEIGHT } as const;
const FIT = { type: 'fit', seq: 1 } as const;

function ignore(): void {
  return undefined;
}

const SILENT: HostActions = {
  openNode: ignore,
  insertOnEdge: ignore,
  openSlot: ignore,
  portDropEmpty: ignore,
  groupSelection: ignore,
  viewportSettled: ignore,
  refused: ignore,
};

interface PreviewProps {
  readonly row: AutomationRowV3;
  readonly names: RefNames;
}

function MiniCanvas({ row, names }: PreviewProps): ReactNode {
  const store = useMemo(() => new DocumentStore(row.definition, row.layout), [row]);
  const options: SceneOptions = useMemo(() => ({ registry: NODE_REGISTRY, names }), [names]);
  return (
    <View
      style={FRAME}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      className="overflow-hidden rounded-md bg-surface-2"
    >
      <CanvasHost
        store={store}
        options={options}
        run={null}
        focusNode={null}
        viewportCommand={FIT}
        onScreen={false}
        actions={SILENT}
      />
    </View>
  );
}

export function Preview({ row, names }: PreviewProps): ReactNode {
  return (
    <Card title="What it does" icon="workflow">
      <MiniCanvas row={row} names={names} />
    </Card>
  );
}
