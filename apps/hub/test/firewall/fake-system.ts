import type { DeviceMacs } from '../../src/firewall/monitor';
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

export interface MemoryMacs extends DeviceMacs {
  readonly saved: ReadonlyMap<string, string>;
}

export function memoryMacs(initial: Readonly<Record<string, string>> = {}): MemoryMacs {
  const saved = new Map(Object.entries(initial));
  return {
    saved,
    all: () => new Map(saved),
    remember: (deviceId, mac): void => {
      saved.set(deviceId, mac);
    },
  };
}

export const UFW_FILES: Readonly<Record<string, string>> = {
  '/etc/ufw/ufw.conf': 'ENABLED=yes\n',
  '/etc/default/ufw': 'DEFAULT_INPUT_POLICY="DROP"\n',
  '/etc/ufw/user.rules': '',
  '/etc/ufw/user6.rules': '',
  '/etc/ufw/after.rules': 'COMMIT\n',
  '/etc/ufw/after6.rules': 'COMMIT\n',
};
