import type { ReactNode } from 'react';
import { View } from 'react-native';
import type {
  AutomationRow,
  AutomationValueContent,
  AutomationValueRow,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
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

interface ReusableLibraryButtonsProps {
  readonly row: AutomationRow | null;
  readonly onSelect: (row: AutomationRow) => void;
}

export function ReusableLibraryButtons({ row, onSelect }: ReusableLibraryButtonsProps): ReactNode {
  const library = useProgramLibrary();
  if (library === null) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Create reusable steps"
        icon="plus"
        variant="text"
        onPress={() => {
          library.reusable(null, onSelect);
        }}
      />
      {row === null ? null : (
        <Button
          label="Open reusable steps"
          variant="text"
          onPress={() => {
            library.reusable(row, onSelect);
          }}
        />
      )}
    </View>
  );
}
