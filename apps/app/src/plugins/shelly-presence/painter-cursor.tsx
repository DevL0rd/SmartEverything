import { useIsFocused } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { SHELLY_AREA, type ShellyArea } from '@smarteverything/shelly';
import { Text } from '../../components/text';
import { Button } from '../../components/button';
import { TextField } from '../../components/text-field';
import { useDocumentKeys } from '../../components/widget-board/edit/keys';
import { paintArea, strokeSegment, type GridCell } from './area-geometry';
import { clipStroke } from './area-context';
interface CursorProps {
  readonly cursor: GridCell;
  readonly changeCursor: (value: GridCell) => void;
  readonly area: ShellyArea;
  readonly allowed: ShellyArea | undefined;
  readonly changeArea: (value: ShellyArea) => void;
  readonly tool: 'paint' | 'erase' | 'select';
  readonly disabled: boolean;
  readonly keyboard: boolean;
  readonly toggleKeyboard: () => void;
}
function useCursorKeys(props: CursorProps, paint: () => void): void {
  const focused = useIsFocused();
  const { cursor, changeCursor, tool, disabled } = props;
  useDocumentKeys(props.keyboard && focused && !disabled, (input) => {
    if (input.typing || input.command || input.alt) return false;
    const moves: Readonly<Record<string, GridCell>> = {
      ArrowLeft: { x: cursor.x + 1, y: cursor.y },
      ArrowRight: { x: cursor.x - 1, y: cursor.y },
      ArrowUp: { x: cursor.x, y: cursor.y - 1 },
      ArrowDown: { x: cursor.x, y: cursor.y + 1 },
    };
    const next = moves[input.key];
    if (next !== undefined) {
      changeCursor(next);
      return true;
    }
    if (input.key === 'Escape') {
      props.toggleKeyboard();
      return true;
    }
    if (input.key === ' ' && tool !== 'select') {
      paint();
      return true;
    }
    return false;
  });
}
function CursorCoordinates({
  cursor,
  changeCursor,
}: {
  readonly cursor: GridCell;
  readonly changeCursor: (value: GridCell) => void;
}): ReactNode {
  const [draft, setDraft] = useState({ x: String(cursor.x), y: String(cursor.y) });
  const valid =
    draft.x.trim() !== '' &&
    draft.y.trim() !== '' &&
    SHELLY_AREA.safeParse([[Number(draft.x), Number(draft.y), 0, 0]]).success;
  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        {(['x', 'y'] as const).map((part) => (
          <View key={part} className="min-w-24 flex-1">
            <TextField
              label={`Cursor ${part}`}
              kind="number"
              value={draft[part]}
              onChange={(value) => {
                setDraft({ ...draft, [part]: value });
              }}
            />
          </View>
        ))}
      </View>
      <Button
        label="Position cursor"
        variant="text"
        disabled={!valid}
        onPress={() => {
          changeCursor({ x: Number(draft.x), y: Number(draft.y) });
        }}
      />
    </View>
  );
}
export function PainterCursor(props: CursorProps): ReactNode {
  const paint = (): void => {
    const strokes = clipStroke(
      strokeSegment(props.cursor, props.cursor),
      props.tool === 'erase' ? undefined : props.allowed,
    );
    props.changeArea(
      strokes.reduce((area, stroke) => paintArea(area, stroke, props.tool === 'erase'), props.area),
    );
  };
  useCursorKeys(props, paint);
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-end gap-2">
        <CursorCoordinates
          key={`${String(props.cursor.x)}:${String(props.cursor.y)}`}
          cursor={props.cursor}
          changeCursor={props.changeCursor}
        />
        <Button
          label={props.tool === 'erase' ? 'Erase cell' : 'Paint cell'}
          variant="tonal"
          disabled={props.disabled || props.tool === 'select'}
          onPress={paint}
        />
      </View>
      <Text variant="caption" tone="variant">
        Selected cursor x {String(props.cursor.x)} · y {String(props.cursor.y)}
      </Text>
      <Button
        label={props.keyboard ? 'Keyboard grid active · Esc to end' : 'Use keyboard grid'}
        variant="text"
        onPress={props.toggleKeyboard}
      />
    </View>
  );
}
