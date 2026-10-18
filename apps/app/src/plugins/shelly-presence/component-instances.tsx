import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { isShellyDynamic, type ShellyAction, type ShellyDevice } from '@smarteverything/shelly';
import { Button } from '../../components/button';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { ActionRunner, useActionDraft } from './action-runner';
import { recordOf, type JsonRecord } from './form-model';
import { actionAvailable } from './presence-operation';
import { RemoveButton } from './resource-list';
import { BthomeDiscovery } from './bthome-discovery';
import { ValueTree } from './result-view';
import { SettingsCard } from './settings-card';
import { rowsFor, settingCards, type SettingCard } from './settings-model';
import { useCanOperate } from './use-can-operate';
import { usePresenceSelection } from './use-presence-selection';

const DELETE_ACTIONS: Readonly<Partial<Record<string, ShellyAction>>> = {
  boolean: 'virtual_delete',
  number: 'virtual_delete',
  enum: 'virtual_delete',
  text: 'virtual_delete',
  button: 'virtual_delete',
  group: 'virtual_delete',
  bthomedevice: 'bthome_delete_device',
  bthomesensor: 'bthome_delete_sensor',
};

export function managedInstance(component: string): boolean {
  return component !== 'bthome' && isShellyDynamic(component);
}

function removal(
  card: SettingCard,
): { readonly action: ShellyAction; readonly params: JsonRecord } | null {
  const action = DELETE_ACTIONS[card.component];
  if (action === undefined) return null;
  return {
    action,
    params: action === 'virtual_delete' ? { key: card.instance.key } : { id: card.instance.id },
  };
}

function KnownObjects({
  sensor,
  id,
  back,
}: {
  readonly sensor: ShellyDevice;
  readonly id: number;
  readonly back: () => void;
}): ReactNode {
  const draft = useActionDraft();
  return (
    <ActionRunner
      sensor={sensor}
      action="bthome_known_objects"
      draft={draft}
      close={back}
      fixed={{ id }}
    />
  );
}

function Footer({
  sensor,
  card,
  close,
  readObjects,
}: {
  readonly sensor: ShellyDevice;
  readonly card: SettingCard;
  readonly close: () => void;
  readonly readObjects: () => void;
}): ReactNode {
  const canOperate = useCanOperate();
  const remove = removal(card);
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {card.component === 'bthomedevice' && actionAvailable(sensor, 'bthome_known_objects') ? (
          <Button label="Read known objects" variant="tonal" onPress={readObjects} />
        ) : null}
        <Button label="Back" variant="text" onPress={close} />
      </View>
      {remove === null || !canOperate(remove.action) ? null : (
        <RemoveButton sensor={sensor} remove={remove.action} params={remove.params} done={close} />
      )}
    </View>
  );
}

const NEW_DEVICE = 'device-new:';

function NewDevice({
  sensor,
  address,
  close,
}: {
  readonly sensor: ShellyDevice;
  readonly address: string;
  readonly close: () => void;
}): ReactNode {
  const draft = useActionDraft({ config: { addr: address } });
  return (
    <ActionRunner
      sensor={sensor}
      action="bthome_add_device"
      draft={draft}
      close={close}
      done={close}
    />
  );
}

function ComponentEditor({
  sensor,
  selected,
  close,
}: {
  readonly sensor: ShellyDevice;
  readonly selected: string;
  readonly close: () => void;
}): ReactNode {
  const [objects, setObjects] = useState(false);
  const rows = rowsFor(sensor, 'presence-components').filter((row) =>
    managedInstance(row.component),
  );
  const card = settingCards(sensor, rows, selected)[0];
  const status = sensor.components.find((component) => component.key === selected)?.status;
  if (card === undefined)
    return (
      <View className="gap-3">
        <Text>This component is no longer available.</Text>
        <Button label="Back" variant="text" onPress={close} />
      </View>
    );
  if (objects && card.instance.id !== null)
    return (
      <KnownObjects
        sensor={sensor}
        id={card.instance.id}
        back={() => {
          setObjects(false);
        }}
      />
    );
  return (
    <View className="gap-section-gap">
      <SettingsCard sensor={sensor} card={card} focus={undefined} />
      {status === null || status === undefined ? null : (
        <ValueTree value={recordOf(status) ?? null} />
      )}
      <Footer
        sensor={sensor}
        card={card}
        close={close}
        readObjects={() => {
          setObjects(true);
        }}
      />
    </View>
  );
}

export function ComponentInstances({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  const [selected, select] = usePresenceSelection('component');
  const close = (): void => {
    select(null);
  };
  if (selected?.startsWith(NEW_DEVICE) === true)
    return <NewDevice sensor={sensor} address={selected.slice(NEW_DEVICE.length)} close={close} />;
  if (selected !== null)
    return <ComponentEditor key={selected} sensor={sensor} selected={selected} close={close} />;
  const components = sensor.components.filter((component) => managedInstance(component.component));
  return (
    <View className="gap-section-gap">
      <BthomeDiscovery
        sensor={sensor}
        add={(address) => {
          select(`${NEW_DEVICE}${address}`);
        }}
      />
      {components.length === 0 ? null : (
        <List title="Components">
          {components.map((component) => {
            const name = recordOf(component.config)?.['name'];
            return (
              <NavRow
                key={component.key}
                title={typeof name === 'string' && name !== '' ? name : component.key}
                subtitle={component.component}
                onPress={() => {
                  select(component.key);
                }}
              />
            );
          })}
        </List>
      )}
    </View>
  );
}
