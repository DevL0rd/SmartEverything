import { useState } from 'react';
import {
  API_ENDPOINTS as E,
  DEVICE_GROUP_INPUT,
  type DeviceGroupRow,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { confirmRemoval, removeGroup } from './remove-group';

const log = new Logger('app.device-groups');

export type EditorResult =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'saved'; readonly group: DeviceGroupRow }
  | { readonly kind: 'removed' };

export interface GroupDraft {
  readonly name: string;
  readonly members: readonly string[];
  readonly busy: boolean;
  readonly valid: boolean;
  readonly error: string | null;
  readonly setName: (name: string) => void;
  readonly setMembers: (members: readonly string[]) => void;
  readonly save: () => Promise<void>;
  readonly remove: () => Promise<void>;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : 'The group did not save.';
}

function useRunner(
  op: { readonly groupId: string | null; readonly members: number; readonly nameLength: number },
  onClose: (result: EditorResult) => void,
): {
  readonly busy: boolean;
  readonly error: string | null;
  readonly run: (action: () => Promise<EditorResult>) => Promise<void>;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<EditorResult>): Promise<void> => {
    setBusy(true);
    setError(null);
    const startedAt = Date.now();
    try {
      const result = await action();
      log.info('group_edit.saved', { ...op, durationMs: Date.now() - startedAt });
      onClose(result);
    } catch (failure) {
      log.warn('group_edit.failed', {
        ...op,
        durationMs: Date.now() - startedAt,
        errorName: failure instanceof Error ? failure.name : typeof failure,
      });
      setError(messageOf(failure));
      notify({ message: 'The device group did not save', error: failure, tone: 'critical' });
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function useGroupDraft({
  group,
  initialMembers,
  automations,
  onClose,
}: {
  readonly group: DeviceGroupRow | null;
  readonly initialMembers: readonly string[];
  readonly automations: readonly string[];
  readonly onClose: (result: EditorResult) => void;
}): GroupDraft {
  const [name, setName] = useState(group?.name ?? '');
  const [members, setMembers] = useState<readonly string[]>(group?.device_ids ?? initialMembers);
  const input = DEVICE_GROUP_INPUT.safeParse({ name, device_ids: members });
  const op = { groupId: group?.id ?? null, members: members.length, nameLength: name.length };
  const { busy, error, run } = useRunner(op, onClose);
  const save = async (): Promise<void> => {
    if (!input.success || busy) return;
    await run(async () => {
      const saved =
        group === null
          ? await api().call(E.createDeviceGroup, { body: input.data })
          : await api().call(E.updateDeviceGroup, {
              params: { groupId: group.id },
              body: input.data,
            });
      return { kind: 'saved', group: saved };
    });
  };
  const remove = async (): Promise<void> => {
    if (group === null || busy || !(await confirmRemoval(group, automations))) return;
    await run(async () => {
      await removeGroup(group);
      return { kind: 'removed' };
    });
  };
  return { name, setName, members, setMembers, busy, valid: input.success, error, save, remove };
}
