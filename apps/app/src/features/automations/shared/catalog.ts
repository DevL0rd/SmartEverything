import type { AiChatRow, ProfileRow, SceneRow } from '@smarteverything/domain';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { useDevices, useIsOwner, useRows } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import type { Names } from './describe-names';

export interface Catalog {
  readonly devices: readonly Device[];
  readonly allDevices: readonly Device[];
  readonly scenes: readonly SceneRow[];
  readonly people: readonly ProfileRow[];
  readonly chats: readonly AiChatRow[];
  readonly wakeProfileId: string | null;
  readonly speakers: readonly Device[];
  readonly names: Names;
}

const WAKEABLE_KINDS: ReadonlySet<AiChatRow['kind']> = new Set(['chat', 'call']);

function useWakeProfileId(): string | null {
  const owner = useIsOwner();
  const active = useActiveProfile();
  return owner && active !== null ? active.id : null;
}

export function useCatalog(): Catalog {
  const devices = useDevices({ includeHidden: true });
  const scenes = useRows('scenes');
  const people = useProfiles();
  const chats = useRows('ai_chats').filter(
    (chat) => chat.archived_at === null && WAKEABLE_KINDS.has(chat.kind),
  );
  const wakeProfileId = useWakeProfileId();
  const cameras = useRows('cameras');
  return {
    devices: devices.filter((device) => !device.hidden),
    allDevices: devices,
    scenes,
    people,
    chats,
    wakeProfileId,
    speakers: devices.filter((device) =>
      cameras.some((camera) => camera.device_id === device.id && camera.two_way_audio),
    ),
    names: { devices, scenes, people, chats },
  };
}
