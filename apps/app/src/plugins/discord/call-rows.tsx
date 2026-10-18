import type { ReactNode } from 'react';
import type { DiscordCall } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Badge, type BadgeTone } from '../../components/badge';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { count } from '../../format/number';
import { plural } from '../../format/text';
import { useLocalSearchParams } from 'expo-router';
import { DISCORD_PLUGIN } from './discord-data';

export const CALL_TRANSCRIPTS = 'call-transcripts';

export const NO_CALL_HINT =
  'It joins when an approved person enters a voice channel, or with /join.';

export function callTitle(call: DiscordCall): string {
  return `#${call.channelName ?? call.channelId}`;
}

export function callState(call: DiscordCall): { readonly label: string; readonly tone: BadgeTone } {
  if (call.muted) {
    return { label: 'Muted', tone: 'warning' };
  }
  return call.live
    ? { label: 'Talking', tone: 'positive' }
    : { label: 'Listening', tone: 'neutral' };
}

export function callDetail(call: DiscordCall): string {
  const lines = call.lines === 1 ? '1 line' : `${count(call.lines)} lines`;
  return `${plural(call.people, 'person', 'people')} in the call · ${lines} written down`;
}

function CallRow({ call }: { readonly call: DiscordCall }): ReactNode {
  const state = callState(call);
  return (
    <ListRow
      icon={call.muted ? 'micOff' : 'mic'}
      title={callTitle(call)}
      subtitle={callDetail(call)}
      trailing={<Badge label={state.label} tone={state.tone} />}
    />
  );
}

export function VoiceCalls({ calls }: { readonly calls: readonly DiscordCall[] }): ReactNode {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  return (
    <List inset title="Voice calls">
      {calls.length === 0 ? (
        <ListRow icon="mic" title="Not in a call" subtitle={NO_CALL_HINT} />
      ) : (
        calls.map((call) => <CallRow key={call.id} call={call} />)
      )}
      <ListRow
        selected={focus === CALL_TRANSCRIPTS}
        icon="messageCircle"
        title="Call transcripts"
        subtitle="Read and search an approved call’s saved transcript"
        chevron
        href={href.settings.page(`plugins/${DISCORD_PLUGIN}/transcripts`)}
      />
    </List>
  );
}
