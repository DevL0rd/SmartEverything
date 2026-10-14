import type { ReactNode } from 'react';
import { View } from 'react-native';
import { JSON_VALUE, type CodexProviderEvent } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { ProviderResult } from './provider-result';
type Kind = CodexProviderEvent['kind'];
function isKind<K extends Kind>(
  event: CodexProviderEvent,
  kind: K,
): event is Extract<CodexProviderEvent, { kind: K }> {
  return event.kind === kind;
}
function render<K extends Kind>(
  kind: K,
  view: (event: Extract<CodexProviderEvent, { kind: K }>) => ReactNode,
): (event: CodexProviderEvent) => ReactNode {
  return (event): ReactNode => (isKind(event, kind) ? view(event) : null);
}
const EVENTS: Readonly<Record<Kind, (event: CodexProviderEvent) => ReactNode>> = {
  accepted: render('accepted', (event) => (
    <Text selectable tone="variant">
      Session {event.session_id}
    </Text>
  )),
  text: render('text', (event) => <Text selectable>{event.delta}</Text>),
  thinking: render('thinking', (event) => (
    <View className="gap-1">
      <Text variant="label" tone="variant">
        Published reasoning summary
      </Text>
      <Text selectable tone="variant">
        {event.delta}
      </Text>
    </View>
  )),
  context: render('context', (event) => (
    <ProviderResult title="Execution on computer" value={JSON_VALUE.parse(event.context)} />
  )),
  lifecycle: render('lifecycle', (event) => (
    <Text tone={event.state === 'failed' ? 'critical' : 'variant'}>
      {event.state}
      {event.reason === null ? '' : ` · ${event.reason}`}
    </Text>
  )),
  usage: render('usage', (event) => (
    <ProviderResult title="Usage reported by Codex" value={event.usage} />
  )),
  rate_limit: render('rate_limit', (event) => (
    <Text tone={event.status === 'rejected' ? 'critical' : 'variant'}>
      {event.detail}
      {event.resets_at === null ? '' : ` · resets ${new Date(event.resets_at).toLocaleString()}`}
    </Text>
  )),
  tool_call: render('tool_call', (event) => (
    <ProviderResult title={`Tool · ${event.name} · ${event.origin}`} value={event.input} />
  )),
  tool_result: render('tool_result', (event) => (
    <View className="gap-1">
      <Text variant="label" tone={event.failed ? 'critical' : 'variant'}>
        {event.failed ? 'Tool failed' : 'Tool result'} · {event.origin}
      </Text>
      <Text selectable>{event.text}</Text>
    </View>
  )),
  work_item: render('work_item', (event) => (
    <ProviderResult title={`Native work · ${event.type}`} value={event.payload} />
  )),
  unsupported_item: render('unsupported_item', (event) => (
    <View className="gap-1">
      <Text tone="warning">
        Unsupported native item · {event.type}
        {event.truncated ? ' · truncated' : ''}
      </Text>
      <Text selectable>{event.summary}</Text>
    </View>
  )),
  prompt: render('prompt', (event) => (
    <Text tone="warning">{event.prompt.title} · review in Permissions and questions.</Text>
  )),
  prompt_resolved: render('prompt_resolved', (event) => (
    <Text tone="variant">Request resolved · {event.prompt_id}</Text>
  )),
  agent: render('agent', (event) => (
    <Text>
      {event.run.title} · {event.run.state} · view in Agents.
    </Text>
  )),
  completed: render('completed', (event) => (
    <Text tone="variant">{event.interrupted ? 'Interrupted' : 'Completed'}</Text>
  )),
  failed: render('failed', (event) => (
    <Text selectable tone="critical">
      {event.code}: {event.message}
    </Text>
  )),
};
export function CodexProviderEvents({
  events,
}: {
  readonly events: readonly CodexProviderEvent[];
}): ReactNode {
  return (
    <View className="gap-section-gap">
      {events.length === 0 ? (
        <Text tone="variant">No native events yet.</Text>
      ) : (
        events.map((event) => (
          <View key={`${event.job_id}-${String(event.seq)}`}>{EVENTS[event.kind](event)}</View>
        ))
      )}
    </View>
  );
}
