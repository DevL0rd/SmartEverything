import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { StatusTone } from '../../../components/tone';
import { TypingDots } from '../components/typing-dots';
import type { ChatEntry, FailedChatLine, PreviewChatLine } from './chat-entry';
import type { RowLine } from './row-status';

export interface Status {
  readonly tone: StatusTone;
  readonly label: string;
}

export function statusOf(line: RowLine): Status | null {
  if (line.kind === 'needs') {
    return { tone: 'warning', label: 'Needs you' };
  }
  if (line.kind === 'working') {
    return { tone: 'info', label: 'Running' };
  }
  if (line.kind === 'failed') {
    return { tone: 'critical', label: line.sent ? 'Reply failed' : 'Not sent' };
  }
  return null;
}

function requestsText(count: number): string {
  return `${String(count)} ${count === 1 ? 'request' : 'requests'}`;
}

function stateWordOf(line: RowLine): string {
  switch (line.kind) {
    case 'preview':
      return `${line.speaker === null ? '' : `${line.speaker}: `}${line.text}`;
    case 'needs':
      return `Needs you, ${requestsText(line.count)}`;
    case 'working':
      return 'Working';
    case 'failed':
      return `Failed, ${line.reason}`;
    case 'waiting':
      return `Waiting for connection, ${String(line.count)}`;
    case 'queued':
      return `Queued, ${String(line.count)}`;
    case 'empty':
    case 'archived':
      return '';
  }
}

export function a11yLabelOf(entry: ChatEntry, line: RowLine, agent: boolean): string {
  const unread = entry.unread > 0 ? `${String(entry.unread)} unread` : '';
  return [
    entry.title,
    agent ? 'agent' : entry.source.label,
    entry.pinned ? 'Pinned' : '',
    entry.desktop === undefined ? '' : `Desktop session on ${entry.desktop.deviceName}`,
    unread,
    stateWordOf(line),
  ]
    .filter((part) => part !== '')
    .join(', ');
}

function NeedsLine({ count }: { readonly count: number }): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
      <Icon name="warning" size={16} tone="warning" />
      <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
        {`Needs you · ${requestsText(count)}`}
      </Text>
    </View>
  );
}

function WorkingLine({ step }: { readonly step: string | null }): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      <Text variant="footnote" tone="primary" numberOfLines={1} className="shrink">
        {step === null ? 'Working' : `Working · ${step}`}
      </Text>
      <TypingDots tone="primary" />
    </View>
  );
}

function FailedLine({ line }: { readonly line: FailedChatLine }): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
      <Icon name="alert" size={16} tone="critical" />
      <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
        {`${line.sent ? 'Reply failed' : 'Not sent'} · ${line.reason}`}
      </Text>
    </View>
  );
}

function PlainLine({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
      {text}
    </Text>
  );
}

function WaitingLine({ count }: { readonly count: number }): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
      <Icon name="clock" size={16} tone="variant" />
      <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
        {`Waiting for connection · ${String(count)}`}
      </Text>
    </View>
  );
}

function PreviewLine({
  entry,
  line,
}: {
  readonly entry: ChatEntry;
  readonly line: PreviewChatLine;
}): ReactNode {
  const branch = entry.source.kind === 'branch' && entry.kind !== 'subagent';
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
      {branch ? <Icon name="gitBranch" size={16} tone="variant" /> : null}
      <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
        {branch ? 'Branch · ' : ''}
        {line.speaker === null ? '' : `${line.speaker}: `}
        {line.text}
      </Text>
    </View>
  );
}

export function Line({
  entry,
  line,
}: {
  readonly entry: ChatEntry;
  readonly line: RowLine;
}): ReactNode {
  switch (line.kind) {
    case 'needs':
      return <NeedsLine count={line.count} />;
    case 'working':
      return <WorkingLine step={line.step} />;
    case 'failed':
      return <FailedLine line={line} />;
    case 'waiting':
      return <WaitingLine count={line.count} />;
    case 'queued':
      return <PlainLine text={`Queued · ${String(line.count)}`} />;
    case 'archived':
      return <PlainLine text="Archived" />;
    case 'empty':
      return <PlainLine text="No messages yet" />;
    case 'preview':
      return <PreviewLine entry={entry} line={line} />;
  }
}
