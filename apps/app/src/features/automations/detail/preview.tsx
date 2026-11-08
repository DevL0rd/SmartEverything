import { useMemo, useState, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RefNames } from '@smarteverything/domain';
import type { AutomationRow } from '../data/graph-adapter';
import { useAutomationsSource } from '../data/source';
import { Card } from '../../../components/card';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { useViewCanvas } from '../editor/host/canvas-host';
import type { SceneOptions } from '../editor/host/use-canvas-props';
import { useViewportCommand } from '../editor/screen/use-editor-panels';
import { sceneBounds, wholeHeight, type ViewportCommand } from '../editor/canvas/viewport';
import { DocumentStore } from '../model/editor/document-store';

const NO_PROBLEMS: readonly never[] = [];
const NO_FUNCTIONS: SceneOptions['functions'] = new Map();

function ignore(): void {
  return undefined;
}

const SILENT = { openNode: ignore, stepPass: ignore, settled: ignore } as const;

interface PreviewProps {
  readonly row: AutomationRow;
  readonly names: RefNames;
}

interface MiniCanvasProps extends PreviewProps {
  readonly command: ViewportCommand | null;
  readonly moving: boolean;
  readonly onMove: () => void;
}

function usePanelHeight(bounds: ReturnType<typeof sceneBounds>, width: number): number {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const available = screen.height - insets.top - insets.bottom;
  return bounds === null ? available : wholeHeight(bounds, width, available);
}

function MiniCanvas({ row, names, command, moving, onMove }: MiniCanvasProps): ReactNode {
  const kinds = useAutomationsSource().lookup;
  const store = useMemo(() => new DocumentStore(row.graph, kinds, row.layout), [row, kinds]);
  const { lookup } = useAutomationsSource();
  const options: SceneOptions = useMemo(
    () => ({ registry: lookup, names, functions: NO_FUNCTIONS }),
    [lookup, names],
  );
  const canvas = useViewCanvas({
    store,
    options,
    problems: NO_PROBLEMS,
    run: null,
    focusNode: null,
    viewportCommand: command,
    ghost: null,
    onScreen: false,
    actions: SILENT,
    framing: 'whole',
  });
  const [width, setWidth] = useState(0);
  const bounds = useMemo(() => sceneBounds(canvas.scene.nodes), [canvas.scene]);
  const height = usePanelHeight(bounds, width);
  const frame = useMemo(() => ({ height }), [height]);
  return (
    <View
      style={frame}
      className="relative overflow-hidden rounded-md bg-surface-2"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      <View
        className="flex-1"
        pointerEvents={moving ? 'auto' : 'none'}
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        {canvas.element}
      </View>
      {moving ? null : (
        <Interactive label="Move and zoom the graph" onPress={onMove} className="absolute inset-0">
          {null}
        </Interactive>
      )}
    </View>
  );
}

export function Preview({ row, names }: PreviewProps): ReactNode {
  const viewport = useViewportCommand();
  const [moving, setMoving] = useState(false);
  const action = (
    <View className="flex-row items-center gap-1">
      <IconButton
        icon="move"
        label="Move and zoom the graph"
        selected={moving}
        onPress={() => {
          setMoving((current) => !current);
        }}
      />
      <IconButton
        icon="maximize"
        label="Fit to view"
        onPress={() => {
          viewport.issue('fit');
        }}
      />
    </View>
  );
  return (
    <Card title="What it does" icon="workflow" action={action}>
      <MiniCanvas
        row={row}
        names={names}
        command={viewport.command}
        moving={moving}
        onMove={() => {
          setMoving(true);
        }}
      />
    </Card>
  );
}
