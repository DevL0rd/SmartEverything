import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { ZOOM_OPTIONS } from '../timeline/timeline-model';

export interface CollectionToolbarProps {
  readonly hint: string;
  readonly step: MediaZoomStep;
  readonly onStep: (step: MediaZoomStep) => void;
}

export function CollectionToolbar({ hint, step, onStep }: CollectionToolbarProps): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2 pb-2">
      <Interactive
        href={href.photosPage('search')}
        label={hint}
        role="search"
        className="h-control-h min-w-0 max-w-96 flex-1 flex-row items-center gap-2 rounded-md bg-surface-3 px-3"
        layerClassName="rounded-md"
      >
        <Icon name="search" size={16} tone="variant" />
        <Text variant="body" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
          {hint}
        </Text>
      </Interactive>
      <View className="ml-auto">
        <Segmented options={ZOOM_OPTIONS} value={step} onChange={onStep} label="Zoom" compact />
      </View>
    </View>
  );
}

export function CollectionLine({ text }: { readonly text: string }): ReactNode {
  return (
    <View className="flex-row items-center border-b border-outline-variant py-2">
      <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
        {text}
      </Text>
    </View>
  );
}
