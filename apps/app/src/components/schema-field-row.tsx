import { useRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { ListRow } from './list-row';

export type FieldOpener = RefObject<View | null>;

export interface FieldTarget<T> {
  readonly key: T;
  readonly opener: FieldOpener;
  readonly onSave?: () => void;
}

export function FieldRow<T extends string | number>({
  field,
  title,
  subtitle,
  choose,
  omit,
}: {
  readonly field: T;
  readonly title: string;
  readonly subtitle: string;
  readonly choose: (target: FieldTarget<T>) => void;
  readonly omit: ReactNode;
}): ReactNode {
  const opener = useRef<View>(null);
  return (
    <View>
      <ListRow
        title={title}
        subtitle={subtitle}
        chevron
        pressRef={opener}
        onPress={() => {
          choose({ key: field, opener });
        }}
      />
      {omit}
    </View>
  );
}
