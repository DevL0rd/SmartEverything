import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { SegmentBar } from '../../../components/charts';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { confirm } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
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
      icon={line.icon}
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

function RemoveAllRow({ storage }: { readonly storage: PhoneStorage }): ReactNode {
  return (
    <ListRow
      title="Remove all"
      icon="trash"
      destructive
      subtitle="Only the copies on this phone go. Everything stays in your drive."
      wrapSubtitle
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
  );
}

function KeptUsage({
  storage,
  segments,
}: {
  readonly storage: PhoneStorage;
  readonly segments: ReturnType<typeof phoneSegmentsOf>;
}): ReactNode {
  return (
    <View className="gap-2 px-4 pb-3 pt-4">
      <Text variant="body-strong" className="tabular">
        {phoneSummaryOf(storage.rows, storage.status?.usedBytes ?? null)}
      </Text>
      {segments.length === 0 ? null : (
        <SegmentBar
          segments={segments}
          label="Space on this phone by item"
          format={bytes}
          size="thin"
          legend
        />
      )}
      <View className="flex-row pt-1">
        <Button label="Copy now" icon="refresh" variant="tonal" onPress={storage.syncNow} />
      </View>
    </View>
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
      <List inset>
        <KeptUsage storage={storage} segments={segments} />
        <RemoveAllRow storage={storage} />
      </List>
      <List inset title="Kept on this phone" footer={FILES_APP_LINE}>
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
    return <EmptyState compact icon="smartphone" title="Not linked yet" body={NOT_LINKED_LINE} />;
  }
  if (storage.rows.length === 0) {
    return (
      <View className="gap-3">
        <EmptyState
          compact
          icon="download"
          title="Nothing kept offline yet"
          body="Choose Make available offline in a file or folder menu to keep a copy on this phone."
        />
        <Text variant="footnote" tone="variant" className="px-4">
          {FILES_APP_LINE}
        </Text>
      </View>
    );
  }
  return <Kept storage={storage} />;
}

export function PhoneSection({
  link = nativeDriveProvider,
}: {
  readonly link?: DriveProviderLink;
}): ReactNode {
  return (
    <DriveSettingsSection>
      <PhoneBody link={link} />
    </DriveSettingsSection>
  );
}
