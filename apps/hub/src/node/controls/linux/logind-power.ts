import type { PowerAction } from '@smarteverything/domain';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import { ProgramFailedError, type RunProgram } from '../../run-program';
import type { PowerControl } from '../controls';
import { graphicalSession } from './sessions';

type SystemAction = Extract<PowerAction, 'shut_down' | 'restart' | 'sleep' | 'hibernate'>;

type SessionAction = Exclude<PowerAction, SystemAction>;

const SYSTEM_ACTIONS: readonly SystemAction[] = ['shut_down', 'restart', 'sleep', 'hibernate'];

const SESSION_ACTIONS: readonly SessionAction[] = ['lock_screen', 'sign_out'];

const SYSTEM_SET: ReadonlySet<PowerAction> = new Set(SYSTEM_ACTIONS);

interface SystemMethod {
  readonly call: string;
  readonly check: string;
  readonly inhibit: 'shutdown' | 'sleep';
  readonly doing: string;
}

const SYSTEM: Readonly<Record<SystemAction, SystemMethod>> = {
  shut_down: {
    call: 'PowerOff',
    check: 'CanPowerOff',
    inhibit: 'shutdown',
    doing: 'shutting down',
  },
  restart: { call: 'Reboot', check: 'CanReboot', inhibit: 'shutdown', doing: 'restarting' },
  sleep: { call: 'Suspend', check: 'CanSuspend', inhibit: 'sleep', doing: 'going to sleep' },
  hibernate: { call: 'Hibernate', check: 'CanHibernate', inhibit: 'sleep', doing: 'hibernating' },
};

const SESSION_VERBS: Readonly<Record<SessionAction, string>> = {
  lock_screen: 'lock-session',
  sign_out: 'terminate-session',
};

const LOGIND = [
  'org.freedesktop.login1',
  '/org/freedesktop/login1',
  'org.freedesktop.login1.Manager',
];

const ANSWER = z.object({ data: z.tuple([z.string()]) });

const INHIBITORS = z.object({
  data: z.tuple([
    z.array(z.tuple([z.string(), z.string(), z.string(), z.string(), z.number(), z.number()])),
  ]),
});

const NEEDS_PERMISSION = /interactive authentication required|access denied|not authorized/i;

function isSystem(action: PowerAction): action is SystemAction {
  return SYSTEM_SET.has(action);
}

export class LogindPower implements PowerControl {
  constructor(private readonly program: RunProgram) {}

  async available(): Promise<PowerAction[]> {
    const checked = await Promise.all(
      SYSTEM_ACTIONS.map(async (action) =>
        (await this.answer(SYSTEM[action].check)) === 'na' ? null : action,
      ),
    );
    const system = checked.filter((action) => action !== null);
    const session = (await graphicalSession(this.program)) === null ? [] : SESSION_ACTIONS;
    return [...system, ...session];
  }

  async run(action: PowerAction): Promise<void> {
    if (isSystem(action)) {
      await this.system(SYSTEM[action]);
      return;
    }
    const session = await graphicalSession(this.program);
    if (session === null) {
      throw new NodeFailureError('no_session', 'Nobody is signed in on this computer.');
    }
    await this.guarded(this.program('loginctl', [SESSION_VERBS[action], session]));
  }

  private async system(method: SystemMethod): Promise<void> {
    const blocker = await this.blocker(method.inhibit);
    if (blocker !== null) {
      throw new NodeFailureError(
        'blocked',
        `${blocker.who} is stopping this computer from ${method.doing}: ${blocker.why}.`,
      );
    }
    await this.guarded(this.program('busctl', ['call', ...LOGIND, method.call, 'b', 'false']));
  }

  private async answer(check: string): Promise<string> {
    const output = await this.program('busctl', ['--json=short', 'call', ...LOGIND, check]);
    return ANSWER.parse(JSON.parse(output)).data[0];
  }

  private async blocker(
    what: string,
  ): Promise<{ readonly who: string; readonly why: string } | null> {
    const output = await this.program('busctl', [
      '--json=short',
      'call',
      ...LOGIND,
      'ListInhibitors',
    ]);
    const found = INHIBITORS.parse(JSON.parse(output)).data[0].find(
      ([kinds, , , mode]) => mode === 'block' && kinds.split(':').includes(what),
    );
    return found === undefined ? null : { who: found[1], why: found[2] };
  }

  private async guarded(work: Promise<string>): Promise<void> {
    try {
      await work;
    } catch (cause) {
      if (cause instanceof ProgramFailedError && NEEDS_PERMISSION.test(cause.output)) {
        throw new NodeFailureError(
          'not_permitted',
          'This computer has not given SmartEverything permission for that yet.',
        );
      }
      throw cause;
    }
  }
}
