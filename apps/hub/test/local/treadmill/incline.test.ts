import { hexToBytes } from '@smarteverything/ble';
import {
  CAPABILITY_KEY,
  type DeviceCommand,
  type TreadmillActionResult,
  type TreadmillGattDump,
  type TreadmillWriteStep,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { treadmillCapabilities } from '../../../src/local/treadmill/capabilities';
import { runTreadmillCommand, type CommandDeps } from '../../../src/local/treadmill/commands';
import { NoStepsGuard } from '../../../src/local/treadmill/guard';
import { captureLogs, testLogger } from '../../support/logs';
import { treadmillRig, type Person, type TreadmillRig } from '../../support/treadmill-rig';

const G15: TreadmillGattDump = {
  name: 'KS-SO-G15',
  services: [
    {
      uuid: '1826',
      characteristics: [
        { uuid: '2acc', properties: ['read'], value: '4816000044020000' },
        { uuid: '2ad4', properties: ['read'], value: '6400dc050a00' },
        { uuid: '2ad5', properties: ['read'], value: '0000c8000a00' },
      ],
    },
  ],
};

type Behaviour =
  'normal' | 'status_only' | 'no_move' | 'silent' | 'denied' | 'unsupported' | 'control_refused';

let rig: TreadmillRig;
let sent: TreadmillWriteStep[][];
let behaviour: Behaviour;
let answer: TreadmillActionResult;
let deps: CommandDeps;

function hexOf(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function dataHex(speed100: number, incline10: number, steps: number): string {
  const word = (value: number): string => hexOf(value & 0xff) + hexOf((value >> 8) & 0xff);
  return `0820${word(speed100)}${word(incline10)}0000${word(steps)}`;
}

function feed(frames: readonly [string, string][]): void {
  const at = rig.clock.now().toISOString();
  rig.ingest.process(rig.row(), rig.owner.client, {
    frames: frames.map(([characteristic, hex]) => ({ at, characteristic, hex })),
    link: { phase: 'linked', rssi: -55, reconnects: 0, detail: null },
  });
}

function inclineFrames(target: number): [string, string][] {
  const raw = Math.round(target * 10);
  if (behaviour === 'status_only') {
    return [['2ada', `06${hexOf(raw & 0xff)}${hexOf((raw >> 8) & 0xff)}`]];
  }
  return behaviour === 'no_move' ? [] : [['2acd', dataHex(300, raw, 20)]];
}

function beltAnswers(step: TreadmillWriteStep): void {
  const bytes = hexToBytes(step.hex);
  if (bytes[0] === 0x00) {
    feed([['2ad9', behaviour === 'control_refused' ? '800005' : '800001']]);
  }
  if (bytes[0] === 0x03 && behaviour !== 'silent') {
    const target = (((bytes[2] ?? 0) << 8) | (bytes[1] ?? 0)) / 10;
    const codes: Partial<Record<Behaviour, string>> = { denied: '800305', unsupported: '800302' };
    feed([['2ad9', codes[behaviour] ?? '800301']]);
    if (codes[behaviour] === undefined) {
      feed(inclineFrames(target));
    }
  }
}

function belt(speed100: number, incline: number, steps: number): void {
  feed([['2acd', dataHex(speed100, incline * 10, steps)]]);
}

beforeEach(async () => {
  captureLogs();
  rig = await treadmillRig('ftms_supplement', G15);
  sent = [];
  behaviour = 'normal';
  answer = { ok: true, detail: 'Done.' };
  deps = {
    store: rig.test.store,
    fleet: rig.fleet,
    broker: {
      run: (_target, steps): Promise<TreadmillActionResult> => {
        sent.push([...steps]);
        steps.forEach(beltAnswers);
        return Promise.resolve(answer);
      },
    },
    guard: new NoStepsGuard(),
    holderOf: (): string | null => rig.holder.clientId,
    walkerOf: (): string => rig.owner.profile.id,
    holderName: (): string => 'Owner phone',
    now: rig.clock.now,
    log: testLogger('treadmill'),
  };
  belt(0, 5, 0);
});

afterEach(async () => {
  vi.useRealTimers();
  await rig.close();
});

function run(
  capability: string,
  value: DeviceCommand['value'],
  by: { readonly source: 'app' | 'assistant'; readonly client: Person },
): Promise<unknown> {
  const device = rig.row();
  const [row] = rig.test.store.commands.insert([
    {
      deviceId: device.id,
      capability,
      value,
      source: by.source,
      requestedBy: by.client.client.id,
    },
  ]);
  if (row === undefined) {
    throw new Error('the command was not stored');
  }
  return runTreadmillCommand(deps, {
    commandId: row.id,
    externalId: device.external_id,
    capability: CAPABILITY_KEY.parse(row.capability),
    value,
  });
}

const OWNER_APP = (): { source: 'app'; client: Person } => ({ source: 'app', client: rig.owner });

function writes(): string[] {
  return sent.flat().map((step) => step.hex);
}

async function failsAfterTimeout(promise: Promise<unknown>, message: string): Promise<void> {
  const outcome = expect(promise).rejects.toThrow(message);
  await vi.advanceTimersByTimeAsync(10_000);
  await outcome;
}

describe('the incline capability', () => {
  it('is writable on a belt that reports an incline range', () => {
    const find = (): string | undefined =>
      treadmillCapabilities('ftms_supplement', rig.fleet.of(rig.row()).runtime.identity).find(
        (entry) => entry.key === 'belt_incline',
      )?.access;
    expect(find()).toBe('read_write');
  });
});

describe('changing the incline', () => {
  it('moves one step per write, each after the belt confirmed the last, until the target', async () => {
    await expect(run('belt_incline', 8, OWNER_APP())).resolves.toBe('The incline is now 8.');
    expect(writes()).toEqual(['00', '033c00', '00', '034600', '00', '035000']);
  });

  it('takes the belt’s status message as the confirmation as well', async () => {
    behaviour = 'status_only';
    await expect(run('belt_incline', 6, OWNER_APP())).resolves.toBe('The incline is now 6.');
    expect(writes()).toEqual(['00', '033c00']);
  });

  it('refuses a value outside the belt’s range and sends nothing', async () => {
    await expect(run('belt_incline', 25, OWNER_APP())).rejects.toThrow('between 0 and 20');
    await expect(run('belt_incline', 21, OWNER_APP())).rejects.toThrow('between 0 and 20');
    await expect(run('belt_incline', -1, OWNER_APP())).rejects.toThrow('between 0 and 20');
    expect(sent).toHaveLength(0);
  });

  it('sets 1 on a stopped belt from the holder phone, ending with the write 03 0a 00', async () => {
    await expect(run('belt_incline', 1, OWNER_APP())).resolves.toBe('The incline is now 1.');
    expect(writes().at(-1)).toBe('030a00');
    expect(writes().slice(0, 2)).toEqual(['00', '032800']);
  });

  it('sets 10 with the write 03 64 00 as the last one', async () => {
    await expect(run('belt_incline', 10, OWNER_APP())).resolves.toBe('The incline is now 10.');
    expect(writes().at(-1)).toBe('036400');
    expect(writes().filter((hex) => hex === '00')).toHaveLength(5);
  });

  it('sets 20 with the write 03 c8 00 as the last one', async () => {
    await expect(run('belt_incline', 20, OWNER_APP())).resolves.toBe('The incline is now 20.');
    expect(writes().at(-1)).toBe('03c800');
  });

  it('logs the old and the new incline when it changed', async () => {
    const logs = captureLogs();
    await run('belt_incline', 7, OWNER_APP());
    const record = logs.records.find((entry) => entry.event === 'treadmill.incline_changed');
    expect(record?.payload).toMatchObject({ from: 5, to: 7 });
  });

  it('refuses an assistant while remote incline is off, and walks nobody into a hill', async () => {
    await expect(
      run('belt_incline', 6, { source: 'assistant', client: rig.owner }),
    ).rejects.toThrow('holds the link');
    expect(sent).toHaveLength(0);
  });

  it('refuses a member who is not on the belt', async () => {
    await expect(run('belt_incline', 6, { source: 'app', client: rig.member })).rejects.toThrow(
      'Only the owner or the person on the belt',
    );
  });

  it('fails a write the belt never acknowledged, once, without resending', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    behaviour = 'silent';
    await failsAfterTimeout(run('belt_incline', 6, OWNER_APP()), 'The belt did not change its incline');
    expect(writes()).toEqual(['00', '033c00']);
  });

  it('fails an acknowledged write the incline never followed, once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    behaviour = 'no_move';
    await failsAfterTimeout(run('belt_incline', 6, OWNER_APP()), 'The belt did not change its incline');
    expect(writes()).toEqual(['00', '033c00']);
  });

  it('says another app has control when the belt answers not permitted', async () => {
    behaviour = 'denied';
    await expect(run('belt_incline', 6, OWNER_APP())).rejects.toThrow(
      'KS Fit or another app has control of the belt',
    );
    expect(writes()).toEqual(['00', '033c00']);
  });

  it('answers a second incline change with a refusal while one is in flight', async () => {
    let release: (value: TreadmillActionResult) => void = () => undefined;
    deps = {
      ...deps,
      broker: {
        run: (_target, steps): Promise<TreadmillActionResult> => {
          sent.push([...steps]);
          return new Promise((resolve) => {
            release = (value): void => {
              steps.forEach(beltAnswers);
              resolve(value);
            };
          });
        },
      },
    };
    const first = run('belt_incline', 6, OWNER_APP());
    await expect(run('belt_incline', 7, OWNER_APP())).rejects.toThrow('already in progress');
    release(answer);
    await expect(first).resolves.toBe('The incline is now 6.');
    expect(sent).toHaveLength(1);
  });

  it('never moves the incline when the belt stops', async () => {
    await run('belt_command', 'stop', OWNER_APP());
    expect(writes().filter((hex) => hex.startsWith('03'))).toEqual([]);
    expect(writes()).toHaveLength(1);
  });

  it('lets a person walking change it from the phone that holds the link', async () => {
    belt(300, 5, 10);
    await expect(run('belt_incline', 4, OWNER_APP())).resolves.toBe('The incline is now 4.');
    expect(writes()).toEqual(['00', '032800']);
  });
});

describe('a belt without an incline', () => {
  it('offers no incline capability and refuses the command', async () => {
    const without: TreadmillGattDump = {
      ...G15,
      services: [
        {
          uuid: '1826',
          characteristics: (G15.services[0]?.characteristics ?? []).filter(
            (characteristic) => characteristic.uuid !== '2ad5',
          ),
        },
      ],
    };
    await rig.close();
    rig = await treadmillRig('ftms_supplement', without);
    const { identity } = rig.fleet.of(rig.row()).runtime;
    expect(
      treadmillCapabilities('ftms_supplement', { ...identity, features: [] }).find(
        (entry) => entry.key === 'belt_incline',
      ),
    ).toBeUndefined();
    deps = { ...deps, store: rig.test.store, fleet: rig.fleet };
    belt(0, 5, 0);
    await expect(run('belt_incline', 6, OWNER_APP())).rejects.toThrow(
      'The belt did not report its incline range',
    );
    expect(sent).toHaveLength(0);
  });
});

describe('the light strip write', () => {
  const SUPPLEMENT_NOTIFY = '24e2521c-f63b-48ed-85be-c5330b00fdf7';

  function lightReply(on: boolean): string {
    const body = [0x72, 0x80, 4, 8, 0, on ? 8 : 0, 0];
    const sum = body.reduce((total, byte) => total + byte, 0) & 0xff;
    return [...body, sum].map(hexOf).join('');
  }

  function brokerReplying(reply: (() => void) | null): CommandDeps['broker'] {
    return {
      run: (_target, steps): Promise<TreadmillActionResult> => {
        sent.push([...steps]);
        reply?.();
        return Promise.resolve(answer);
      },
    };
  }

  it('asks for the settings again and confirms from the reply', async () => {
    deps = {
      ...deps,
      broker: brokerReplying(() => {
        feed([[SUPPLEMENT_NOTIFY, lightReply(true)]]);
      }),
    };
    await run('belt_light', true, OWNER_APP());
    expect(sent[0]).toHaveLength(2);
    expect(sent[0]?.[1]?.characteristic).toBe('24e2521c-f63b-48ed-85be-c5330d00fdf7');
  });

  it('fails when the next settings reply still shows the old state', async () => {
    deps = {
      ...deps,
      broker: brokerReplying(() => {
        feed([[SUPPLEMENT_NOTIFY, lightReply(false)]]);
      }),
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await failsAfterTimeout(run('belt_light', true, OWNER_APP()), 'The light strip did not change');
  });
});
