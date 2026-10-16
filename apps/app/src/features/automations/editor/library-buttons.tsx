import type { ReactNode } from 'react';
import { View } from 'react-native';
import type {
  AutomationBindingKind,
  AutomationInput,
  AutomationSequenceRow,
  AutomationValueContent,
  AutomationValueRow,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import type { Catalog } from '../data/use-automations';
import { useProgramLibrary } from './program-library-context';

interface ValueLibraryButtonsProps {
  readonly row: AutomationValueRow | null;
  readonly kind: AutomationValueContent['kind'];
  readonly lockKind?: boolean;
  readonly onSelect: (row: AutomationValueRow) => void;
}
export function ValueLibraryButtons({
  row,
  kind,
  onSelect,
  lockKind,
}: ValueLibraryButtonsProps): ReactNode {
  const library = useProgramLibrary();
  if (library === null) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Create Value"
        icon="plus"
        variant="text"
        onPress={() => {
          library.value(null, kind, onSelect, lockKind);
        }}
      />
      {row === null ? null : (
        <Button
          label="Open Value"
          variant="text"
          onPress={() => {
            library.value(row, row.content.kind, onSelect);
          }}
        />
      )}
    </View>
  );
}
interface BindingLibraryButtonsProps {
  readonly input: AutomationInput;
  readonly catalog: Catalog;
  readonly kind: AutomationBindingKind;
  readonly onChange: (input: AutomationInput) => void;
}
export function BindingLibraryButtons({
  input,
  catalog,
  kind,
  onChange,
}: BindingLibraryButtonsProps): ReactNode {
  if (kind === 'string') return null;
  const binding = input.binding;
  const row =
    binding.source === 'value'
      ? (catalog.values?.find((entry) => entry.id === binding.valueId) ?? null)
      : null;
  return (
    <ValueLibraryButtons
      row={row}
      kind={kind}
      lockKind
      onSelect={(selected) => {
        onChange({
          ...input,
          binding: { source: 'value', kind: selected.content.kind, valueId: selected.id },
        });
      }}
    />
  );
}
interface SequenceLibraryButtonsProps {
  readonly row: AutomationSequenceRow | null;
  readonly onSelect: (row: AutomationSequenceRow) => void;
}
export function SequenceLibraryButtons({ row, onSelect }: SequenceLibraryButtonsProps): ReactNode {
  const library = useProgramLibrary();
  if (library === null) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Create sequence"
        icon="plus"
        variant="text"
        onPress={() => {
          library.sequence(null, onSelect);
        }}
      />
      {row === null ? null : (
        <Button
          label="Open sequence"
          variant="text"
          onPress={() => {
            library.sequence(row, onSelect);
          }}
        />
      )}
    </View>
  );
}
