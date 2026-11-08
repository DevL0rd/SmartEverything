import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  COMPACTION_EMBED,
  type AssistantMessageRow,
  type MessageSource,
} from '@smarteverything/domain';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { CollapseBody, CollapseRoot, TurnChevron } from '../../../components/disclosure';
import { readableText } from '@smarteverything/domain/markdown';

export type SystemEventView =
  | { readonly kind: 'compaction'; readonly summary: string }
  | { readonly kind: 'note'; readonly icon: IconName; readonly text: string };

const SOURCE_ICON: Readonly<Record<MessageSource, IconName>> = {
  app: 'sparkles',
  voice: 'phone',
  plugin: 'puzzle',
  wake: 'camera',
  subagent: 'sparkles',
  schedule: 'timer',
  chat: 'messageCircle',
  hub: 'server',
};

const COMPACTED = 'Context compacted';

export function systemEventOf(row: AssistantMessageRow): SystemEventView | null {
  for (const embed of row.embeds) {
    if (COMPACTION_EMBED.safeParse(embed).success) {
      return { kind: 'compaction', summary: row.text };
    }
  }
  if (row.role !== 'system') {
    return null;
  }
  return {
    kind: 'note',
    icon: row.origin === null ? 'sparkles' : SOURCE_ICON[row.origin.source],
    text: row.text,
  };
}

function Caption({ icon, text }: { readonly icon: IconName; readonly text: string }): ReactNode {
  return (
    <>
      <Icon name={icon} size={16} tone="faint" />
      <Text variant="caption" tone="faint" align="center" className="tabular min-w-0 shrink">
        {text}
      </Text>
    </>
  );
}

function Compaction({ summary }: { readonly summary: string }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <CollapseRoot className="my-2 w-full">
      <View className="items-center">
        <Interactive
          label={`${COMPACTED}, ${open ? 'hide' : 'show'} summary`}
          expanded={open}
          hitSlop={8}
          onPress={() => {
            setOpen(!open);
          }}
          className="h-5 max-w-full flex-row items-center gap-1.5 px-1"
          layerClassName="rounded-sm"
        >
          <Caption icon="minimize" text={COMPACTED} />
          <TurnChevron open={open} />
        </Interactive>
      </View>
      {open ? (
        <CollapseBody className="mt-0.5 px-6">
          <Text variant="footnote" tone="variant" selectable>
            {readableText(summary)}
          </Text>
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}

export function SystemEvent({ event }: { readonly event: SystemEventView }): ReactNode {
  if (event.kind === 'compaction') return <Compaction summary={event.summary} />;
  return (
    <View role="note" className="my-2 min-h-5 w-full flex-row items-center justify-center gap-1.5">
      <Caption icon={event.icon} text={event.text} />
    </View>
  );
}
