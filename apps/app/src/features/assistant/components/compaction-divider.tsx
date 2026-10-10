import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Markdown } from './markdown/markdown';

function Rule(): ReactNode {
  return <View className="h-px flex-1 bg-outline-variant" />;
}

export function CompactionDivider({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <View className="w-full gap-3">
      <View className="flex-row items-center gap-2">
        <Rule />
        <Interactive
          label={
            open ? 'Hide the summary of earlier messages' : 'Show the summary of earlier messages'
          }
          onPress={() => {
            setOpen(!open);
          }}
          className="min-h-touch-min flex-row items-center gap-1.5 rounded-full px-3"
          layerClassName="rounded-full"
        >
          <Icon name="layers" size={16} tone="variant" />
          <Text variant="footnote" tone="variant">
            Earlier messages summarized
          </Text>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} tone="variant" />
        </Interactive>
        <Rule />
      </View>
      {open ? (
        <View className="rounded-xl bg-surface-2 px-4 py-3">
          <Markdown text={row.text} />
        </View>
      ) : null}
    </View>
  );
}
