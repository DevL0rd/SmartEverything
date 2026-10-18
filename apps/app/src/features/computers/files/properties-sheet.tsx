import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FileEntry, FileProperties } from '@smarteverything/domain';
import { ErrorState } from '../../../components/error-state';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { clock, shortDate } from '../../../format/time';
import { useFileProperties } from '../data/computer-files';
import { InfoCard, InfoRow } from '../processes/info-rows';
import { permissionsWords } from './file-model';

function stamp(at: string): string {
  return `${shortDate(at)}, ${clock(at)}`;
}

function Facts({ properties }: { readonly properties: FileProperties }): ReactNode {
  const folder = properties.kind === 'folder';
  return (
    <InfoCard>
      <InfoRow label="Size" value={bytes(properties.size)} first />
      <InfoRow label="Kind" value={folder ? 'Folder' : (properties.mimeType ?? 'File')} />
      <InfoRow label="Owner" value={properties.owner} />
      <InfoRow label="Group" value={properties.group} />
      <InfoRow label="Permissions" value={permissionsWords(properties.permissions)} />
      <InfoRow label="Modified" value={stamp(properties.modifiedAt)} />
      {properties.createdAt === null ? null : (
        <InfoRow label="Created" value={stamp(properties.createdAt)} />
      )}
      {properties.linkTarget === null ? null : (
        <InfoRow label="Points to" value={properties.linkTarget} mono copy />
      )}
      <InfoRow label="Path" value={properties.path} mono copy />
    </InfoCard>
  );
}

function Body({
  deviceId,
  entry,
}: {
  readonly deviceId: string;
  readonly entry: FileEntry;
}): ReactNode {
  const properties = useFileProperties(deviceId, entry.path);
  if (properties.isError) return <ErrorState error={properties.error} />;
  if (properties.data === undefined) {
    return (
      <View className="gap-2">
        <Text variant="footnote" tone="variant">
          {entry.kind === 'folder' ? 'Calculating the size…' : 'Reading…'}
        </Text>
        <Skeleton shape="block" />
      </View>
    );
  }
  return <Facts properties={properties.data} />;
}

export function PropertiesSheet({
  deviceId,
  entry,
  onClose,
}: {
  readonly deviceId: string;
  readonly entry: FileEntry;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open onClose={onClose} title={entry.name} detents={['half', 'full']}>
      <View className="px-4 pb-6">
        <Body deviceId={deviceId} entry={entry} />
      </View>
    </Sheet>
  );
}
