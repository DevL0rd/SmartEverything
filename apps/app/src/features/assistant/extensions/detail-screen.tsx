import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import type {
  AiHarnessConfigurationCatalogue,
  HarnessExtensionItem,
} from '@smarteverything/domain';
import { SettingsFrame } from '../../../settings/settings-frame';
import { EmptyState } from '../../../components/empty-state';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { useExtensionConfiguration, useExtensions, useResolvedExtension } from './queries';
import { installedItems, extensionIcon } from './items';
import { ExtensionDevicesSheet } from './devices-sheet';
import { ExtensionSourceSheet } from './source-sheet';
import { ExtensionReadStatus } from './query-status';
import { useExtensionWriter } from './change';
import { ExtensionChangeReview } from './change-review';
import { ExtensionDetailRows } from './detail-rows';

function Detail({
  item,
  configuration,
  section,
}: {
  readonly item: HarnessExtensionItem;
  readonly configuration: AiHarnessConfigurationCatalogue;
  readonly section: string | undefined;
}): ReactNode {
  const [devices, setDevices] = useState(section === 'devices');
  const [source, setSource] = useState(section === 'source');
  const writer = useExtensionWriter();
  return (
    <>
      <DetailHeader item={item} />
      <ExtensionChangeReview writer={writer} />
      <ExtensionDetailRows
        item={item}
        configuration={configuration}
        writer={writer}
        onDevices={() => {
          setDevices(true);
        }}
        onSource={() => {
          setSource(true);
        }}
      />
      <ExtensionDevicesSheet
        open={devices}
        onClose={() => {
          setDevices(false);
        }}
        item={item}
        configuration={configuration}
      />
      <ExtensionSourceSheet
        open={source}
        onClose={() => {
          setSource(false);
        }}
        item={item}
      />
    </>
  );
}

function useDetailItem(id: string, inspected: boolean): HarnessExtensionItem | undefined {
  const configuration = useExtensionConfiguration();
  const catalogue = useExtensions();
  const resolved = useResolvedExtension(id);
  const items =
    configuration.data === undefined
      ? []
      : installedItems(catalogue.data?.items ?? [], configuration.data.desired);
  if (inspected) return resolved.data;
  return (
    items.find((entry) => entry.id === id) ??
    catalogue.data?.items.find((entry) => entry.id === id) ??
    resolved.data
  );
}

function DetailReadStatus({ kind }: { readonly kind: 'extension' | 'skill' }): ReactNode {
  const configuration = useExtensionConfiguration();
  const catalogue = useExtensions();
  const loading = configuration.isFetching && configuration.data === undefined;
  return (
    <ExtensionReadStatus
      kind={kind}
      loading={loading}
      error={configuration.error ?? catalogue.error}
      retry={() => {
        void configuration.refetch();
        void catalogue.refetch();
      }}
    />
  );
}

export function AiExtensionScreen(): ReactNode {
  const params = z
    .object({
      extensionId: z.string().max(400).optional(),
      section: z.string().optional(),
      inspect: z.literal('true').optional(),
    })
    .parse(useLocalSearchParams());
  const item = useDetailItem(params.extensionId ?? '', params.inspect === 'true');
  const configuration = useExtensionConfiguration().data;
  return (
    <SettingsFrame
      page={item?.kind === 'skill' ? 'assistant/skills/detail' : 'assistant/extensions/detail'}
      title={item?.name ?? 'Extension or skill'}
    >
      <DetailReadStatus kind={item?.kind === 'skill' ? 'skill' : 'extension'} />
      {item === undefined || configuration === undefined ? (
        <EmptyState
          icon="puzzle"
          title="Extension unavailable"
          body="Refresh the catalogue or inspect the source again."
        />
      ) : (
        <Detail key={item.id} item={item} configuration={configuration} section={params.section} />
      )}
    </SettingsFrame>
  );
}

function DetailHeader({ item }: { readonly item: HarnessExtensionItem }): ReactNode {
  return (
    <View className="flex-row items-start gap-4 px-1">
      <IconWell icon={extensionIcon(item)} colour="primary" size="l" />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body">{item.description}</Text>
        <Text variant="footnote" tone="variant">
          {item.publisher} · version{' '}
          {item.selection.kind === 'entry'
            ? item.selection.entry.version
            : item.selection.asset.version}
        </Text>
      </View>
    </View>
  );
}
