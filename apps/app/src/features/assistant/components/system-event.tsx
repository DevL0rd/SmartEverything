import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  COMPACTION_EMBED,
  TOOLS_CHANGED_EMBED,
  type AssistantMessageRow,
  type MessageSource,
  type ToolsChangedEmbed,
} from '@smarteverything/domain';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useStoreSelector } from '../../../store/store-context';
import { toolDisplayName } from '../model/tool-names';
import { CollapseBody, CollapseRoot, TurnChevron } from './disclosure';
import { Markdown } from './markdown/markdown';
import { Overline } from './overline';

export type SystemEventView =
  | { readonly kind: 'compaction'; readonly summary: string }
  | { readonly kind: 'tools'; readonly change: ToolsChangedEmbed }
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
    const tools = TOOLS_CHANGED_EMBED.safeParse(embed);
    if (tools.success) {
      return { kind: 'tools', change: tools.data };
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

function toolsLine(change: ToolsChangedEmbed): string {
  const parts = [
    change.added.length === 0 ? null : `${String(change.added.length)} added`,
    change.removed.length === 0 ? null : `${String(change.removed.length)} removed`,
  ].filter((part) => part !== null);
  return parts.length === 0 ? 'Tools changed' : `Tools changed · ${parts.join(', ')}`;
}

function NameList({
  title,
  names,
}: {
  readonly title: string;
  readonly names: readonly string[];
}): ReactNode {
  const plugins = useStoreSelector((state) => state.tables.plugins.byId, Object.is);
  if (names.length === 0) {
    return null;
  }
  return (
    <View className="gap-1">
      <Overline>{`${title} · ${String(names.length)}`}</Overline>
      {names.map((name) => (
        <Text key={name} variant="callout" selectable>
          {toolDisplayName(name, (id) => plugins[id]?.manifest.name ?? null)}
        </Text>
      ))}
    </View>
  );
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
  if (event.kind === 'tools') {
    return (
      <Panel>
        <NameList title="Added" names={event.change.added} />
        <NameList title="Removed" names={event.change.removed} />
      </Panel>
    );
  }
  return null;
}

function labelOf(event: SystemEventView): string {
  switch (event.kind) {
    case 'compaction':
      return 'Earlier messages summarized';
    case 'tools':
      return toolsLine(event.change);
    case 'note':
      return event.text;
  }
}

function iconOf(event: SystemEventView): IconName {
  switch (event.kind) {
    case 'compaction':
      return 'layers';
    case 'tools':
      return 'wrench';
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
