import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { ProgressBar } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useUploadEntries, type UploadEntry } from '../../nas/uploads';
import {
  destinationText,
  entryStatus,
  panelSummary,
  percentText,
  type EntryStatus,
  type PanelSummary,
} from './upload-model';
import { clearSettledUploads, pauseUploads, resumeUploads, useUploadPath } from './uploads';

function StatusText({ status }: { readonly status: EntryStatus }): ReactNode {
  if (status.kind === 'progress') {
    return (
      <Text variant="footnote" tone="variant" className="tabular-nums">
        {status.paused ? 'Paused' : percentText(status.share)}
      </Text>
    );
  }
  if (status.kind === 'done') {
    return status.text === null ? (
      <Icon name="check" size={16} tone="positive" />
    ) : (
      <Text variant="footnote" tone="variant">
        {status.text}
      </Text>
    );
  }
  return (
    <View className="flex-row items-center gap-1">
      {status.critical ? null : <Icon name="circleCheck" size={16} tone="positive" />}
      <Text variant="footnote" tone={status.critical ? 'critical' : 'variant'}>
        {status.text}
      </Text>
    </View>
  );
}

function EntryRow({ entry }: { readonly entry: UploadEntry }): ReactNode {
  const status = entryStatus(entry);
  return (
    <View className="min-h-11 flex-row items-center gap-3">
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="callout" numberOfLines={1}>
          {entry.name}
        </Text>
        {status.kind === 'progress' ? (
          <ProgressBar progress={status.share} colour="primary" label={`${entry.name} upload`} />
        ) : null}
      </View>
      <StatusText status={status} />
    </View>
  );
}

function PanelHead({
  summary,
  open,
  onToggle,
}: {
  readonly summary: PanelSummary;
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1 py-2 pl-4 pr-2">
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" className="tabular-nums">
          {summary.title}
        </Text>
        {summary.detail === null ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {summary.detail}
          </Text>
        )}
      </View>
      {summary.running ? (
        <IconButton
          icon={summary.paused ? 'play' : 'pause'}
          label={summary.paused ? 'Resume uploads' : 'Pause uploads'}
          onPress={summary.paused ? resumeUploads : pauseUploads}
        />
      ) : (
        <IconButton icon="close" label="Close uploads" onPress={clearSettledUploads} />
      )}
      <IconButton
        icon={open ? 'chevronDown' : 'chevronUp'}
        label={open ? 'Collapse uploads' : 'Expand uploads'}
        onPress={onToggle}
      />
    </View>
  );
}

export function UploadPanel({ compact }: { readonly compact: boolean }): ReactNode {
  const entries = useUploadEntries();
  const path = useUploadPath();
  const [open, setOpen] = useState(true);
  if (entries.length === 0) return null;
  const summary = panelSummary(entries);
  const toggle = (): void => {
    setOpen((current) => !current);
  };
  return (
    <View
      className={cn(
        'absolute bottom-4 z-10 rounded-lg border border-outline-variant bg-surface-2 shadow-lg',
        compact ? 'inset-x-3' : 'right-16 w-96',
      )}
    >
      <PanelHead summary={summary} open={open} onToggle={toggle} />
      {open ? (
        <>
          <ScrollView className="max-h-72 border-t border-outline-variant">
            <View className="px-4 py-1">
              {entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} />
              ))}
            </View>
          </ScrollView>
          <Text
            variant="footnote"
            tone="variant"
            className="border-t border-outline-variant px-4 py-2"
          >
            {destinationText(path)}
          </Text>
        </>
      ) : null}
    </View>
  );
}
