import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Select, type SelectOption } from '../../../../components/select';
import { Switch } from '../../../../components/switch';
import { Text } from '../../../../components/text';
import type { UnifiedMaterial } from '../model/unified-map';
import type { RoomEdit } from './room-edits';

export interface FloorRow {
  readonly name: string;
  readonly floor: number;
  readonly floorLabel: string;
  readonly hidden: boolean;
}

export interface MaterialChoice {
  readonly options: readonly SelectOption<string>[];
  readonly value: string;
  readonly placeholder: string;
}

export const FLOOR_OPTIONS: readonly SelectOption<string>[] = [
  { value: '0', label: 'Not set' },
  { value: '4000', label: 'Ceramic tile' },
  { value: '4010', label: 'Wood floor' },
  { value: '4011', label: 'Horizontal wood floor' },
  { value: '4020', label: 'Cobblestone' },
  { value: '4030', label: 'Marble' },
];

export const MAP_FLOOR_OPTIONS: readonly SelectOption<string>[] = FLOOR_OPTIONS.filter(
  (option) => option.value !== '0',
);

export function floorLabel(floor: number): string {
  return (
    FLOOR_OPTIONS.find((option) => option.value === String(floor))?.label ??
    `Floor ${String(floor)}`
  );
}

export function floorLine(floor: number): string {
  return floor === 0 ? 'Floor type not set' : floorLabel(floor);
}

export function floorEdit(value: string): RoomEdit {
  return { floor: Number(value) };
}

export function materialChoice(row: FloorRow, material: UnifiedMaterial | null): MaterialChoice {
  if (material === null) {
    return { options: FLOOR_OPTIONS, value: String(row.floor), placeholder: row.floorLabel };
  }
  return {
    options: MAP_FLOOR_OPTIONS,
    value: material.code === null ? '' : String(material.code),
    placeholder: material.label,
  };
}

export function RoomEditor({
  row,
  material,
  disabled,
  onEdit,
}: {
  readonly row: FloorRow;
  readonly material: UnifiedMaterial | null;
  readonly disabled: boolean;
  readonly onEdit: (edit: RoomEdit) => void;
}): ReactNode {
  const choice = materialChoice(row, material);
  return (
    <View className="gap-3">
      <Select
        label={material === null ? 'Floor material' : 'Floor material on the home map'}
        options={choice.options}
        value={choice.value}
        placeholder={choice.placeholder}
        disabled={disabled}
        onChange={(value) => {
          onEdit(floorEdit(value));
        }}
      />
      <View className="min-h-touch-min flex-row items-center justify-between gap-3">
        <Text variant="body" className="flex-1">
          Hide on the map
        </Text>
        <Switch
          label={`Hide ${row.name} on the map`}
          value={row.hidden}
          disabled={disabled}
          onChange={(hidden) => {
            onEdit({ hidden });
          }}
        />
      </View>
    </View>
  );
}
