import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  TOOLS_CHANGED_EMBED,
  type AssistantMessageRow,
  type ToolsChangedEmbed,
} from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';

export function toolsChangeOf(row: AssistantMessageRow): ToolsChangedEmbed | null {
  for (const embed of row.embeds) {
    const parsed = TOOLS_CHANGED_EMBED.safeParse(embed);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

function NameList({
  title,
  names,
}: {
  readonly title: string;
  readonly names: readonly string[];
}): ReactNode {
  if (names.length === 0) {
    return null;
  }
  return (
    <View className="gap-0.5">
      <Text variant="caption" tone="variant">
        {title}
      </Text>
      <Text variant="footnote" selectable>
        {names.join(', ')}
      </Text>
    </View>
  );
}

export function ToolsNotice({ change }: { readonly change: ToolsChangedEmbed }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <View className="w-full items-center gap-2">
      <Interactive
        label={open ? 'Hide which tools changed' : 'Show which tools changed'}
        onPress={() => {
          setOpen(!open);
        }}
        className="min-h-touch-min flex-row items-center gap-1.5 rounded-full px-3"
        layerClassName="rounded-full"
      >
        <Icon name="wrench" size={16} tone="variant" />
        <Text variant="footnote" tone="variant">
          Tools updated
        </Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} tone="variant" />
      </Interactive>
      {open ? (
        <View className="w-full gap-2 rounded-xl bg-surface-2 px-4 py-3">
          <NameList title={`Added (${String(change.added.length)})`} names={change.added} />
          <NameList title={`Removed (${String(change.removed.length)})`} names={change.removed} />
        </View>
      ) : null}
    </View>
  );
}
