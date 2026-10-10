import type { ReactNode } from 'react';
import { SCENE_ACTIONS, type SceneRow } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useRows } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { runSceneNow, sceneIcon } from '../../automations';

function touches(scene: SceneRow, ids: ReadonlySet<string>): boolean {
  const actions = SCENE_ACTIONS.safeParse(scene.actions);
  return actions.success && actions.data.some((action) => ids.has(action.deviceId));
}

export function RoomScenes({ devices }: { readonly devices: readonly Device[] }): ReactNode {
  const ids = new Set(devices.map((device) => device.id));
  const scenes = useRows('scenes').filter((scene) => touches(scene, ids));
  if (scenes.length === 0) {
    return null;
  }
  return (
    <List title="Scenes" inset>
      {scenes.map((scene) => (
        <ListRow
          key={scene.id}
          title={scene.name}
          icon={sceneIcon(scene.icon)}
          iconTone="primary"
          trailing={
            <IconButton
              icon="play"
              label={`Run ${scene.name}`}
              variant="tonal"
              onPress={() => {
                runSceneNow(scene);
              }}
            />
          }
        />
      ))}
    </List>
  );
}
