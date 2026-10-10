import { SOCKETFILTERFW } from '@smarteverything/domain';
import { always, type OpeningState, type PlanDraft, type Probe } from './openings';
import { answerOf, type FirewallSystem } from './system';

type AppVerdict = 'permitted' | 'blocked' | 'unlisted';

class ApplicationFirewallAnswerError extends Error {
  override readonly name = 'ApplicationFirewallAnswerError';

  constructor(question: string, received: string) {
    super(`socketfilterfw ${question} must answer what it allows; received "${received.trim()}".`);
  }
}

function ask(system: FirewallSystem, args: readonly string[]): Promise<string> {
  return answerOf(system, SOCKETFILTERFW, args);
}

function globalStateOf(answer: string): number {
  const state = /State = (\d)/.exec(answer)?.[1];
  if (state === undefined) {
    throw new ApplicationFirewallAnswerError('--getglobalstate', answer);
  }
  return Number(state);
}

function appVerdictOf(answer: string): AppVerdict {
  if (/permitted/i.test(answer)) {
    return 'permitted';
  }
  if (/blocked/i.test(answer)) {
    return 'blocked';
  }
  if (/not part of the firewall|not found/i.test(answer)) {
    return 'unlisted';
  }
  throw new ApplicationFirewallAnswerError('--getappblocked', answer);
}

const STATE_OF: Readonly<Record<AppVerdict, OpeningState>> = {
  permitted: 'open',
  blocked: 'denied',
  unlisted: 'missing',
};

async function verdictOf(system: FirewallSystem, program: string): Promise<AppVerdict> {
  return appVerdictOf(await ask(system, ['--getappblocked', program]));
}

export async function probeMac(system: FirewallSystem): Promise<Probe> {
  const state = globalStateOf(await ask(system, ['--getglobalstate']));
  if (state === 0) {
    return {
      backend: 'macos',
      filtering: false,
      detail: 'The macOS application firewall is off.',
      stateOf: always('open'),
      draft: null,
      fixable: new Set(),
      watch: [],
    };
  }
  const go2rtc = await verdictOf(system, system.go2rtcBinary);
  const app = await verdictOf(system, system.appBinary);
  const blocked = [
    ...(go2rtc === 'permitted' ? [] : [system.go2rtcBinary]),
    ...(app === 'permitted' ? [] : [system.appBinary]),
  ];
  return {
    backend: 'macos',
    filtering: true,
    detail:
      state === 2
        ? 'The macOS application firewall blocks all incoming connections; turn that off in System Settings before allowing apps.'
        : 'The macOS application firewall is on and only lets in apps it allows.',
    stateOf: (rule) => STATE_OF[rule.purpose === 'device' ? app : go2rtc],
    draft: blocked.length === 0 ? null : (): PlanDraft => ({ backend: 'macos', programs: blocked }),
    fixable: new Set(['missing', 'denied', 'unknown']),
    watch: [],
  };
}
