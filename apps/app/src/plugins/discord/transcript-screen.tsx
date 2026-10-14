import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TranscriptHit } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { confirm } from '../../components/confirm-store';
import { EmptyState } from '../../components/empty-state';
import { PageHeader } from '../../components/page-header';
import { Screen } from '../../components/screen';
import { Select } from '../../components/select';
import { Text } from '../../components/text';
import { notify } from '../../components/toast-store';
import { TranscriptFeed, TRANSCRIPT_READER_PREFIX } from '../../components/transcript-feed';
import { longDate, shortClock } from '../../format/time';
import { useFeedController } from '../../queries/transcript-reader/use-feed-controller';
import {
  clearTranscriptScope,
  useTranscriptAccess,
} from '../../queries/transcript-reader/reader-access';
import { useIsOwner, useRow, useSettings } from '../../store/selectors';
import { DISCORD_PLUGIN } from './discord-data';
import {
  deleteDiscordTranscript,
  discordTranscriptPort,
  DISCORD_CALLS_KEY,
  readDiscordCalls,
  type TranscriptCall,
} from './transcript-data';

function useRemoveCall(): (hit: TranscriptHit) => void {
  const client = useQueryClient();
  return (hit): void => {
    void (async (): Promise<void> => {
      const accepted = await confirm({
        title: 'Delete this call transcript?',
        body: `All lines in “${hit.session.title}” are removed for good.`,
        confirmLabel: 'Delete',
        tone: 'destructive',
      });
      if (!accepted) return;
      try {
        await deleteDiscordTranscript(hit.session.id);
        await client.invalidateQueries({ queryKey: DISCORD_CALLS_KEY });
        await client.invalidateQueries({
          queryKey: TRANSCRIPT_READER_PREFIX,
          predicate: (query) =>
            query.queryKey[2] === 'plugin' && query.queryKey[3] === DISCORD_PLUGIN,
        });
      } catch (error) {
        notify({ message: 'The call transcript wasn’t deleted', error, tone: 'critical' });
      }
    })();
  };
}

function CallFeed({
  call,
  selector,
}: {
  readonly call: TranscriptCall;
  readonly selector: ReactNode;
}): ReactNode {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const port = discordTranscriptPort(call.callId);
  const focused = useIsFocused();
  const feed = useFeedController(port, focused);
  const remove = useRemoveCall();
  const { time_zone: timeZone } = useSettings();
  return (
    <TranscriptFeed
      feed={feed}
      timeZone={timeZone}
      header={selector}
      pageHeader={<TranscriptHeader />}
      maxWidth="detail"
      {...(call.live ? {} : { remove })}
      focusSearch={focus === 'transcript-search'}
      controls={
        <Text variant="footnote" tone="variant">
          Search this call. Recognition can contain mistakes.
        </Text>
      }
    />
  );
}

function TranscriptHeader(): ReactNode {
  return (
    <PageHeader
      title="Call transcripts"
      subtitle="Discord · one approved call at a time"
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
}: {
  readonly calls: readonly TranscriptCall[];
  readonly selected: string | null;
  readonly select: (id: string) => void;
}): ReactNode {
  const { time_zone: timeZone } = useSettings();
  return (
    <View className="gap-2">
      <Select
        label="Call"
        value={selected}
        onChange={select}
        searchable
        options={calls.map((item) => ({
          value: item.callId,
          label: `#${item.channelName ?? item.channelId} · ${shortClock(item.startedAt, timeZone)}`,
          description: `${longDate(item.startedAt, timeZone)} · ${item.live ? 'Active call' : 'Finished'} · ${String(item.lines)} lines`,
        }))}
      />
      <Text variant="footnote" tone="variant">
        Approved calls among the 200 most recent. Voice and retention controls are in Discord
        settings.
      </Text>
    </View>
  );
}

function MissingCall({
  error,
  loading,
  selected,
  retry,
}: {
  readonly error: Error | null;
  readonly loading: boolean;
  readonly selected: string | null;
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
      title={selected === null ? 'No saved calls yet' : 'This call is no longer available'}
      body="Only calls in approved Discord servers are available here."
    />
  );
}

function Reader(): ReactNode {
  const focused = useIsFocused();
  const calls = useQuery({
    queryKey: DISCORD_CALLS_KEY,
    queryFn: readDiscordCalls,
    enabled: focused,
    gcTime: 0,
    retry: false,
  });
  const retired = useTranscriptAccess({ source: 'plugin', scope: DISCORD_PLUGIN }, calls.error);
  const visibleCalls = retired ? undefined : calls.data;
  const [selected, select] = useState<string | null>(null);
  const call =
    selected === null ? visibleCalls?.[0] : visibleCalls?.find((item) => item.callId === selected);
  const selector = (
    <CallSelector calls={visibleCalls ?? []} selected={call?.callId ?? null} select={select} />
  );
  return (
    <Screen
      header={<TranscriptHeader />}
      scroll={call === undefined}
      externalScroll={call !== undefined}
    >
      {call === undefined ? (
        <>
          <MissingCall
            error={calls.error}
            loading={calls.isPending}
            selected={selected}
            retry={(): void => {
              void calls.refetch();
            }}
          />
          {selector}
          {selected === null ? null : (
            <Button
              label="Choose a recent call"
              onPress={(): void => {
                select(null);
              }}
            />
          )}
        </>
      ) : (
        <CallFeed key={call.callId} call={call} selector={selector} />
      )}
    </Screen>
  );
}

function useReaderAvailability(available: boolean): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!available) clearTranscriptScope(client, { source: 'plugin', scope: DISCORD_PLUGIN });
  }, [client, available]);
}

export function DiscordTranscriptScreen({
  pluginId,
}: {
  readonly pluginId: string | undefined;
}): ReactNode {
  const owner = useIsOwner();
  const plugin = useRow('plugins', DISCORD_PLUGIN);
  const available =
    owner &&
    plugin !== null &&
    plugin.enabled &&
    plugin.status === 'running' &&
    plugin.tool_switches['voice'] !== false;
  useReaderAvailability(available);
  if (pluginId !== DISCORD_PLUGIN || !available) {
    return (
      <Screen header={<TranscriptHeader />}>
        <EmptyState
          icon="messageCircle"
          title="Discord transcripts unavailable"
          body="Use the owner’s profile and keep the Discord plugin and its Voice tool enabled to read its approved calls."
          action={<Button label="Discord settings" href={href.pluginSettings(DISCORD_PLUGIN)} />}
        />
      </Screen>
    );
  }
  return <Reader />;
}
