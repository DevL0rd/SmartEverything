import { usePluginScreen } from '../shared/plugin-log';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import type { TranscriptSession } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { Select } from '../../components/select';
import { Text } from '../../components/text';
import { TranscriptFeed } from '../../components/transcript-feed';
import { longDate, shortClock } from '../../format/time';
import { useFeedController } from '../../queries/transcript-reader/use-feed-controller';
import { useTranscriptRemoval } from '../../queries/transcript-reader/use-transcript-removal';
import { useTranscriptSessions } from '../../queries/transcript-reader/use-transcript-sessions';
import { SettingsFrame } from '../../settings/settings-frame';
import { useSettings } from '../../store/selectors';
import { DISCORD_PLUGIN } from './discord-data';
import { background } from '@smarteverything/logging';

const TRANSCRIPT_SHELL = {
  page: 'plugins',
  title: 'Call transcripts',
  detail: true,
  trail: [{ label: 'Discord', href: href.pluginSettings(DISCORD_PLUGIN) }],
} as const;

function CallSelector({
  calls,
  selected,
  select,
  restoreFocus,
}: {
  readonly calls: readonly TranscriptSession[];
  readonly selected: string | null;
  readonly select: (id: string) => void;
  readonly restoreFocus: boolean;
}): ReactNode {
  const { time_zone: timeZone } = useSettings();
  return (
    <View className="gap-2">
      <Select
        label="Call"
        focusOnMount={restoreFocus}
        value={selected}
        onChange={select}
        searchable
        options={calls.map((item) => ({
          value: item.id,
          label: `${item.title} · ${shortClock(item.started_at, timeZone)}`,
          description: `${longDate(item.started_at, timeZone)} · ${item.ended_at === null ? 'Active call' : 'Finished'} · ${String(item.line_count)} lines`,
        }))}
      />
      <Text variant="footnote" tone="variant">
        The 200 most recent calls. Voice and retention controls are in Discord settings.
      </Text>
    </View>
  );
}

const MISTAKES_NOTE = (
  <Text variant="footnote" tone="variant">
    Recognition can contain mistakes.
  </Text>
);

function CallPage({
  call,
  calls,
  select,
  focusSelector,
}: {
  readonly call: TranscriptSession;
  readonly calls: readonly TranscriptSession[];
  readonly select: (id: string) => void;
  readonly focusSelector: boolean;
}): ReactNode {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const feed = useFeedController({ sessionId: call.id }, useIsFocused());
  const remove = useTranscriptRemoval();
  const { time_zone: timeZone } = useSettings();
  return (
    <SettingsFrame
      {...TRANSCRIPT_SHELL}
      scroll={false}
      search={{
        value: feed.words,
        onChange: feed.changeWords,
        placeholder: 'Search this call',
        label: 'Search this call',
        focusOnMount: focus === 'transcript-search' && !focusSelector,
      }}
    >
      <View className="-mx-gutter min-h-0 flex-1">
        <TranscriptFeed
          feed={feed}
          timeZone={timeZone}
          grouped
          {...(remove === undefined ? {} : { remove })}
          header={
            <CallSelector
              calls={calls}
              selected={call.id}
              select={select}
              restoreFocus={focusSelector}
            />
          }
          inlineControls
          shellSearch
          controls={MISTAKES_NOTE}
        />
      </View>
    </SettingsFrame>
  );
}

function NoCall({
  error,
  loading,
  retry,
}: {
  readonly error: Error | null;
  readonly loading: boolean;
  readonly retry: () => void;
}): ReactNode {
  if (error !== null)
    return (
      <Banner
        tone="critical"
        title="Call transcripts couldn’t load"
        body={error.message}
        wrapBody
        action={{ label: 'Retry', onPress: retry }}
      />
    );
  if (loading)
    return (
      <Text variant="body" tone="variant">
        Loading calls…
      </Text>
    );
  return (
    <EmptyState
      icon="messageCircle"
      title="No saved calls yet"
      body="Calls the Discord bot joins are written down here."
    />
  );
}

function Reader(): ReactNode {
  const calls = useTranscriptSessions('plugin', DISCORD_PLUGIN, useIsFocused());
  const [selected, select] = useState<string | null>(null);
  const call = calls.data?.find((item) => item.id === selected) ?? calls.data?.[0];
  if (call === undefined) {
    return (
      <SettingsFrame {...TRANSCRIPT_SHELL}>
        <NoCall
          error={calls.error}
          loading={calls.isPending}
          retry={(): void => {
            background(calls.refetch(), 'calls.refetch_failed');
          }}
        />
      </SettingsFrame>
    );
  }
  return (
    <CallPage
      key={call.id}
      call={call}
      calls={calls.data ?? []}
      select={select}
      focusSelector={selected === call.id}
    />
  );
}

export function DiscordTranscriptScreen({
  pluginId,
}: {
  readonly pluginId: string | undefined;
}): ReactNode {
  usePluginScreen('discord', 'DiscordTranscriptScreen');
  if (pluginId !== DISCORD_PLUGIN) {
    return (
      <SettingsFrame {...TRANSCRIPT_SHELL}>
        <EmptyState
          icon="messageCircle"
          title="Transcripts unavailable"
          body="Call transcripts are written by the Discord plugin."
          action={<Button label="Discord settings" href={href.pluginSettings(DISCORD_PLUGIN)} />}
        />
      </SettingsFrame>
    );
  }
  return <Reader />;
}
