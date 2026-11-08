import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { PluginButton } from '../../shared/plugin-action';
import type { FigureFit } from '../../shared/service-widget-frame';
import type { StaleCaption } from './blocking-model';

export function StaleLine({
  caption,
  short = false,
  variant = 'footnote',
}: {
  readonly caption: StaleCaption;
  readonly short?: boolean;
  readonly variant?: FigureFit['caption'];
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      {caption.critical ? <Icon name="warning" size={16} tone="critical" /> : null}
      <Text
        variant={variant}
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
  variant,
}: {
  readonly text: string;
  readonly stale: StaleCaption | null;
  readonly variant: FigureFit['caption'];
}): ReactNode {
  return stale === null ? (
    <Text variant={variant} tone="variant" numberOfLines={1}>
      {text}
    </Text>
  ) : (
    <StaleLine caption={stale} variant={variant} />
  );
}

export function Resume({ onResume }: { readonly onResume: () => Promise<unknown> }): ReactNode {
  return <PluginButton label="Resume" variant="text" onPress={onResume} />;
}
