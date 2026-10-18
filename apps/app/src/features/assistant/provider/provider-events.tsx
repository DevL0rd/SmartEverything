import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ProviderEvent } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { ProviderResult } from './provider-result';
import { dateTimeText } from '../../../format/locale';

function UsageEvent({
  event,
}: {
  readonly event: Extract<ProviderEvent, { kind: 'usage' | 'rate_limit' }>;
}): ReactNode {
  if (event.kind === 'usage')
    return (
      <ProviderResult
        title="Usage reported by Claude"
        value={{
          input_tokens: event.input_tokens,
          output_tokens: event.output_tokens,
          cache_read_tokens: event.cache_read_tokens,
          cache_write_tokens: event.cache_write_tokens,
          cost_usd: event.cost_usd,
        }}
      />
    );
  return (
    <Text tone={event.status === 'rejected' ? 'critical' : 'variant'}>
      {event.detail}
      {event.resets_at === null ? '' : ` · resets ${dateTimeText(new Date(event.resets_at))}`}
    </Text>
  );
}
function ToolEvent({
  event,
}: {
  readonly event: Extract<ProviderEvent, { kind: 'tool_call' | 'tool_result' }>;
}): ReactNode {
  if (event.kind === 'tool_call')
    return <ProviderResult title={`Tool · ${event.name}`} value={event.input} />;
  return (
    <View className="gap-1">
      <Text variant="label" tone={event.failed ? 'critical' : 'variant'}>
        {event.failed ? 'Tool failed' : 'Tool result'} · {event.call_id}
      </Text>
      <Text selectable>{event.text}</Text>
    </View>
  );
}
function NativeEvent({ event }: { readonly event: ProviderEvent }): ReactNode {
  if (event.kind === 'usage' || event.kind === 'rate_limit') return <UsageEvent event={event} />;
  if (event.kind === 'tool_call' || event.kind === 'tool_result')
    return <ToolEvent event={event} />;
  return <MainEvent event={event} />;
}
function MainEvent({
  event,
}: {
  readonly event: Exclude<
    ProviderEvent,
    { kind: 'usage' | 'rate_limit' | 'tool_call' | 'tool_result' }
  >;
}): ReactNode {
  switch (event.kind) {
    case 'text':
      return <Text selectable>{event.delta}</Text>;
    case 'thinking':
      return (
        <View className="gap-1">
          <Text variant="label" tone="variant">
            Thinking
          </Text>
          <Text selectable tone="variant">
            {event.delta}
          </Text>
        </View>
      );
    case 'runtime':
      return <ProviderResult title={event.type.replaceAll('_', ' ')} value={event.payload} />;
    case 'failed':
      return (
        <Text tone="critical">
          {event.code}: {event.message}
        </Text>
      );
    case 'dialog':
      return <ProviderResult title={`Dialog · ${event.dialog_kind}`} value={event.request} />;
    case 'prompt':
      return (
        <Text tone="variant">Permission or question · review in Permissions and questions.</Text>
      );
    case 'accepted':
      return <Text tone="variant">Session {event.session_id}</Text>;
    case 'completed':
      return <Text tone="variant">{event.interrupted ? 'Interrupted' : 'Completed'}</Text>;
  }
}
export function ProviderEvents({
  events,
}: {
  readonly events: readonly ProviderEvent[];
}): ReactNode {
  return (
    <View className="gap-section-gap">
      {events.length === 0 ? (
        <Text tone="variant">No native events yet.</Text>
      ) : (
        events.map((event) => (
          <NativeEvent key={`${event.job_id}-${String(event.seq)}`} event={event} />
        ))
      )}
    </View>
  );
}
