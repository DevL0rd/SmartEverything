import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { SegmentBar } from '../../../components/charts';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { confirm } from '../../../components/confirm-store';
import { notifyFailure } from '../../../components/toast-store';
import { bytes } from '../../../format/number';
import { useSession } from '../../../store/selectors';
import { useDriveItems, useOfflineSet } from '../data';
import { usePhoneStorage, type PhoneStorage } from '../phone/offline';
import { nativeDriveProvider, type DriveProviderLink } from '../phone/provider';
import { DriveSettingsSection } from './page';
import {
  FILES_APP_LINE,
  NOT_LINKED_LINE,
  phoneRowLineOf,
  phoneSegmentsOf,
  phoneSummaryOf,
  type PhoneRowLine,
} from './phone-model';

function PinnedRow({ line }: { readonly line: PhoneRowLine }): ReactNode {
  const clientId = useSession().client.id;
  const unpin = useOfflineSet();
  return (
    <ListRow
      title={line.name}
      icon={line.folder ? 'folder' : 'fileText'}
      subtitle={line.line}
      subtitleTone={line.tone}
      trailing={
        <IconButton
          icon="x"
          label={`Remove ${line.name} from this phone`}
          disabled={unpin.busy}
          onPress={() => {
            unpin.run({ clientId, itemId: line.itemId, on: false });
          }}
        />
      }
    />
  );
}

function Kept({ storage }: { readonly storage: PhoneStorage }): ReactNode {
  const items = useDriveItems(
    storage.rows.map((row) => row.itemId),
    null,
  );
  const lines = storage.rows.map((row, index) => phoneRowLineOf(row, items[index]));
  const names = new Map(lines.map((line) => [line.itemId, line.name]));
  const segments = phoneSegmentsOf(storage.rows, (itemId) => names.get(itemId) ?? itemId);
  return (
    <View className="gap-3">
      <View className="gap-2 rounded-lg border-hairline border-outline-variant bg-surface-1 p-4">
        <Text variant="body-strong" className="tabular">
          {phoneSummaryOf(storage.rows, storage.status?.usedBytes ?? null)}
        </Text>
        {segments.length === 0 ? null : (
          <SegmentBar segments={segments} label="Space on this phone by item" format={bytes} />
        )}
        <View className="flex-row flex-wrap justify-between gap-2 pt-1">
          <Button
            label="Remove all"
            icon="trash"
            variant="destructive"
            loading={storage.clearing}
            disabled={storage.clearing}
            onPress={() => {
              confirm({
                title: 'Remove every offline file?',
                body: 'They stay in your drive. Only the copies on this phone go.',
                confirmLabel: 'Remove all',
                tone: 'destructive',
              }).then((accepted) => {
                if (accepted) storage.removeAll();
              }, notifyFailure('The offline files were not removed.'));
            }}
          />
          <Button label="Copy now" icon="refresh" variant="tonal" onPress={storage.syncNow} />
        </View>
      </View>
      <List inset title="Kept on this phone">
        {lines.map((line) => (
          <PinnedRow key={line.itemId} line={line} />
        ))}
      </List>
    </View>
  );
}

function PhoneBody({ link }: { readonly link: DriveProviderLink }): ReactNode {
  const storage = usePhoneStorage(link);
  if (!storage.available) {
    return (
      <Text variant="footnote" tone="variant">
        {NOT_LINKED_LINE}
      </Text>
    );
  }
  return (
    <View className="gap-3">
      <Text variant="footnote" tone="variant">
        {FILES_APP_LINE}
      </Text>
      {storage.rows.length === 0 ? (
        <Text variant="footnote" tone="variant">
          Nothing is kept on this phone yet. Choose Make available offline in a file or folder menu.
        </Text>
      ) : (
        <Kept storage={storage} />
      )}
    </View>
  );
}

export function PhoneSection({
  link = nativeDriveProvider,
}: {
  readonly link?: DriveProviderLink;
}): ReactNode {
  return (
    <DriveSettingsSection section="phone">
      <PhoneBody link={link} />
    </DriveSettingsSection>
  );
}
