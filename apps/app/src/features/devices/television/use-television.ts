import { useState } from 'react';
import {
  TV_KEY_LABELS,
  TV_KEY_REASON_TEXT,
  type JsonValue,
  type TvKey,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { selectionTick, warningBuzz } from '../../../platform/haptics';
import { readControl } from '../../../store/control';
import { sameJson } from '../../../store/same-json';
import { deviceValuesOf, type Device, type StoreState } from '../../../store/state';
import { useLedger, useStoreSelector } from '../../../store/store-context';
import { televisionLine } from './state-line';
import { televisionView, type TvView } from './view';

export interface TvNote {
  readonly text: string;
  readonly tone: 'info' | 'critical';
  readonly wake: boolean;
}

export interface Television {
  readonly device: Device;
  readonly name: string;
  readonly view: TvView;
  readonly line: string;
  readonly note: TvNote | null;
  readonly flash: TvKey | null;
  readonly press: (key: TvKey, onLost?: () => void) => void;
  readonly pressAll: (keys: readonly TvKey[]) => void;
  readonly togglePower: () => void;
  readonly explain: (text: string) => void;
}

const LOST_BUTTON: TvNote = {
  text: "That button didn't reach the TV",
  tone: 'critical',
  wake: false,
};

const NOT_ON: TvNote = {
  text: "It didn't turn on",
  tone: 'critical',
  wake: false,
};

function lockNote(key: TvKey, view: TvView): TvNote | null {
  const reason = view.locks[key];
  if (reason === undefined) {
    return null;
  }
  return {
    text: `${TV_KEY_LABELS[key]}: ${TV_KEY_REASON_TEXT[reason]}`,
    tone: 'info',
    wake: reason === 'tv_off' && view.mode === 'standby',
  };
}

interface Notes {
  readonly raised: TvNote | null;
  readonly flash: TvKey | null;
  readonly press: (key: TvKey, onLost?: () => void) => void;
  readonly pressAll: (keys: readonly TvKey[]) => void;
  readonly togglePower: () => void;
  readonly explain: (text: string) => void;
}

type Send = (capability: string, value: JsonValue) => Promise<boolean>;

interface Sender {
  readonly raised: TvNote | null;
  readonly flash: TvKey | null;
  readonly setRaised: (note: TvNote | null) => void;
  readonly setFlash: (key: TvKey | null) => void;
  readonly send: (key: TvKey, onLost: (() => void) | undefined) => Promise<void>;
  readonly sendInOrder: (keys: readonly TvKey[]) => Promise<void>;
}

function useSender(send: Send): Sender {
  const [raised, setRaised] = useState<TvNote | null>(null);
  const [flash, setFlash] = useState<TvKey | null>(null);
  const lose = (key: TvKey): void => {
    setFlash(key);
    warningBuzz();
    setRaised({ ...LOST_BUTTON, text: `${TV_KEY_LABELS[key]} didn't reach the TV` });
  };
  return {
    raised,
    flash,
    setRaised,
    setFlash,
    send: async (key, onLost): Promise<void> => {
      if (!(await send('remote_key', key))) {
        onLost?.();
        lose(key);
      }
    },
    sendInOrder: async (keys): Promise<void> => {
      for (const key of keys) {
        if (!(await send('remote_key', key))) {
          lose(key);
          return;
        }
      }
    },
  };
}

function useNotes(device: Device, view: TvView, send: Send): Notes {
  const sender = useSender(send);
  const { raised, flash, setRaised, setFlash, sendInOrder } = sender;
  const attempt = (key: TvKey, run: () => void, onLost?: () => void): void => {
    const locked = lockNote(key, view);
    setRaised(locked);
    if (locked === null) {
      selectionTick();
      setFlash(null);
      run();
    } else {
      onLost?.();
    }
  };
  return {
    raised,
    flash,
    press: (key, onLost): void => {
      attempt(
        key,
        () => {
          background(sender.send(key, onLost), 'television.key_failed', {
            deviceId: device.id,
            key,
          });
        },
        onLost,
      );
    },
    pressAll: (keys): void => {
      selectionTick();
      setFlash(null);
      setRaised(null);
      background(sendInOrder(keys), 'television.keys_failed', { deviceId: device.id });
    },
    togglePower: (): void => {
      attempt('power', () => {
        background(send('power', view.mode !== 'on'), 'television.power_failed', {
          deviceId: device.id,
        });
      });
    },
    explain: (text): void => {
      setRaised({ text, tone: 'info', wake: false });
    },
  };
}

interface Snapshot {
  readonly view: TvView;
  readonly lost: boolean;
  readonly notOn: boolean;
}

function snapshotOf(state: StoreState, device: Device): Snapshot {
  const power = readControl(state, device.id, 'power');
  const remote = readControl(state, device.id, 'remote_key');
  const turningOn =
    power.entry !== null &&
    power.entry.failure === null &&
    (power.entry.value ?? power.reported) === true;
  const view = televisionView(device, deviceValuesOf(state, device.id), {
    turningOn,
    settings: state.tables.television_settings.byId[device.id] ?? null,
  });
  return {
    view,
    lost: (remote.entry?.failure ?? null) !== null,
    notOn: (power.entry?.failure ?? null) !== null && view.mode !== 'on',
  };
}

export function useTelevision(device: Device): Television {
  const ledger = useLedger();
  const { view, lost, notOn } = useStoreSelector((state) => snapshotOf(state, device), sameJson, [
    device,
  ]);
  const notes = useNotes(device, view, async (capability, value) => {
    return (await ledger.send(device, capability, value)).sent;
  });
  return {
    device,
    name: device.label,
    view,
    line: televisionLine(view),
    note: notes.raised ?? (lost ? LOST_BUTTON : notOn ? NOT_ON : null),
    flash: notes.flash,
    press: notes.press,
    pressAll: notes.pressAll,
    togglePower: notes.togglePower,
    explain: notes.explain,
  };
}
