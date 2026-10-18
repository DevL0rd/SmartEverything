import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { PluginButton } from '../../shared/plugin-action';
import type { StaleCaption } from './blocking-model';

export function StaleLine({
  caption,
  short = false,
}: {
  readonly caption: StaleCaption;
  readonly short?: boolean;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      {caption.critical ? <Icon name="warning" size={16} tone="critical" /> : null}
      <Text
        variant="footnote"
        tone={caption.critical ? 'critical' : 'variant'}
        numberOfLines={1}
        className="shrink"
        accessibilityLabel={caption.long}
      >
        {short ? caption.short : caption.long}
      </Text>
    </View>
  );
}

export function Caption({
  text,
  stale,
}: {
  readonly text: string;
  readonly stale: StaleCaption | null;
}): ReactNode {
  return stale === null ? (
    <Text variant="footnote" tone="variant" numberOfLines={1}>
      {text}
    </Text>
  ) : (
    <StaleLine caption={stale} />
  );
}

export function Resume({ onResume }: { readonly onResume: () => Promise<unknown> }): ReactNode {
  return <PluginButton label="Resume" variant="text" onPress={onResume} />;
}
