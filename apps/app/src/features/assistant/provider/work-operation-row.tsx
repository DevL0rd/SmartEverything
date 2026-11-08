import { useRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';

export interface WorkOperationSelection<T> {
  readonly operation: T;
  readonly opener?: RefObject<View | null>;
}

export function WorkOperationRow<T extends { readonly title: string }>({
  operation,
  available,
  subtitle,
  unavailableReason,
  choose,
}: {
  readonly operation: T;
  readonly available: boolean;
  readonly subtitle: string;
  readonly unavailableReason: string;
  readonly choose: (selection: WorkOperationSelection<T>) => void;
}): ReactNode {
  const opener = useRef<View>(null);
  return (
    <View>
      <ListRow
        title={operation.title}
        subtitle={subtitle}
        disabled={!available}
        pressRef={opener}
        chevron
        onPress={() => {
          choose({ operation, opener });
        }}
      />
      {available ? null : (
        <Text selectable variant="footnote" tone="variant" className="px-4 pb-3">
          {unavailableReason}
        </Text>
      )}
    </View>
  );
}
