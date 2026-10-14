import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { TextField } from '../../components/text-field';
import { Select } from '../../components/select';

const COLORS = [
  { value: '242,180,94', label: 'Gold' },
  { value: '94,211,207', label: 'Teal' },
  { value: '169,155,255', label: 'Violet' },
  { value: '111,211,154', label: 'Green' },
  { value: '244,154,142', label: 'Rose' },
  { value: '142,174,255', label: 'Blue' },
] as const;

export function ZoneColor({
  value,
  change,
}: {
  readonly value: readonly number[] | undefined;
  readonly change: (value: readonly number[]) => void;
}): ReactNode {
  const [draft, setDraft] = useState(value?.map(String) ?? ['', '', '']);
  const selected = value === undefined ? null : value.join(',');
  const options =
    selected !== null && !COLORS.some((option) => option.value === selected)
      ? [...COLORS, { value: selected, label: 'Custom RGB color' }]
      : COLORS;
  return (
    <View className="gap-3">
      <Select
        label="Zone color"
        options={options}
        value={selected}
        onChange={(color) => {
          setDraft(color.split(','));
          change(color.split(',').map(Number));
        }}
      />
      <View className="flex-row gap-2">
        {['Red', 'Green', 'Blue'].map((label, index) => (
          <View key={label} className="flex-1">
            <TextField
              label={`${label} (0–255)`}
              kind="number"
              value={draft[index] ?? ''}
              onChange={(next) => {
                const written = draft.map((part, at) => (at === index ? next : part));
                setDraft(written);
                change(written.map((part) => (part.trim() === '' ? NaN : Number(part))));
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
