import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Banner } from '../../../components/banner';
import { ProgressBar } from '../../../components/charts';
import { FileGlyph } from '../../../components/files/file-glyph';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import {
  cancelUpload,
  clearFolder,
  pauseFolder,
  pauseUpload,
  resumeFolder,
  resumeUpload,
  retryFolder,
  type FolderUploadsView,
} from './drive-uploads';
import {
  amountOf,
  failureLineOf,
  headlineOf,
  isActive,
  leftText,
  overallProgress,
  rateText,
  retryNoticeOf,
  storedAsText,
  type UploadRow,
  type UploadSummary,
} from './upload-model';

function RowControls({ row }: { readonly row: UploadRow }): ReactNode {
  const { state } = row;
  const paused = state.kind === 'paused';
  return (
    <View className="flex-row items-center gap-1">
      {state.kind === 'sending' || paused ? (
        <>
          <View className="w-20">
            <ProgressBar progress={state.progress} colour="primary" label={`${row.name} upload`} />
          </View>
          <IconButton
            icon={paused ? 'play' : 'pause'}
            label={paused ? `Resume ${row.name}` : `Pause ${row.name}`}
            onPress={() => {
              if (paused) resumeUpload(row.key);
              else pauseUpload(row.key);
            }}
          />
        </>
      ) : null}
      <IconButton
        icon="close"
        label={`Cancel ${row.name}`}
        onPress={() => {
          cancelUpload(row.key);
        }}
      />
    </View>
  );
}

function RowEnd({ row }: { readonly row: UploadRow }): ReactNode {
  const { state } = row;
  switch (state.kind) {
    case 'waiting':
    case 'sending':
    case 'paused':
      return <RowControls row={row} />;
    case 'done':
      return state.storedAs === null ? (
        <View className="flex-row items-center gap-1">
          <Icon name="check" size={16} tone="positive" />
          <Text variant="footnote" tone="positive">
            Done
          </Text>
        </View>
      ) : (
        <Text variant="footnote" tone="warning" numberOfLines={1} className="shrink">
          {storedAsText(state.storedAs)}
        </Text>
      );
    case 'have':
      return (
        <Text variant="footnote" tone="variant">
          Already here
        </Text>
      );
    case 'cancelled':
      return null;
    case 'failed':
      return <Icon name="alert" size={16} tone="critical" />;
  }
}

function StripRow({ row }: { readonly row: UploadRow }): ReactNode {
  const { state } = row;
  const failure = failureLineOf(row);
  return (
    <View className="min-h-12 flex-row items-center gap-3 py-1">
      <FileGlyph kind="file" name={row.name} />
      <View className="min-w-0 flex-1">
        <Text variant="callout" numberOfLines={1}>
          {row.name}
        </Text>
        {state.kind === 'waiting' ? (
          <Text variant="footnote" tone="variant">
            Waiting
          </Text>
        ) : null}
        {failure === null ? null : (
          <Text variant="footnote" tone="critical">
            {failure}
          </Text>
        )}
      </View>
      <RowEnd row={row} />
    </View>
  );
}

function HeadActions({
  view,
  folderId,
  open,
  onToggle,
}: {
  readonly view: FolderUploadsView;
  readonly folderId: string;
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  const { summary, rows } = view;
  const paused = summary.paused > 0 && summary.sending + summary.waiting === 0;
  return (
    <View className="flex-row items-center gap-1">
      {isActive(summary) ? (
        <IconButton
          icon={paused ? 'play' : 'pause'}
          label={paused ? 'Resume uploads' : 'Pause uploads'}
          onPress={() => {
            if (paused) resumeFolder(folderId);
            else pauseFolder(folderId);
          }}
        />
      ) : (
        <IconButton
          icon="close"
          label="Close uploads"
          onPress={() => {
            clearFolder(rows);
          }}
        />
      )}
      <IconButton
        icon={open ? 'chevronDown' : 'chevronUp'}
        label={open ? 'Collapse uploads' : 'Expand uploads'}
        onPress={onToggle}
      />
    </View>
  );
}

function AmountLine({
  summary,
  rate,
}: {
  readonly summary: UploadSummary;
  readonly rate: number | null;
}): ReactNode {
  const left = leftText(summary, rate);
  return (
    <View className="flex-row items-center gap-3">
      <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular min-w-0 flex-1">
        {left === null ? amountOf(summary) : `${amountOf(summary)} · ${left}`}
      </Text>
      {rate !== null && summary.sending > 0 ? (
        <Text variant="footnote" tone="variant" className="tabular">
          {rateText(rate)}
        </Text>
      ) : null}
    </View>
  );
}

function RetryNotice({ rows }: { readonly rows: readonly UploadRow[] }): ReactNode {
  const notice = retryNoticeOf(rows);
  if (notice === null) return null;
  return (
    <Banner
      tone="warning"
      title={notice.title}
      body={notice.body}
      action={{
        label: 'Retry now',
        onPress: () => {
          retryFolder(rows);
        },
      }}
    />
  );
}

export function UploadStrip({
  view,
  folderId,
  folderName,
}: {
  readonly view: FolderUploadsView;
  readonly folderId: string;
  readonly folderName: string;
}): ReactNode {
  const [open, setOpen] = useState(true);
  const { summary, rows, rate } = view;
  const active = isActive(summary);
  return (
    <View className="gap-2 border-t border-outline-variant px-4 py-3">
      <View className="flex-row items-center gap-3">
        <Icon name="upload" size={20} tone="primary" />
        <Text variant="body-strong" numberOfLines={1} className="tabular min-w-0 flex-1">
          {headlineOf(summary, folderName)}
        </Text>
        <HeadActions
          view={view}
          folderId={folderId}
          open={open}
          onToggle={() => {
            setOpen((current) => !current);
          }}
        />
      </View>
      <RetryNotice rows={rows} />
      {active ? (
        <>
          <ProgressBar progress={overallProgress(summary)} colour="primary" label="Uploads" />
          <AmountLine summary={summary} rate={rate} />
        </>
      ) : null}
      {open ? (
        <ScrollView className="max-h-60">
          {rows.map((row) => (
            <StripRow key={row.key} row={row} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
