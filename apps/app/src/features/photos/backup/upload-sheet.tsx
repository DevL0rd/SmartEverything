import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { BottomSheet, type Detent } from '../../../components/bottom-sheet';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { ValueStore, usePausable } from '../../../design/external-store';
import { pickFiles, PickerMissingError, type PickSource } from '../../../platform/pick-files';
import { useActiveProfile } from '../../../store/people';
import { useUploadEntries, type UploadEntry } from '../../drive';
import { panelSummary, percentText } from '../library/upload-model';
import { uploadFiles, useUploadPath } from '../library/uploads';
import { sheetEntryText, sheetTargetText } from './upload-sheet-model';

const log = new Logger('app.photos');

const DETENTS: readonly Detent[] = ['fit', 'full'];

export const uploadSheetOpen = new ValueStore(false);

export function openUploadSheet(): void {
  uploadSheetOpen.set(true);
}

function close(): void {
  uploadSheetOpen.set(false);
}

function pickAndUpload(source: PickSource): void {
  pickFiles(source)
    .then(uploadFiles)
    .catch((error: unknown) => {
      log.warn('photos.upload_sheet.pick_failed', { source });
      notify({
        message: error instanceof PickerMissingError ? error.message : 'Could not start the upload',
        error,
        tone: 'critical',
      });
    });
}

function EntryLine({ entry }: { readonly entry: UploadEntry }): ReactNode {
  const text = sheetEntryText(entry);
  return (
    <View className="min-h-11 flex-row items-center gap-3">
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="callout" numberOfLines={1}>
          {entry.name}
        </Text>
        {text.kind === 'progress' ? (
          <ProgressBar progress={text.share} colour="primary" label={`${entry.name} upload`} />
        ) : null}
      </View>
      {text.kind === 'progress' ? (
        <Text variant="footnote" tone="variant" className="tabular-nums">
          {percentText(text.share)}
        </Text>
      ) : (
        <View className="flex-row items-center gap-1">
          {text.critical ? null : <Icon name="circleCheck" size={16} tone="positive" />}
          <Text variant="footnote" tone={text.critical ? 'critical' : 'variant'}>
            {text.text}
          </Text>
        </View>
      )}
    </View>
  );
}

function Progress({ entries }: { readonly entries: readonly UploadEntry[] }): ReactNode {
  if (entries.length === 0) return null;
  const summary = panelSummary(entries);
  return (
    <View className="gap-1 border-t border-outline-variant pt-3">
      <Text variant="body-strong" className="tabular-nums">
        {summary.title}
      </Text>
      {summary.detail === null ? null : (
        <Text variant="footnote" tone="variant">
          {summary.detail}
        </Text>
      )}
      {entries.map((entry) => (
        <EntryLine key={entry.id} entry={entry} />
      ))}
    </View>
  );
}

export function UploadSheet(): ReactNode {
  const open = usePausable(uploadSheetOpen.subscribe, uploadSheetOpen.get);
  const entries = useUploadEntries();
  const path = useUploadPath();
  const person = useActiveProfile()?.name ?? null;
  return (
    <BottomSheet
      open={open}
      onClose={close}
      title="Upload"
      label="Upload photos"
      detents={DETENTS}
      scroll
    >
      <View className="gap-4 pb-4">
        <Text variant="footnote" tone="variant">
          {sheetTargetText(path, person)}
        </Text>
        <View className="flex-row gap-2">
          <Button
            label="From this phone"
            icon="image"
            variant="tonal"
            grow
            onPress={() => {
              pickAndUpload('photos');
            }}
          />
          <Button
            label="From files"
            icon="folder"
            variant="outlined"
            grow
            onPress={() => {
              pickAndUpload('files');
            }}
          />
        </View>
        <Progress entries={entries} />
      </View>
    </BottomSheet>
  );
}
