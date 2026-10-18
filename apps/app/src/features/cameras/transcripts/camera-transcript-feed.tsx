import { useState, type ReactNode, type ReactElement } from 'react';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { List } from '../../../components/section';
import { Select } from '../../../components/select';
import { TranscriptFeed } from '../../../components/transcript-feed';
import { useFeedController } from '../../../queries/transcript-reader/use-feed-controller';
import type { TranscriptSelection } from '../../../queries/transcript-reader/selection';
import { useTranscriptRemoval } from '../../../queries/transcript-reader/use-transcript-removal';
import { useSettings } from '../../../store/selectors';
import { useCameraEntries } from '../data/use-cameras';
import type { CameraEntry } from '../logic/cameras';
import { TranscribeRow } from './transcribe-row';

const ALL_CAMERAS = 'all';

function CameraControls({
  entry,
  filter,
  filterCamera,
}: {
  readonly entry: CameraEntry | undefined;
  readonly filter: string;
  readonly filterCamera: (cameraId: string) => void;
}): ReactNode {
  const entries = useCameraEntries();
  if (entry === undefined)
    return (
      <Select
        label="Camera"
        value={filter}
        onChange={filterCamera}
        options={[
          { value: ALL_CAMERAS, label: 'All cameras' },
          ...entries.map((item) => ({ value: item.device.id, label: item.name })),
        ]}
      />
    );
  if (entry.camera === null) return null;
  return (
    <List footer="Anyone who can view this camera can read its text. Audio is never kept. Listening pauses in privacy mode, offline, during a call and at the daily budget.">
      <TranscribeRow camera={entry.camera} />
    </List>
  );
}

export function CameraTranscriptFeed({
  entry,
  header,
  pageHeader,
  banner,
  maxWidth = 'dashboard',
}: {
  readonly entry?: CameraEntry;
  readonly header: ReactNode;
  readonly pageHeader?: ReactElement;
  readonly banner?: ReactNode;
  readonly maxWidth?: 'dashboard' | 'detail';
}): ReactNode {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [filter, filterCamera] = useState(ALL_CAMERAS);
  const sourceId = entry?.device.id ?? (filter === ALL_CAMERAS ? undefined : filter);
  const selection: TranscriptSelection = {
    source: 'camera',
    ...(sourceId === undefined ? {} : { sourceId }),
  };
  const feed = useFeedController(selection, useIsFocused());
  const { time_zone: timeZone } = useSettings();
  const remove = useTranscriptRemoval();
  return (
    <TranscriptFeed
      feed={feed}
      timeZone={timeZone}
      grouped={sourceId !== undefined}
      {...(remove === undefined ? {} : { remove })}
      header={header}
      {...(pageHeader === undefined ? {} : { pageHeader })}
      banner={banner}
      controls={<CameraControls entry={entry} filter={filter} filterCamera={filterCamera} />}
      maxWidth={maxWidth}
      focus={focus === 'transcripts' || focus === 'transcript-search'}
      focusSearch={focus === 'transcript-search'}
    />
  );
}
