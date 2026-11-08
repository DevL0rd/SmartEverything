import type { AiHarnessSession } from '@smarteverything/domain';

export interface PlanModeView {
  readonly status: string;
  readonly action: 'Turn on' | 'Turn off';
  readonly line: '/plan' | '/plan off';
}

export function planModeView(plan: AiHarnessSession['plan']): PlanModeView {
  const active = plan?.active ?? false;
  const target = plan?.pending === true ? !active : active;
  const status = (): string => {
    if (plan?.pending === true)
      return target ? 'Turns on with your next message' : 'Turns off with your next message';
    return active ? 'On' : 'Off';
  };
  return target
    ? { status: status(), action: 'Turn off', line: '/plan off' }
    : { status: status(), action: 'Turn on', line: '/plan' };
}
