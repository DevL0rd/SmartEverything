import { useEffect, useReducer, useState } from 'react';
import { useRouter } from 'expo-router';
import type { BrushBrand } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import {
  addBrushCandidateListener,
  associateBrush,
  bondBrush,
  dumpBrush,
  startBrushScan,
  stopBrushScan,
  brushPermissions,
} from '../../../../modules/health-connect';
import { href } from '../../../app-shell/hrefs';
import { addBrush } from '../../../api/toothbrushes';
import { rawErrorText } from '../../../format/errors';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { brandUi } from '../brands';
import { scanAndConnectPermitted } from '../data/bluetooth-permission';
import {
  canAdd,
  initialSetup,
  pickedCandidate,
  setupReducer,
  type SetupEvent,
  type SetupState,
} from '../model/setup-model';

const log = new Logger('app.toothbrush');

export type Progress =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'done' };

function useScan(active: boolean, brand: BrushBrand, dispatch: (event: SetupEvent) => void): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const subscription = addBrushCandidateListener((candidate) => {
      dispatch({ type: 'candidate', candidate });
    });
    background(startBrushScan([brand]), 'toothbrush.scan_failed');
    return (): void => {
      subscription.remove();
      background(stopBrushScan(), 'toothbrush.scan_not_stopped');
    };
  }, [active, brand, dispatch]);
}

function usePermissionProbe(dispatch: (event: SetupEvent) => void): void {
  useEffect(() => {
    background(
      brushPermissions().then((answer) => {
        if (answer.scan && answer.connect) {
          dispatch({ type: 'permission', granted: true });
        }
      }),
      'toothbrush.permission_unreadable',
    );
  }, [dispatch]);
}

function useTask(): {
  readonly progress: Progress;
  readonly run: (work: () => Promise<void>) => void;
} {
  const [progress, setProgress] = useState<Progress>({ kind: 'idle' });
  const run = (work: () => Promise<void>): void => {
    setProgress({ kind: 'working' });
    work().then(
      () => {
        setProgress({ kind: 'done' });
      },
      (error: unknown) => {
        log.warn('toothbrush.setup_step_failed', { reason: rawErrorText(error) });
        setProgress({ kind: 'failed', reason: rawErrorText(error) });
      },
    );
  };
  return { progress, run };
}

export interface Setup {
  readonly state: SetupState;
  readonly dispatch: (event: SetupEvent) => void;
  readonly choose: Progress;
  readonly pair: Progress;
  readonly verify: Progress;
  readonly name: string;
  readonly room: string;
  readonly setName: (name: string) => void;
  readonly setRoom: (room: string) => void;
  readonly allow: () => void;
  readonly chooseNow: () => void;
  readonly pairNow: () => void;
  readonly verifyNow: () => void;
  readonly add: MutationState & { readonly start: () => void };
}

function useAdd(
  state: SetupState,
  form: { readonly name: string; readonly room: string },
): MutationState & { readonly start: () => void } {
  const router = useRouter();
  const mutation = useMutationState();
  const start = (): void => {
    const { dump } = state;
    const address = state.associated ?? state.picked;
    if (dump === null || address === null || !canAdd(state)) {
      return;
    }
    mutation.run(
      () =>
        addBrush({
          name: form.name.trim() === '' ? dump.name : form.name.trim(),
          address,
          room: form.room === '' ? null : form.room,
          profileId: null,
          modelKey: state.modelKey,
          bonded: state.bonded,
          gatt: dump,
        }),
      {
        failure: 'The toothbrush could not be added',
        inline: true,
        onDone: (device) => {
          router.replace(href.device(device));
        },
      },
    );
  };
  return { ...mutation, start };
}

type LinkSteps = Pick<Setup, 'choose' | 'pair' | 'verify' | 'chooseNow' | 'pairNow' | 'verifyNow'>;

function useLinkSteps(
  brand: BrushBrand,
  state: SetupState,
  dispatch: (event: SetupEvent) => void,
): LinkSteps {
  const choose = useTask();
  const pair = useTask();
  const verify = useTask();
  const chosen = pickedCandidate(state);
  const address = state.associated ?? state.picked;
  return {
    choose: choose.progress,
    pair: pair.progress,
    verify: verify.progress,
    chooseNow: (): void => {
      if (chosen === null) {
        return;
      }
      choose.run(async () => {
        dispatch({ type: 'associated', address: await associateBrush(chosen.stack) });
      });
    },
    pairNow: (): void => {
      if (address === null) {
        return;
      }
      pair.run(async () => {
        if (await bondBrush(address)) {
          dispatch({ type: 'bonded' });
        }
      });
    },
    verifyNow: (): void => {
      if (address === null || chosen === null) {
        return;
      }
      verify.run(async () => {
        const result = await dumpBrush(address, chosen.name, brand);
        dispatch({ type: 'dumped', dump: result.gatt, bonded: result.bonded });
      });
    },
  };
}

export function useSetup(brand: BrushBrand): Setup {
  const [state, dispatch] = useReducer(setupReducer, brand, (chosen) =>
    initialSetup(false, brandUi(chosen).setupSteps.steps),
  );
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  usePermissionProbe(dispatch);
  useScan(state.step === 'wake', brand, dispatch);
  const steps = useLinkSteps(brand, state, dispatch);
  const add = useAdd(state, { name, room });
  return {
    ...steps,
    state,
    dispatch,
    name: name === '' ? (state.dump?.name ?? pickedCandidate(state)?.name ?? '') : name,
    room,
    setName,
    setRoom,
    allow: (): void => {
      background(
        scanAndConnectPermitted().then((granted) => {
          dispatch({ type: 'permission', granted });
        }),
        'toothbrush.permission_failed',
      );
    },
    add,
  };
}
