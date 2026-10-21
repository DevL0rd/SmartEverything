import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import type { PrimaryAction } from './library-model';

export function LibraryBack({
  title,
  onBack,
  children,
  footer,
}: {
  readonly title: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}): ReactNode {
  return (
    <View className="min-h-0 flex-1">
      <View className="flex-row items-center gap-1 border-b border-outline-variant px-2">
        <IconButton icon="chevronLeft" label="Back" onPress={onBack} />
        <Text variant="body-strong">{title}</Text>
      </View>
      {children}
      {footer}
    </View>
  );
}

export function SelectionBar({
  name,
  source,
  action,
  onDetails,
}: {
  readonly name: string;
  readonly source: string;
  readonly action: PrimaryAction | null;
  readonly onDetails: () => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-2 border-t border-outline-variant p-3">
      <Interactive
        label={`Details of ${name}`}
        onPress={onDetails}
        className="min-h-touch-min min-w-0 flex-1 justify-center rounded-md px-2"
        layerClassName="rounded-md"
      >
        <Text variant="callout" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {source}
        </Text>
      </Interactive>
      {action === null ? null : (
        <Button
          label={action.label}
          disabled={action.run === null}
          {...(action.run === null ? {} : { onPress: action.run })}
        />
      )}
    </View>
  );
}
