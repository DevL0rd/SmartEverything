import type { PhotoTimelineFilter } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { FlatChoice } from '../../../components/flat-choice';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { ChipRow } from '../../nas/frame';
import { BackupChip } from './backup-chip';
import { SEARCH_HINT, TIMELINE_CHIPS, ZOOM_OPTIONS } from './timeline-model';

function SearchOpener(): ReactNode {
  return (
    <Interactive
      href={href.photosPage('search')}
      label={SEARCH_HINT}
      role="search"
      className="h-control-h min-w-0 max-w-96 flex-1 flex-row items-center gap-2 rounded-md bg-surface-3 px-3"
      layerClassName="rounded-md"
    >
      <Icon name="search" size={16} tone="variant" />
      <Text variant="body" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
        {SEARCH_HINT}
      </Text>
    </Interactive>
  );
}

export interface ToolbarProps {
  readonly step: MediaZoomStep;
  readonly onStep: (step: MediaZoomStep) => void;
}

export function TimelineToolbar({ step, onStep }: ToolbarProps): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2 pb-2">
      <SearchOpener />
      <BackupChip />
      <View className="ml-auto">
        <Segmented options={ZOOM_OPTIONS} value={step} onChange={onStep} label="Zoom" compact />
      </View>
    </View>
  );
}

export interface FilterRowProps {
  readonly filter: PhotoTimelineFilter;
  readonly onFilter: (filter: PhotoTimelineFilter) => void;
  readonly line: string | null;
}

export function TimelineFilters({ filter, onFilter, line }: FilterRowProps): ReactNode {
  return (
    <View className="flex-row items-center gap-3 border-b border-outline-variant">
      <View className="min-w-0 flex-1">
        <ChipRow label="Show">
          {TIMELINE_CHIPS.map((chip) => (
            <FlatChoice
              key={chip.filter}
              label={chip.label}
              icon={chip.icon}
              role="radio"
              active={chip.filter === filter}
              onPress={() => {
                onFilter(chip.filter);
              }}
            />
          ))}
        </ChipRow>
      </View>
      {line === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink tabular-nums">
          {line}
        </Text>
      )}
    </View>
  );
}
