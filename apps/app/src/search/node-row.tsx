import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SearchEntry } from '@smarteverything/domain';
import { Button } from '../components/button';
import type { IconName } from '../components/icon';
import { IconButton } from '../components/icon-button';
import { ListRow } from '../components/list-row';
import { Switch } from '../components/switch';
import { joinParts } from '../format/text';
import { runSceneNow, toggleAutomation } from '../features/automations';
import {
  CapabilityRow,
  PowerToggle,
  offlineReason,
  stateLine,
  useDeviceModel,
} from '../features/devices';
import { useDeviceValues } from '../store/selectors';
import { inlineOf, type InlineAction } from './actions';
import { deviceIdOf, type SearchCatalogue } from './catalogue';
import { titleOf, type NodeItem, type ResultNode } from './nodes';
import type { NamedDevice } from './sources';

interface NodeRowProps {
  readonly node: ResultNode;
  readonly depth: number;
  readonly parent: string | null;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly catalogue: SearchCatalogue;
  readonly onOpen: (node: ResultNode) => void;
  readonly onToggle: (key: string, expanded: boolean) => void;
}

function ExpandButton(props: NodeRowProps): ReactNode {
  if (!props.expandable) {
    return null;
  }
  const title = titleOf(props.node.item);
  return (
    <IconButton
      icon={props.expanded ? 'chevronDown' : 'chevronRight'}
      label={props.expanded ? `Collapse ${title}` : `Expand ${title}`}
      onPress={() => {
        props.onToggle(props.node.key, props.expanded);
      }}
    />
  );
}

function InlineControl({ action }: { readonly action: InlineAction | null }): ReactNode {
  switch (action?.kind) {
    case 'scene':
      return (
        <Button
          label="Run"
          icon="play"
          variant="tonal"
          onPress={() => {
            runSceneNow({ id: action.sceneId, name: action.name });
          }}
        />
      );
    case 'automation':
      return (
        <Switch
          label={action.enabled ? 'Pause automation' : 'Turn automation on'}
          value={action.enabled}
          onChange={(enabled) => {
            toggleAutomation(action.automationId, enabled);
          }}
        />
      );
    case 'power':
      return <PowerToggle device={action.device} />;
    case 'command':
    case undefined:
      return null;
  }
}

function Split({
  row,
  trailing,
}: {
  readonly row: ReactNode;
  readonly trailing: ReactNode;
}): ReactNode {
  return (
    <View className="flex-row items-center">
      <View className="min-w-0 flex-1">{row}</View>
      <View className="flex-row items-center gap-1 pr-2">{trailing}</View>
    </View>
  );
}

function Trailing(props: NodeRowProps): ReactNode {
  return (
    <>
      <InlineControl action={inlineOf(props.node, props.catalogue)} />
      <ExpandButton {...props} />
    </>
  );
}

function useDeviceLine(named: NamedDevice): string {
  const model = useDeviceModel(named.device);
  const values = useDeviceValues(named.device.id);
  return joinParts([named.room, stateLine(model, values)]);
}

function DeviceNode(props: NodeRowProps & { readonly named: NamedDevice }): ReactNode {
  const subtitle = useDeviceLine(props.named);
  return (
    <Split
      row={
        <ListRow
          title={props.named.name}
          titleHighlight={props.node.range}
          subtitle={subtitle}
          icon={props.catalogue.icons.get(props.node.key) ?? 'cpu'}
          onPress={() => {
            props.onOpen(props.node);
          }}
        />
      }
      trailing={<Trailing {...props} />}
    />
  );
}

function ownIcon(props: NodeRowProps & { readonly entry: SearchEntry }): IconName | null {
  if (props.entry.group !== 'device' && deviceIdOf(props.entry) !== null) {
    return null;
  }
  const icon = props.catalogue.icons.get(props.node.key) ?? 'search';
  const inherited = props.parent === null ? undefined : props.catalogue.icons.get(props.parent);
  return icon === inherited ? null : icon;
}

function EntryNode(
  props: NodeRowProps & { readonly entry: SearchEntry; readonly title: string },
): ReactNode {
  const detail = props.depth === 0 && props.entry.detail !== '' ? props.entry.detail : undefined;
  const icon = ownIcon(props);
  return (
    <Split
      row={
        <ListRow
          title={props.title}
          titleHighlight={props.node.range}
          {...(detail === undefined ? {} : { subtitle: detail })}
          {...(icon === null ? {} : { icon })}
          onPress={() => {
            props.onOpen(props.node);
          }}
        />
      }
      trailing={<Trailing {...props} />}
    />
  );
}

function DeviceChild(
  props: NodeRowProps & { readonly item: Exclude<NodeItem, { kind: 'entry' }> },
): ReactNode {
  const named = props.catalogue.devices.get(props.item.deviceId);
  if (named === undefined) {
    return null;
  }
  const reason = named.device.online ? null : offlineReason(named.name);
  if (props.item.kind === 'capability') {
    return (
      <CapabilityRow
        device={named.device}
        presented={props.item.presented}
        reason={reason}
        highlight={props.node.range}
      />
    );
  }
  const run = (): void => {
    props.onOpen(props.node);
  };
  return (
    <Split
      row={
        <ListRow
          title={props.item.phrase}
          titleHighlight={props.node.range}
          {...(reason === null ? {} : { subtitle: reason })}
          disabled={reason !== null}
          onPress={run}
        />
      }
      trailing={<Button label="Run" variant="tonal" disabled={reason !== null} onPress={run} />}
    />
  );
}

export function NodeRow(props: NodeRowProps): ReactNode {
  const { item } = props.node;
  if (item.kind !== 'entry') {
    return <DeviceChild {...props} item={item} />;
  }
  const named =
    item.entry.group === 'device' && 'deviceId' in item.entry.open
      ? props.catalogue.devices.get(item.entry.open.deviceId)
      : undefined;
  return named === undefined ? (
    <EntryNode {...props} entry={item.entry} title={item.title} />
  ) : (
    <DeviceNode {...props} named={named} />
  );
}
