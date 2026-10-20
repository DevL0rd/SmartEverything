import type {
  MachineActionSupport,
  MachineOpenTarget,
  MachinePermissionState,
} from '@smarteverything/domain';
import { NodeFailureError } from '../../node-failure';
import type { SessionAgent } from '../../session-agent/session-agent';
import type { MachineControl, MachineReport, StopWatching } from '../session-controls';
import type { MachineName } from './unsupported';

const NO_APP = 'The SmartEverything app is not running on this computer.';

export interface MachineFacts {
  readonly agent: boolean;
  readonly openNeedsApp: boolean;
  readonly permissions: readonly MachinePermissionState[];
}

function ready(action: MachineActionSupport['action']): MachineActionSupport {
  return { action, state: 'ready' };
}

function unsupported(action: MachineActionSupport['action'], reason: string): MachineActionSupport {
  return { action, state: 'unsupported', reason };
}

function viaApp(
  facts: MachineFacts,
  action: MachineActionSupport['action'],
  what: string,
): MachineActionSupport {
  return facts.agent ? ready(action) : unsupported(action, `${what} needs it. ${NO_APP}`);
}

function screenshot(facts: MachineFacts): MachineActionSupport {
  const denied = facts.permissions.some(
    (state) => state.permission === 'mac_screen_recording' && !state.granted,
  );
  if (!facts.agent || !denied) return viaApp(facts, 'screenshot', 'Screenshots');
  return {
    action: 'screenshot',
    state: 'needs_permission',
    permission: 'mac_screen_recording',
    reason: 'Allow SmartEverything under Screen Recording, then reopen the app.',
  };
}

export function portableMachineReport(machine: MachineName, facts: MachineFacts): MachineReport {
  return {
    actions: [
      viaApp(facts, 'ring', 'Ringing'),
      viaApp(facts, 'stop_ring', 'Ringing'),
      unsupported('flashlight', 'A computer has no flashlight.'),
      ready('launch_app'),
      facts.openNeedsApp ? viaApp(facts, 'open', 'Opening links and files') : ready('open'),
      screenshot(facts),
      ready('lock'),
      unsupported(
        'unlock',
        `${machine} cannot be unlocked from here; wake it and the person enters the password.`,
      ),
      ready('show_unlock'),
      ready('receive_file'),
    ],
    permissions: facts.permissions,
  };
}

export interface PortableMachineOptions {
  readonly machine: MachineName;
  readonly agent: SessionAgent;
  readonly ring: { readonly set: (on: boolean) => Promise<void> };
  readonly openNeedsApp: boolean;
  readonly open: (target: MachineOpenTarget) => Promise<void>;
  readonly wake: () => Promise<void>;
}

export class PortableMachine implements MachineControl {
  constructor(private readonly options: PortableMachineOptions) {}

  async report(): Promise<MachineReport> {
    const agent = await this.options.agent.reachable();
    return portableMachineReport(this.options.machine, {
      agent,
      openNeedsApp: this.options.openNeedsApp,
      permissions: agent ? await this.options.agent.permissions() : [],
    });
  }

  watch(onChange: () => void): StopWatching {
    return this.options.agent.watch(onChange);
  }

  ring(on: boolean): Promise<void> {
    return this.options.ring.set(on);
  }

  open(target: MachineOpenTarget): Promise<void> {
    return this.options.open(target);
  }

  unlock(): Promise<void> {
    return Promise.reject(
      new NodeFailureError(
        'not_supported',
        `${this.options.machine} cannot be unlocked from here; use the unlock prompt instead.`,
      ),
    );
  }

  showUnlock(): Promise<void> {
    return this.options.wake();
  }
}
