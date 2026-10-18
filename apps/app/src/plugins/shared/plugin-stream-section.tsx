import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Skeleton } from '../../components/skeleton';
import { cn } from '../../design/cn';
import { ServiceNotice, StreamProblem, type PluginNoticeText } from './plugin-notice';
import type { PluginStream } from './use-plugin-stream';

export function PluginStreamSection<T>({
  stream,
  pluginId,
  notice,
  fill = false,
  children,
}: {
  readonly stream: PluginStream<T>;
  readonly pluginId: string;
  readonly notice?: (value: T) => PluginNoticeText | null;
  readonly fill?: boolean;
  readonly children: (value: T) => ReactNode;
}): ReactNode {
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  if (notice === undefined) {
    return children(stream.value);
  }
  return (
    <View className={cn('gap-section-gap', fill && 'flex-1')}>
      <ServiceNotice pluginId={pluginId} notice={notice(stream.value)} />
      {children(stream.value)}
    </View>
  );
}
