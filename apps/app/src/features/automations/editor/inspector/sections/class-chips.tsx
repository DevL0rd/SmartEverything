import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { CATCHABLE_ERROR_CLASS } from '@smarteverything/domain';
import type { z } from 'zod';
import { Interactive } from '../../../../../components/interactive';
import { Text } from '../../../../../components/text';
import { cn } from '../../../../../design/cn';
import { CATCH_CLASSES, toggledClass } from './catch-model';

type CatchableClass = z.infer<typeof CATCHABLE_ERROR_CLASS>;

export interface ClassChipsProps {
  readonly label: string;
  readonly classes: readonly CatchableClass[];
  readonly disabled: boolean;
  readonly onChange: (classes: readonly CatchableClass[]) => void;
}

export function ClassChips({ label, classes, disabled, onChange }: ClassChipsProps): ReactNode {
  return (
    <View accessibilityLabel={label} className="flex-row flex-wrap gap-2">
      {CATCH_CLASSES.map((entry) => {
        const selected = classes.includes(entry.value);
        return (
          <Interactive
            key={entry.value}
            label={entry.label}
            role="checkbox"
            checked={selected}
            disabled={disabled}
            onPress={() => {
              onChange(toggledClass(classes, entry.value));
            }}
            className={cn(
              'min-h-touch-min justify-center rounded-full border-hairline px-3',
              selected
                ? 'border-primary bg-primary-container'
                : 'border-outline-variant bg-surface-1',
            )}
            layerClassName="rounded-full"
          >
            <Text variant="label" tone={selected ? 'primary' : 'default'}>
              {entry.label}
            </Text>
          </Interactive>
        );
      })}
    </View>
  );
}
