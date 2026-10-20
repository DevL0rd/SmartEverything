import type { TreadmillGattDump } from '@smarteverything/domain';
import { useEffect, useReducer, useState } from 'react';
import { useRouter } from 'expo-router';
import { Logger, background } from '@smarteverything/logging';
import {
  addTreadmillCandidateListener,
  associateTreadmill,
  dumpTreadmill,
  startTreadmillScan,
  stopTreadmillScan,
  treadmillPermissions,
} from '../../../../modules/health-connect';
import { addTreadmill } from '../../../api/treadmills';
import { scanAndConnectPermitted } from '../data/bluetooth-permission';
import { href } from '../../../app-shell/hrefs';
import { rawErrorText } from '../../../format/errors';
import { useMutationState, type MutationState } from '../../../store/mutation';
import {
  initialSetup,
  pickedCandidate,
  setupReducer,
  type SetupEvent,
  type SetupState,
} from './setup-model';
import type { ReadStatus } from './read-name-steps';

const log = new Logger('app.treadmill');

function useScan(active: boolean, dispatch: (event: SetupEvent) => void): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const subscription = addTreadmillCandidateListener((candidate) => {
      dispatch({ type: 'candidate', candidate });
    });
    background(startTreadmillScan(), 'treadmill.scan_failed');
    return (): void => {
      subscription.remove();
      background(stopTreadmillScan(), 'treadmill.scan_not_stopped');
    };
  }, [active, dispatch]);
}

function usePermissionProbe(dispatch: (event: SetupEvent) => void): void {
  useEffect(() => {
    background(
      treadmillPermissions().then((answer) => {
        if (answer.scan && answer.connect) {
          dispatch({ type: 'permission', granted: true });
        }
      }),
      'treadmill.permission_unreadable',
    );
  }, [dispatch]);
}

export interface Setup {
  readonly state: SetupState;
  readonly dispatch: (event: SetupEvent) => void;
  readonly read: ReadStatus;
  readonly name: string;
  readonly room: string;
  readonly setName: (name: string) => void;
  readonly setRoom: (room: string) => void;
  readonly allow: () => void;
  readonly readNow: () => void;
  readonly add: MutationState & { readonly start: () => void };
}

function useReadNow(
  state: SetupState,
  dispatch: (event: SetupEvent) => void,
): { readonly read: ReadStatus; readonly readNow: () => void } {
  const [read, setRead] = useState<ReadStatus>({ kind: 'idle' });
  const chosen = pickedCandidate(state);
  const readNow = (): void => {
    if (chosen === null) {
      return;
    }
    setRead({ kind: 'reading' });
    dumpTreadmill(chosen.address, chosen.name).then(
      (dump) => {
        setRead({ kind: 'done', dump });
        dispatch({ type: 'dumped', dump });
      },
      (error: unknown) => {
        log.warn('treadmill.read_failed', { reason: rawErrorText(error) });
        setRead({ kind: 'failed', reason: rawErrorText(error) });
      },
    );
  };
  return { read, readNow };
}

function useAdd(
  state: SetupState,
  form: { readonly name: string; readonly room: string },
): MutationState & { readonly start: () => void } {
  const router = useRouter();
  const mutation = useMutationState();
  const chosen = pickedCandidate(state);
  const start = (): void => {
    const dump: TreadmillGattDump | null = state.dump;
    if (chosen === null || dump === null) {
      return;
    }
    mutation.run(
      () =>
        addTreadmill({
          name: form.name.trim() === '' ? chosen.name : form.name.trim(),
          address: chosen.address,
          room: form.room === '' ? null : form.room,
          gatt: dump,
        }),
      {
        failure: 'The treadmill could not be added',
        label: 'Add treadmill',
        inline: true,
        onDone: (device) => {
          background(associateTreadmill(chosen.address), 'treadmill.companion_failed');
          router.replace(href.device(device));
        },
      },
    );
  };
  return { ...mutation, start };
}

function allowPermissions(dispatch: (event: SetupEvent) => void): void {
  background(
    scanAndConnectPermitted().then((granted) => {
      dispatch({ type: 'permission', granted });
    }),
    'treadmill.permission_failed',
  );
}

export function useSetup(): Setup {
  const [state, dispatch] = useReducer(setupReducer, false, initialSetup);
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  usePermissionProbe(dispatch);
  useScan(state.step === 'scan', dispatch);
  const { read, readNow } = useReadNow(state, dispatch);
  const add = useAdd(state, { name, room });
  return {
    state,
    dispatch,
    read,
    name: name === '' ? (pickedCandidate(state)?.name ?? '') : name,
    room,
    setName,
    setRoom,
    allow: (): void => {
      allowPermissions(dispatch);
    },
    readNow,
    add,
  };
}
