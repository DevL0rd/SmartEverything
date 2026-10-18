import { useMemo, useRef, useState } from 'react';
import {
  API_ENDPOINTS as E,
  type DeviceTarget,
  memberOutcomes,
  retryable,
  type HsvColor,
  type MemberOutcome,
  type TargetChange,
  type TargetState,
} from '@smarteverything/domain';
import { api } from '../../api/transport';
import { notify } from '../../components/toast-store';
import type { Device } from '../../store/state';
import { useEntityStore } from '../../store/store-context';
import { settledOutcomes } from './command-outcomes';
import {
  commandFields,
  logCommandAccepted,
  logCommandFailed,
  logCommandSettled,
  logCommandStarted,
} from './master-log';
import { memberNoun, powerTurnsOn } from './group-summary';
import { shownOutcomes, unresolvedOutcomes } from './model/outcomes';
import type { MemberPower } from './use-target-state';
import { trailingThrottle } from './master-throttle';
import { allLights } from './use-target-members';
import { background } from '@smarteverything/logging';

type MasterPhase = 'live' | 'commit';

export interface Master {
  readonly outcomes: readonly MemberOutcome[];
  readonly togglePower: () => void;
  readonly setPower: (on: boolean) => void;
  readonly setLevel: (percent: number, phase: MasterPhase) => void;
  readonly setWhite: (kelvin: number, phase: MasterPhase) => void;
  readonly setColour: (colour: HsvColor, phase: MasterPhase) => void;
  readonly retry: () => void;
  readonly dismiss: () => void;
}

type Change = Pick<TargetChange, 'capability' | 'value' | 'scale' | 'scope'>;

type Submit = (to: DeviceTarget, change: Change, report: boolean) => Promise<boolean>;

type SetOutcomes = (outcomes: readonly MemberOutcome[]) => void;

export function useOutcomes(): readonly [readonly MemberOutcome[], SetOutcomes] {
  return useState<readonly MemberOutcome[]>([]);
}

export function useSubmit(members: readonly Device[], setOutcomes: SetOutcomes): Submit {
  const store = useEntityStore();
  return useMemo(() => {
    return async (to: DeviceTarget, change: Change, report: boolean): Promise<boolean> => {
      const startedAt = Date.now();
      const base = commandFields(to.kind, change, members.length, report);
      logCommandStarted(base);
      try {
        const response = await api().call(E.sendTargetCommands, {
          body: { target: to, ...change },
        });
        logCommandAccepted(
          base,
          { commands: response.commands.length, skipped: response.skipped.length },
          startedAt,
        );
        if (!report) return true;
        const skipped = memberOutcomes(response.skipped, []);
        setOutcomes(shownOutcomes([...skipped, ...memberOutcomes([], response.commands)]));
        const settled = await settledOutcomes(store, response.commands);
        const shown = shownOutcomes([...skipped, ...settled]);
        setOutcomes(shown);
        logCommandSettled(
          base,
          {
            commands: settled.length,
            failedCommands: settled.filter((outcome) => outcome.status === 'failed').length,
            issues: shown.length,
          },
          startedAt,
        );
        return shown.length === 0;
      } catch (error) {
        logCommandFailed(base, error, startedAt);
        notify({
          message: `The ${memberNoun(allLights(members))}s weren’t changed`,
          error,
          tone: 'critical',
        });
        return false;
      }
    };
  }, [store, members, setOutcomes]);
}

interface Changes {
  readonly change: (next: Change, phase: MasterPhase) => void;
  readonly power: (on: boolean) => void;
  readonly retry: (deviceIds: readonly string[]) => void;
}

function useChanges(target: DeviceTarget, lit: number, submit: Submit, clear: () => void): Changes {
  const last = useRef<Change | null>(null);
  const scope = useRef<'all' | 'on' | null>(null);
  const throttle = useMemo(
    () =>
      trailingThrottle<Change>((next, committed) => {
        background(submit(target, next, committed), 'use_master.submit_failed');
      }),
    [submit, target],
  );
  return {
    change: (next: Change, phase: MasterPhase): void => {
      last.current = next;
      if (scope.current === null) {
        scope.current = lit === 0 ? 'all' : 'on';
        clear();
        if (lit === 0)
          background(
            submit(target, { capability: 'power', value: true }, false),
            'use_master.submit_failed',
          );
      }
      const scoped = { ...next, scope: scope.current };
      if (phase === 'live') {
        throttle.push(scoped);
        return;
      }
      scope.current = null;
      throttle.commit(scoped);
    },
    power: (on: boolean): void => {
      const next: Change = { capability: 'power', value: on };
      last.current = next;
      clear();
      background(submit(target, next, true), 'use_master.submit_failed');
    },
    retry: (deviceIds: readonly string[]): void => {
      const previous = last.current;
      if (previous === null || deviceIds.length === 0) return;
      clear();
      background(
        submit({ kind: 'devices', deviceIds: [...deviceIds] }, previous, true),
        'use_master.submit_failed',
      );
    },
  };
}

export function useMaster(
  target: DeviceTarget,
  members: readonly Device[],
  state: TargetState,
  powers: Readonly<Record<string, MemberPower>>,
): Master {
  const [recorded, setOutcomes] = useOutcomes();
  const outcomes = useMemo(() => unresolvedOutcomes(recorded, powers), [recorded, powers]);
  const submit = useSubmit(members, setOutcomes);
  const { change, power, retry } = useChanges(target, state.on, submit, () => {
    setOutcomes([]);
  });
  return {
    outcomes,
    togglePower: (): void => {
      power(powerTurnsOn(state));
    },
    setPower: power,
    setLevel: (percent: number, phase: MasterPhase): void => {
      change({ capability: 'brightness', value: percent, scale: 'percent' }, phase);
    },
    setWhite: (kelvin: number, phase: MasterPhase): void => {
      change({ capability: 'color_temperature', value: kelvin }, phase);
    },
    setColour: (colour: HsvColor, phase: MasterPhase): void => {
      change({ capability: 'color', value: colour }, phase);
    },
    retry: (): void => {
      retry(retryable(outcomes));
    },
    dismiss: (): void => {
      setOutcomes([]);
    },
  };
}
