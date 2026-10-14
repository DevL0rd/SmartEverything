import type { ReactNode } from 'react';
import type {
  AiHarnessConfigurationCatalogue,
  HarnessExtensionItem,
} from '@smarteverything/domain';
import { confirm } from '../../../components/confirm-store';
import { List } from '../../../components/section';
import { ActionRow, NavRow, SwitchRow } from '../../../components/rows';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { useIsOwner } from '../../../store/selectors';
import { useHarnessCatalogue } from '../data/harness';
import { isSelected, selectedEntry, requiresSkillUpdate } from './selection';
import { canInstall, itemSummary } from './status';
import type { useExtensionWriter } from './change';

interface Props {
  readonly item: HarnessExtensionItem;
  readonly configuration: AiHarnessConfigurationCatalogue;
  readonly writer: ReturnType<typeof useExtensionWriter>;
  readonly onDevices: () => void;
  readonly onSource: () => void;
}

function SelectionRows({
  item,
  configuration,
  writer,
}: Pick<Props, 'item' | 'configuration' | 'writer'>): ReactNode {
  const owner = useIsOwner();
  const selected = isSelected(item, configuration.desired);
  if (!owner)
    return (
      <Text variant="footnote" tone="variant">
        Managed by the home owner
      </Text>
    );
  if (!selected || requiresSkillUpdate(item, configuration.desired))
    return <InstallRows item={item} configuration={configuration} writer={writer} />;
  if (item.selection.kind === 'skill_asset')
    return (
      <Text variant="footnote" tone="variant">
        Included in Workspace skills. Use its On switch to enable the collection.
      </Text>
    );
  return (
    <List inset>
      <SwitchRow
        icon="power"
        title="On"
        subtitle="Saved choice · devices apply it after current sessions finish"
        value={selectedEntry(item, configuration.desired)?.enabled === true}
        disabled={!writer.allowed}
        onChange={(enabled) => {
          void writer.save({ kind: 'switch', item, enabled }, configuration.desired);
        }}
      />
    </List>
  );
}

function InstallRows({
  item,
  configuration,
  writer,
}: Pick<Props, 'item' | 'configuration' | 'writer'>): ReactNode {
  const inventory = useHarnessCatalogue();
  return (
    <List inset>
      {canInstall(item, inventory.data) ? (
        <ActionRow
          icon="plus"
          title={
            isSelected(item, configuration.desired) ? 'Update to this inspected version' : 'Install'
          }
          subtitle="Add the inspected version for compatible devices"
          disabled={!writer.allowed}
          onPress={() => {
            void writer.save({ kind: 'install', item }, configuration.desired);
          }}
        />
      ) : (
        <ListRow
          icon="info"
          title="No compatible device"
          subtitle={
            item.acquisition.state === 'unsupported'
              ? item.acquisition.reason
              : 'Requires an enrolled Linux device with configuration sync.'
          }
          wrapSubtitle
        />
      )}
    </List>
  );
}

function AbilityRows({ item }: { readonly item: HarnessExtensionItem }): ReactNode {
  return (
    <>
      {item.capabilities.length === 0 ? null : (
        <List inset title="What it can do">
          {item.capabilities.map((title) => (
            <ListRow key={title} icon="wrench" title={title} />
          ))}
        </List>
      )}
      <List inset title="Works with">
        <ListRow
          icon="sparkles"
          title={
            item.runtimes.includes('smarteverything')
              ? 'SmartEverything'
              : 'Compatibility not verified'
          }
          subtitle={
            item.platforms.length === 0 ? 'Compatibility not verified' : item.platforms.join(', ')
          }
        />
        {item.requirements.map((title) => (
          <ListRow key={title} icon="shield" title={title} />
        ))}
      </List>
    </>
  );
}

function RemoveRow({
  item,
  configuration,
  writer,
}: Pick<Props, 'item' | 'configuration' | 'writer'>): ReactNode {
  const owner = useIsOwner();
  if (!owner || item.included || !isSelected(item, configuration.desired)) return null;
  return (
    <ActionRow
      icon="trash"
      title={`Remove ${item.name}`}
      destructive
      disabled={!writer.allowed}
      onPress={() => {
        void confirm({
          title: `Remove ${item.name}?`,
          body: 'Remove the shared selection from compatible devices after active sessions finish. Local project files and sign-ins stay on each device.',
          confirmLabel: 'Remove',
          tone: 'destructive',
        }).then((accepted) => {
          if (accepted) void writer.save({ kind: 'remove', item }, configuration.desired);
        });
      }}
    />
  );
}

export function ExtensionDetailRows(props: Props): ReactNode {
  const { item, configuration, onDevices, onSource } = props;
  return (
    <>
      <SelectionRows {...props} />
      <List inset>
        <NavRow
          icon="monitor"
          title="Devices"
          subtitle={itemSummary(item, configuration)}
          wrapSubtitle
          onPress={onDevices}
        />
      </List>
      <AbilityRows item={item} />
      <List inset>
        <NavRow icon="link" title="Source" subtitle={item.publisher} onPress={onSource} />
        <RemoveRow {...props} />
      </List>
    </>
  );
}
