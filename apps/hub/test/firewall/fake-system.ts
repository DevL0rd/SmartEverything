import type { FirewallSystem } from '../../src/firewall/system';

interface Answer {
  readonly code: number;
  readonly stdout: string;
  readonly stderr?: string;
}

export interface FakeSystemSetup {
  readonly files?: Readonly<Record<string, string>>;
  readonly programs?: Readonly<Record<string, Answer>>;
  readonly unreadable?: readonly string[];
}

export function fakeSystem(setup: FakeSystemSetup = {}): FirewallSystem {
  const files = setup.files ?? {};
  const programs = setup.programs ?? {};
  return {
    platform: 'linux',
    go2rtcBinary: '/opt/go2rtc',
    appBinary: '/opt/app',
    run: (file, args): ReturnType<FirewallSystem['run']> => {
      const answer = programs[[file, ...args].join(' ')];
      return Promise.resolve(answer === undefined ? null : { stderr: '', ...answer });
    },
    read: (path) =>
      setup.unreadable?.includes(path) === true
        ? Promise.reject(
            Object.assign(new Error(`EACCES: permission denied, open '${path}'`), {
              code: 'EACCES',
            }),
          )
        : Promise.resolve(files[path] ?? null),
    watch: (): null => null,
  };
}
