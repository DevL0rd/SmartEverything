import type { ReactNode } from 'react';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import type {
  AiHarnessConfigurationCatalogue,
  HarnessExtensionItem,
} from '@smarteverything/domain';
import { SettingsFrame } from '../../../settings/settings-frame';
import { EmptyState } from '../../../components/empty-state';
import { useSyncStatus } from '../../../store/selectors';
import { ReasonLine } from '../../../components/reason-line';
import { useExtensionConfiguration, useExtension, useExtensions } from './queries';
import { extensionIcon, pageKind } from './items';
import { ItemHeader } from './item-header';
import { ExtensionDevicesSheet } from './devices-sheet';
import { ExtensionSourceSheet } from './source-sheet';
import { ExtensionReadStatus, useMemberBanner } from './query-status';
import { useExtensionActions } from './change';
import { ExtensionDetailRows } from './detail-rows';
import { background } from '@smarteverything/logging';

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
  const actions = useExtensionActions();
  return (
    <>
      <DetailHeader item={item} />
      <ExecutesNote item={item} />
      <ExtensionDetailRows
        item={item}
        configuration={configuration}
        actions={actions}
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

function ExecutesNote({ item }: { readonly item: HarnessExtensionItem }): ReactNode {
  return item.executes && item.confirmed ? (
    <ReasonLine
      icon="siren"
      tone="warning"
      text="This extension runs programs on your computers. The home owner allowed it. Turn it off or remove it to stop that."
    />
  ) : null;
}

function DetailReadStatus({ kind }: { readonly kind: 'extension' | 'skill' }): ReactNode {
  const configuration = useExtensionConfiguration();
  const catalogue = useExtensions();
  const loading =
    (configuration.isFetching && configuration.data === undefined) ||
    (catalogue.isFetching && catalogue.data === undefined);
  return (
    <ExtensionReadStatus
      kind={kind}
      loading={loading}
      error={configuration.error ?? catalogue.error}
      retry={() => {
        background(configuration.refetch(), 'configuration.refetch_failed');
        background(catalogue.refetch(), 'catalogue.refetch_failed');
      }}
    />
  );
}

export function AiExtensionScreen(): ReactNode {
  const params = z
    .object({ extensionId: z.string().optional(), section: z.string().optional() })
    .parse(useLocalSearchParams());
  const extension = useExtension(params.extensionId ?? '');
  const item = extension.data ?? undefined;
  const query = useExtensionConfiguration();
  const configuration = query.data;
  const banner = useMemberBanner('add, update or remove extensions');
  const kind = item === undefined ? 'extension' : pageKind(item);
  return (
    <SettingsFrame
      page={kind === 'skill' ? 'assistant/skills/detail' : 'assistant/extensions/detail'}
      title={item?.name ?? 'Extension or skill'}
      {...(banner === undefined ? {} : { banner })}
    >
      <DetailReadStatus kind={kind} />
      <DetailBody
        item={item}
        configuration={configuration}
        section={params.section}
        loading={query.isFetching || extension.isFetching}
      />
    </SettingsFrame>
  );
}

function DetailBody({
  item,
  configuration,
  section,
  loading,
}: {
  readonly item: HarnessExtensionItem | undefined;
  readonly configuration: AiHarnessConfigurationCatalogue | undefined;
  readonly section: string | undefined;
  readonly loading: boolean;
}): ReactNode {
  if (item === undefined || configuration === undefined) return <DetailMissing loading={loading} />;
  return <Detail key={item.id} item={item} configuration={configuration} section={section} />;
}

function DetailMissing({ loading }: { readonly loading: boolean }): ReactNode {
  const sync = useSyncStatus();
  return loading || sync.status !== 'live' ? null : (
    <EmptyState
      icon="puzzle"
      title="Extension unavailable"
      body="It may have been removed. Go back to the list to see what is installed."
    />
  );
}

function DetailHeader({ item }: { readonly item: HarnessExtensionItem }): ReactNode {
  return (
    <ItemHeader
      icon={extensionIcon(item)}
      kind={pageKind(item)}
      included={item.source.kind === 'included'}
      description={item.description}
      byline={
        item.version === null ? item.publisher : `${item.publisher} · version ${item.version}`
      }
    />
  );
}
