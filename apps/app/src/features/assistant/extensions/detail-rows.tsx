import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
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
import { itemSummary } from './status';
import { platformLabel } from './items';
import type { ExtensionActions } from './change';
import { background } from '@smarteverything/logging';

interface Props {
  readonly item: HarnessExtensionItem;
  readonly configuration: AiHarnessConfigurationCatalogue;
  readonly actions: ExtensionActions;
  readonly onDevices: () => void;
  readonly onSource: () => void;
}

function SelectionRows({ item, actions }: Pick<Props, 'item' | 'actions'>): ReactNode {
  const owner = useIsOwner();
  if (!owner)
    return (
      <Text variant="footnote" tone="variant">
        Managed by the home owner
      </Text>
    );
  return (
    <>
      <List inset>
        <SwitchRow
          icon="power"
          title="On"
          subtitle="Saved choice · devices apply it after current sessions finish"
          value={item.enabled}
          disabled={!actions.allowed}
          onChange={(enabled) => {
            actions.setEnabled(item, enabled);
          }}
        />
      </List>
      <ConfirmRow item={item} actions={actions} />
    </>
  );
}

function ConfirmRow({ item, actions }: Pick<Props, 'item' | 'actions'>): ReactNode {
  if (!item.executes || item.confirmed) return null;
  return (
    <List inset>
      <ActionRow
        icon="shield"
        title="Allow it to run programs"
        subtitle="Its hooks or servers run on your computers. Allow only a source you trust."
        wrapSubtitle
        disabled={!actions.allowed}
        onPress={() => {
          background(
            confirm({
              title: `Allow ${item.name} to run programs?`,
              body: 'It can start programs on your computers while you chat. Allow it only if you trust the source.',
              confirmLabel: 'Allow',
            }).then((accepted) => {
              if (accepted) actions.confirmExecutes(item);
            }),
            'detail_rows.confirm_failed',
          );
        }}
      />
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
          title="SmartEverything"
          subtitle={
            item.platforms.length === 0
              ? 'Compatibility not verified'
              : item.platforms.map(platformLabel).join(', ')
          }
        />
        {item.requirements.map((title) => (
          <ListRow key={title} icon="shield" title={title} />
        ))}
      </List>
    </>
  );
}

function RemoveRow({ item, actions }: Pick<Props, 'item' | 'actions'>): ReactNode {
  const owner = useIsOwner();
  const router = useRouter();
  if (!owner || item.kind === 'builtin') return null;
  return (
    <ActionRow
      icon="trash"
      title={`Remove ${item.name}`}
      destructive
      disabled={!actions.allowed}
      onPress={() => {
        background(
          confirm({
            title: `Remove ${item.name}?`,
            body: 'Its tools and skills are removed from the assistant.',
            confirmLabel: item.kind === 'skill' ? 'Remove skill' : 'Remove extension',
            tone: 'destructive',
          }).then(async (accepted) => {
            if (accepted && (await actions.remove(item))) router.back();
          }),
          'detail_rows.confirm_failed',
        );
      }}
    />
  );
}

export function ExtensionDetailRows(props: Props): ReactNode {
  const { item, configuration, onDevices, onSource } = props;
  return (
    <>
      <SelectionRows item={item} actions={props.actions} />
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
        <RemoveRow item={item} actions={props.actions} />
      </List>
    </>
  );
}
