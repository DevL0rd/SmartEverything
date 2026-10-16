import { useState, type ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import type { ShellyArea, ShellyTrack } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { Segmented } from '../../components/segmented';
import { SwitchRow } from '../../components/rows';
import { Text } from '../../components/text';
import type { GridCell } from './area-geometry';
import { painterViewport } from './painter-viewport';
import type { PainterViewport } from './painter-viewport';
import { painterGesture } from './use-painter-gesture';
import { PainterCanvas } from './painter-canvas';
import { PainterCursor } from './painter-cursor';
import { areaCells } from './area-context';

const TOOLS = [
  { value: 'paint', label: 'Paint' },
  { value: 'erase', label: 'Erase' },
  { value: 'select', label: 'Select' },
] as const;
interface PainterProps {
  readonly tracks?: readonly ShellyTrack[];
  readonly area: ShellyArea;
  readonly change: (value: ShellyArea) => void;
  readonly disabled: boolean;
  readonly context?: ShellyArea;
  readonly allowed?: ShellyArea;
  readonly origin?: number;
}
function canvasStyle(width: number): ViewStyle {
  return { width };
}
function ZoomTools({
  zoom,
  change,
}: {
  readonly zoom: number;
  readonly change: (value: number) => void;
}): ReactNode {
  return (
    <View className="flex-row gap-2">
      <Button
        label="Zoom in"
        variant="text"
        disabled={zoom >= 4}
        onPress={() => {
          change(zoom + 1);
        }}
      />
      <Button
        label="Zoom out"
        variant="text"
        disabled={zoom <= 1}
        onPress={() => {
          change(zoom - 1);
        }}
      />
      <Button
        label="Fit"
        variant="text"
        onPress={() => {
          change(1);
        }}
      />
    </View>
  );
}
interface GridSurfaceProps {
  readonly tracks: readonly ShellyTrack[];
  readonly area: ShellyArea;
  readonly allowed: ShellyArea | undefined;
  readonly origin: number;
  readonly disabled: boolean;
  readonly change: (value: ShellyArea) => void;
  readonly tool: 'paint' | 'erase' | 'select';
  readonly cursor: GridCell;
  readonly changeCursor: (value: GridCell) => void;
  readonly zoom: number;
  readonly context: ShellyArea;
}
function GridSurface(props: GridSurfaceProps): ReactNode {
  const { setWidth, preview, viewport, shownWidth, gesture } = useGridSurface({
    area: props.area,
    allowed: props.allowed,
    disabled: props.disabled,
    change: props.change,
    tool: props.tool,
    cursor: props.changeCursor,
    zoom: props.zoom,
    context: props.context,
  });
  return (
    <View
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
      className="w-full"
    >
      <ScrollView horizontal>
        <ScrollView className="max-h-128">
          <GestureDetector gesture={gesture}>
            <View style={canvasStyle(shownWidth)}>
              <PainterCanvas
                tracks={props.tracks}
                area={props.area}
                context={props.context}
                origin={props.origin}
                preview={preview}
                cursor={props.cursor}
                width={shownWidth}
                viewport={viewport}
              />
            </View>
          </GestureDetector>
        </ScrollView>
      </ScrollView>
    </View>
  );
}
export function GridPainter(props: PainterProps): ReactNode {
  const [tool, setTool] = useState<'paint' | 'erase' | 'select'>('select');
  const [zoom, setZoom] = useState(1);
  const [keyboard, setKeyboard] = useState(false);
  const [showContext, setShowContext] = useState(true);
  const [cursor, setCursor] = useState<GridCell>({ x: 0, y: 0 });
  return (
    <View className="gap-3">
      <Segmented
        label="Grid editing tool"
        options={TOOLS}
        value={tool}
        onChange={setTool}
        disabled={props.disabled}
      />
      <ZoomTools zoom={zoom} change={setZoom} />
      {props.context === undefined ? null : (
        <SwitchRow title="Show other areas" value={showContext} onChange={setShowContext} />
      )}
      <GridSurface
        tracks={props.tracks ?? []}
        area={props.area}
        allowed={props.allowed}
        origin={props.origin ?? 8}
        disabled={props.disabled}
        change={props.change}
        tool={tool}
        cursor={cursor}
        changeCursor={setCursor}
        zoom={zoom}
        context={showContext ? (props.context ?? []) : []}
      />
      <GridLegend area={props.area} constrained={props.allowed !== undefined} />
      <PainterCursor
        cursor={cursor}
        changeCursor={setCursor}
        area={props.area}
        allowed={props.allowed}
        changeArea={props.change}
        tool={tool}
        disabled={props.disabled}
        keyboard={keyboard}
        toggleKeyboard={() => {
          setKeyboard(!keyboard);
        }}
      />
    </View>
  );
}

function GridLegend({
  area,
  constrained,
}: {
  readonly area: ShellyArea;
  readonly constrained: boolean;
}): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="caption" tone="variant">
        {String(areaCells(area))} selected cells · {String(areaCells(area) * 0.25)} m². Sensor x ← ·
        y ↓ · 0.5 m cells. Drag paints one stroke.
      </Text>
      {constrained ? (
        <Text variant="footnote" tone="variant">
          New painted cells stay within the main room. Imported numeric endpoints remain exact.
        </Text>
      ) : null}
    </View>
  );
}

function useGridSurface(input: {
  readonly area: ShellyArea;
  readonly allowed: ShellyArea | undefined;
  readonly disabled: boolean;
  readonly change: (value: ShellyArea) => void;
  readonly tool: 'paint' | 'erase' | 'select';
  readonly cursor: (value: GridCell) => void;
  readonly zoom: number;
  readonly context: ShellyArea;
}): {
  readonly setWidth: (value: number) => void;
  readonly preview: ShellyArea;
  readonly viewport: PainterViewport;
  readonly shownWidth: number;
  readonly gesture: ReturnType<typeof painterGesture>;
} {
  const { area, allowed, disabled, change, tool, cursor: changeCursor, zoom, context } = input;
  const [width, setWidth] = useState(320);
  const [preview, setPreview] = useState<ShellyArea>([]);
  const viewport = painterViewport([...area, ...context]);
  const shownWidth = width * zoom;
  const gesture = painterGesture({
    area,
    allowed,
    tool,
    width: shownWidth,
    viewport,
    disabled,
    change,
    cursor: changeCursor,
    preview: setPreview,
  });
  return { setWidth, preview, viewport, shownWidth, gesture };
}
