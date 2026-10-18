import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { shellyOperation, type ShellyAction, type ShellyDevice } from '@smarteverything/shelly';
import { Button } from '../../components/button';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { ActionRunner, useActionDraft } from './action-runner';
import { actionAvailable } from './presence-operation';
import type { ItemEditorContext, ResourceItem } from './resource-list';
import { ScriptSource } from './script-source';

const SCRIPT_ACTIONS = [
  'script_config',
  'script_start',
  'script_stop',
  'script_eval',
  'script_delete',
] as const satisfies readonly ShellyAction[];

function ScriptAction({
  sensor,
  item,
  action,
  back,
  done,
}: {
  readonly sensor: ShellyDevice;
  readonly item: ResourceItem;
  readonly action: ShellyAction;
  readonly back: () => void;
  readonly done: () => void;
}): ReactNode {
  const draft = useActionDraft(action === 'script_config' ? item.initial : {});
  return (
    <ActionRunner
      sensor={sensor}
      action={action}
      draft={draft}
      close={back}
      fixed={item.fixed}
      done={done}
      {...(action === 'script_config' ? { wrap: 'config' } : {})}
    />
  );
}

export function ScriptEditor({ sensor, item, close, reload }: ItemEditorContext): ReactNode {
  const [action, setAction] = useState<ShellyAction | null>(null);
  const id = item.fixed['id'];
  if (action !== null)
    return (
      <ScriptAction
        sensor={sensor}
        item={item}
        action={action}
        back={() => {
          setAction(null);
        }}
        done={() => {
          reload();
          if (action === 'script_delete') close();
        }}
      />
    );
  return (
    <View className="gap-section-gap">
      {typeof id === 'number' ? <ScriptSource sensor={sensor} id={id} /> : null}
      <List title={item.title}>
        {SCRIPT_ACTIONS.filter((entry) => actionAvailable(sensor, entry)).map((entry) => (
          <NavRow
            key={entry}
            title={shellyOperation(entry).title}
            onPress={() => {
              setAction(entry);
            }}
          />
        ))}
      </List>
      <Button label="Back" variant="text" onPress={close} />
    </View>
  );
}
