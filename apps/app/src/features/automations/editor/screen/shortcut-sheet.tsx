import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import { SHORTCUT_GROUPS } from './editor-keys';

export function ShortcutSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title="Shortcuts" label="Keyboard shortcuts">
      <View className="gap-4 px-4 pb-4">
        {SHORTCUT_GROUPS.map((group) => (
          <View key={group.title} className="gap-1" role="group" aria-label={group.title}>
            <Text variant="label" tone="variant">
              {group.title}
            </Text>
            {group.rows.map((row) => (
              <View key={row.keys} className="min-h-8 flex-row items-center justify-between gap-4">
                <Text variant="body" className="min-w-0 shrink flex-1">
                  {row.action}
                </Text>
                <View className="shrink-0 rounded-xs bg-surface-3 px-2 py-0.5">
                  <Text variant="caption">{row.keys}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </Sheet>
  );
}
