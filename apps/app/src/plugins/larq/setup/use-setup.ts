import { useEffect, useReducer, useState } from 'react';
import { useRouter } from 'expo-router';
import { Logger, background } from '@smarteverything/logging';
import {
  addBottleCandidateListener,
  bottlePermissions,
  readBottle,
  startBottleScan,
  stopBottleScan,
} from '../../../../modules/health-connect';
import { addBottle } from '../../../api/bottles';
import { href } from '../../../app-shell/hrefs';
import { rawErrorText } from '../../../format/errors';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { useActiveProfile } from '../../../store/people';
import { scanAndConnectPermitted } from '../data/bluetooth-permission';
import {
  informationOf,
  initialSetup,
  pickedCandidate,
  setupReducer,
  type SetupEvent,
  type SetupState,
} from './setup-model';

const log = new Logger('app.larq');

export type ReadStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'done' }
  | { readonly kind: 'failed'; readonly reason: string };

function useScan(active: boolean, dispatch: (event: SetupEvent) => void): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const subscription = addBottleCandidateListener((candidate) => {
      dispatch({ type: 'candidate', candidate });
    });
    background(startBottleScan(), 'larq.scan_failed');
    return (): void => {
      subscription.remove();
      background(stopBottleScan(), 'larq.scan_not_stopped');
    };
  }, [active, dispatch]);
}

function usePermissionProbe(dispatch: (event: SetupEvent) => void): void {
  useEffect(() => {
    background(
      bottlePermissions().then((answer) => {
        if (answer.scan && answer.connect) {
          dispatch({ type: 'permission', granted: true });
        }
      }),
      'larq.permission_unreadable',
    );
  }, [dispatch]);
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
    readBottle(chosen.address).then(
      (readout) => {
        setRead({ kind: 'done' });
        dispatch({ type: 'read', readout });
      },
      (error: unknown) => {
        log.warn('larq.read_failed', { reason: rawErrorText(error) });
        setRead({ kind: 'failed', reason: rawErrorText(error) });
      },
    );
  };
  return { read, readNow };
}

export interface Form {
  readonly name: string;
  readonly room: string;
}

function useAdd(state: SetupState, form: Form): MutationState & { readonly start: () => void } {
  const router = useRouter();
  const mutation = useMutationState();
  const chosen = pickedCandidate(state);
  const start = (): void => {
    if (chosen === null) {
      return;
    }
    mutation.run(
      () =>
        addBottle({
          serial: chosen.serial,
          name: form.name.trim() === '' ? 'Water bottle' : form.name.trim(),
          room: form.room === '' ? null : form.room,
          profileId: state.personId,
          body: state.body,
          filter: state.filter,
          dis: informationOf(state),
        }),
      {
        failure: 'The bottle could not be added',
        inline: true,
        onDone: (device) => {
          router.replace(href.device(device));
        },
      },
    );
  };
  return { ...mutation, start };
}

export interface Setup {
  readonly state: SetupState;
  readonly dispatch: (event: SetupEvent) => void;
  readonly read: ReadStatus;
  readonly form: Form;
  readonly setName: (name: string) => void;
  readonly setRoom: (room: string) => void;
  readonly allow: () => void;
  readonly readNow: () => void;
  readonly add: MutationState & { readonly start: () => void };
}

export function useSetup(): Setup {
  const profile = useActiveProfile();
  const [state, dispatch] = useReducer(setupReducer, null, () =>
    initialSetup(false, profile?.id ?? null),
  );
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  usePermissionProbe(dispatch);
  useScan(state.step === 'find', dispatch);
  const { read, readNow } = useReadNow(state, dispatch);
  const form = { name, room };
  const add = useAdd(state, form);
  return {
    state,
    dispatch,
    read,
    form,
    setName,
    setRoom,
    allow: (): void => {
      background(
        scanAndConnectPermitted().then((granted) => {
          dispatch({ type: 'permission', granted });
        }),
        'larq.permission_failed',
      );
    },
    readNow,
    add,
  };
}
