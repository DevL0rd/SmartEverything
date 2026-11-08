import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FlatChoice } from '../../../../../components/flat-choice';
import { CATCH_CLASSES, toggledClass, type CatchableClass } from './class-chips-model';

export interface ClassChipsProps {
  readonly label: string;
  readonly classes: readonly CatchableClass[];
  readonly disabled: boolean;
  readonly onChange: (classes: readonly CatchableClass[]) => void;
}

export function ClassChips({ label, classes, disabled, onChange }: ClassChipsProps): ReactNode {
  return (
    <View accessibilityLabel={label} className="flex-row flex-wrap">
      {CATCH_CLASSES.map((entry) => {
        const selected = classes.includes(entry.value);
        return (
          <FlatChoice
            key={entry.value}
            label={entry.label}
            role="checkbox"
            active={selected}
            disabled={disabled}
            onPress={() => {
              onChange(toggledClass(classes, entry.value));
            }}
          />
        );
      })}
    </View>
  );
}
