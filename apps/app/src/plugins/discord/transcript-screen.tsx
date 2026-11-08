import { usePluginScreen } from '../shared/plugin-log';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import type { TranscriptSession } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { PageHeader } from '../../components/page-header';
import { Screen } from '../../components/screen';
import { Select } from '../../components/select';
import { Text } from '../../components/text';
import { TranscriptFeed } from '../../components/transcript-feed';
import { longDate, shortClock } from '../../format/time';
import { useFeedController } from '../../queries/transcript-reader/use-feed-controller';
import { useTranscriptRemoval } from '../../queries/transcript-reader/use-transcript-removal';
import { useTranscriptSessions } from '../../queries/transcript-reader/use-transcript-sessions';
import { useSettings } from '../../store/selectors';
import { DISCORD_PLUGIN } from './discord-data';
import { background } from '@smarteverything/logging';

function TranscriptHeader(): ReactNode {
  return (
    <PageHeader
      title="Call transcripts"
      subtitle="Discord · one call at a time"
      breadcrumbs={[
        { label: 'Plugins', href: href.settings.page('plugins') },
        { label: 'Discord', href: href.pluginSettings(DISCORD_PLUGIN) },
      ]}
    />
  );
}

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

function CallFeed({
  call,
  selector,
  focusSelector,
}: {
  readonly call: TranscriptSession;
  readonly selector: ReactNode;
  readonly focusSelector: boolean;
}): ReactNode {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const feed = useFeedController({ sessionId: call.id }, useIsFocused());
  const remove = useTranscriptRemoval();
  const { time_zone: timeZone } = useSettings();
  return (
    <TranscriptFeed
      feed={feed}
      timeZone={timeZone}
      grouped
      {...(remove === undefined ? {} : { remove })}
      header={selector}
      pageHeader={<TranscriptHeader />}
      headerWidth="detail"
      inlineControls
      focusSearch={focus === 'transcript-search' && !focusSelector}
      controls={
        <Text variant="footnote" tone="variant">
          Search this call. Recognition can contain mistakes.
        </Text>
      }
    />
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
  const focusSelector = selected === call?.id;
  return (
    <Screen
      header={<TranscriptHeader />}
      maxWidth="reading"
      scroll={call === undefined}
      externalScroll={call !== undefined}
    >
      {call === undefined ? (
        <NoCall
          error={calls.error}
          loading={calls.isPending}
          retry={(): void => {
            background(calls.refetch(), 'calls.refetch_failed');
          }}
        />
      ) : (
        <CallFeed
          key={call.id}
          call={call}
          focusSelector={focusSelector}
          selector={
            <CallSelector
              calls={calls.data ?? []}
              selected={call.id}
              select={select}
              restoreFocus={focusSelector}
            />
          }
        />
      )}
    </Screen>
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
      <Screen header={<TranscriptHeader />} maxWidth="reading">
        <EmptyState
          icon="messageCircle"
          title="Transcripts unavailable"
          body="Call transcripts are written by the Discord plugin."
          action={<Button label="Discord settings" href={href.pluginSettings(DISCORD_PLUGIN)} />}
        />
      </Screen>
    );
  }
  return <Reader />;
}
