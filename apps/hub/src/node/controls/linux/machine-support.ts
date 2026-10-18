import type { MachineActionSupport, MachinePermissionState } from '@smarteverything/domain';
import type { MachineReport } from '../session-controls';

export interface LinuxFacts {
  readonly session: boolean;
  readonly agent: boolean;
  readonly plasma: boolean;
  readonly spectacle: boolean;
  readonly gio: boolean;
  readonly opener: boolean;
  readonly linger: boolean | null;
}

const NO_SESSION = 'Nobody is signed in on this computer.';
const NO_APP = 'The SmartEverything app is not running on this computer.';

function ready(action: MachineActionSupport['action']): MachineActionSupport {
  return { action, state: 'ready' };
}

function unsupported(action: MachineActionSupport['action'], reason: string): MachineActionSupport {
  return { action, state: 'unsupported', reason };
}

function ring(facts: LinuxFacts, action: 'ring' | 'stop_ring'): MachineActionSupport {
  return facts.agent ? ready(action) : unsupported(action, `Ringing needs it. ${NO_APP}`);
}

function screenshot(facts: LinuxFacts): MachineActionSupport {
  if (facts.plasma && facts.spectacle) return ready('screenshot');
  if (facts.agent) {
    return {
      action: 'screenshot',
      state: 'needs_permission',
      permission: 'linux_portal_screenshot',
      reason: 'The desktop asks before it lets an app capture the screen.',
    };
  }
  return unsupported('screenshot', `Screenshots need KDE Plasma or the app. ${NO_APP}`);
}

function inSession(
  facts: LinuxFacts,
  action: MachineActionSupport['action'],
  usable: boolean,
  missing: string,
): MachineActionSupport {
  if (!facts.session) return unsupported(action, NO_SESSION);
  return usable ? ready(action) : unsupported(action, missing);
}

function permissions(facts: LinuxFacts): readonly MachinePermissionState[] {
  const states: MachinePermissionState[] = [];
  if (!facts.plasma) states.push({ permission: 'linux_portal_screenshot', granted: false });
  if (facts.linger !== null) states.push({ permission: 'linux_linger', granted: facts.linger });
  return states;
}

export function linuxMachineReport(facts: LinuxFacts): MachineReport {
  return {
    actions: [
      ring(facts, 'ring'),
      ring(facts, 'stop_ring'),
      unsupported('flashlight', 'A computer has no flashlight.'),
      inSession(facts, 'launch_app', facts.gio, 'Launching apps needs gio on this computer.'),
      inSession(facts, 'open', facts.opener, 'Opening links and files needs xdg-open.'),
      screenshot(facts),
      inSession(facts, 'lock', true, NO_SESSION),
      inSession(facts, 'unlock', true, NO_SESSION),
      unsupported('show_unlock', 'This computer can unlock directly.'),
      ready('receive_file'),
    ],
    permissions: permissions(facts),
  };
}
