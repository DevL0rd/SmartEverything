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
import { Markdown } from './markdown/markdown';
import { Overline } from './overline';

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
};

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

function Panel({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="w-full gap-2 rounded-xl bg-surface-2 px-4 py-3">{children}</View>;
}

function EventBody({ event }: { readonly event: SystemEventView }): ReactNode {
  if (event.kind === 'compaction') {
    return (
      <Panel>
        <Overline>Summary</Overline>
        <Markdown text={event.summary} />
      </Panel>
    );
  }
  return null;
}

function labelOf(event: SystemEventView): string {
  switch (event.kind) {
    case 'compaction':
      return 'Earlier messages summarized';
    case 'note':
      return event.text;
  }
}

function iconOf(event: SystemEventView): IconName {
  switch (event.kind) {
    case 'compaction':
      return 'layers';
    case 'note':
      return event.icon;
  }
}

function Rule(): ReactNode {
  return <View className="h-px flex-1 bg-outline-variant" />;
}

function EventLine({
  event,
  open,
  onToggle,
}: {
  readonly event: SystemEventView;
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  const expandable = event.kind !== 'note';
  const label = labelOf(event);
  const content = (
    <>
      <Icon name={iconOf(event)} size={16} tone="variant" />
      <Text variant="footnote" tone="variant" className="shrink">
        {label}
      </Text>
      {expandable ? <TurnChevron open={open} /> : null}
    </>
  );
  return (
    <View className="w-full flex-row items-center gap-2">
      {event.kind === 'compaction' ? <Rule /> : <View className="flex-1" />}
      {expandable ? (
        <Interactive
          label={`${label}, ${open ? 'hide' : 'show'} details`}
          checked={open}
          onPress={onToggle}
          className="min-h-touch-min max-w-full flex-row items-center gap-1.5 rounded-full px-3"
          layerClassName="rounded-full"
        >
          {content}
        </Interactive>
      ) : (
        <View
          role="note"
          className="min-h-8 max-w-full flex-row items-center gap-1.5 rounded-full px-3"
        >
          {content}
        </View>
      )}
      {event.kind === 'compaction' ? <Rule /> : <View className="flex-1" />}
    </View>
  );
}

export function SystemEvent({ event }: { readonly event: SystemEventView }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <CollapseRoot className="w-full items-center gap-2">
      <EventLine
        event={event}
        open={open}
        onToggle={() => {
          setOpen(!open);
        }}
      />
      {open ? (
        <CollapseBody className="w-full">
          <EventBody event={event} />
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}
