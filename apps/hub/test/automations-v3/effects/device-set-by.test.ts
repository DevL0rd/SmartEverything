import { ApiError, type DeviceTarget } from '@smarteverything/domain';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceSetter } from '../../../src/automations/effects/device-set';
import type { TemporaryDeviceChanges } from '../../../src/automations/effects/device-temporary';
import { DeviceToggler } from '../../../src/automations/effects/device-toggle';
import { effectHandlers } from '../../../src/automations/engine-v3-effects';
import { deviceExtraHandlers } from '../../../src/automations/engine-v3-effects-devices';
import { CommandIssuer } from '../../../src/automations/issue-commands';
import { closeSetups, NOW, setup } from '../../support/executor-setup';
import { FakeClock } from '../../support/fake-clock';
import { testRun } from './support';

afterEach(closeSetups);

async function flush(): Promise<void> {
  for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();
}

function unused(): never {
  throw new Error('not used by this test');
}

function requestOf(kind: string): EffectRequest {
  return {
    kind,
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params: {},
    retry: 'relative',
    budget: 'command',
  };
}

interface Rig {
  readonly home: Awaited<ReturnType<typeof setup>>;
  readonly setter: DeviceSetter;
  readonly handlers: ReturnType<typeof effectHandlers>;
  readonly target: DeviceTarget;
  readonly clock: FakeClock;
}

async function rig(
  brightness?: number,
  temporary?: Pick<TemporaryDeviceChanges, 'run'>,
): Promise<Rig> {
  const home = await setup();
  const clock = new FakeClock(NOW.toISOString());
  const issuer = new CommandIssuer({
    store: home.db.store,
    database: home.db.database,
    executor: home.executor,
    clock,
  });
  const ports = { store: home.db.store, executor: home.executor, issuer };
  const setter = new DeviceSetter(ports);
  if (brightness !== undefined)
    home.db.store.state.write([
      {
        deviceId: home.lampId,
        capability: 'brightness',
        value: brightness,
        observedAt: NOW.toISOString(),
      },
    ]);
  const handlers = effectHandlers({
    setter,
    temporary,
    http: { request: unused },
    toggler: new DeviceToggler(ports, (deviceId, capability) =>
      home.db.store.state.value(deviceId, capability),
    ),
    issuer,
    store: home.db.store,
    owned: { list: unused, write: unused },
    kept: { read: unused, write: unused },
    extra: deviceExtraHandlers({
      setter,
      store: home.db.store,
      feed: home.db.store.feed,
      clock,
    }),
  });
  const target: DeviceTarget = { kind: 'devices', deviceIds: [home.lampId] };
  return { home, setter, handlers, target, clock };
}

describe('device set by an amount', () => {
  it('sends the reported value plus the amount', async () => {
    const { home, setter, target } = await rig(40);
    const result = await setter.set(
      {
        target,
        control: 'brightness',
        value: () => 15,
        percent: false,
        serialised: false,
        relative: true,
      },
      testRun(),
    );
    expect(result).toMatchObject({ sent: [home.lampId], skipped: [] });
    expect(home.adapter.executed.map((command) => command.value)).toStrictEqual([55]);
  });

  it('keeps the result inside the control range, up and down', async () => {
    const up = await rig(95);
    await up.setter.set(
      {
        target: up.target,
        control: 'brightness',
        value: () => 30,
        percent: false,
        serialised: false,
        relative: true,
      },
      testRun(),
    );
    expect(up.home.adapter.executed.map((command) => command.value)).toStrictEqual([100]);
    const down = await rig(5);
    await down.setter.set(
      {
        target: down.target,
        control: 'brightness',
        value: () => -30,
        percent: false,
        serialised: false,
        relative: true,
      },
      testRun(),
    );
    expect(down.home.adapter.executed.map((command) => command.value)).toStrictEqual([1]);
  });

  it('reads the amount as a share of the control range with percent', async () => {
    const { home, setter, target } = await rig(40);
    await setter.set(
      {
        target,
        control: 'brightness',
        value: () => 10,
        percent: true,
        serialised: false,
        relative: true,
      },
      testRun(),
    );
    expect(home.adapter.executed.map((command) => command.value)).toStrictEqual([50]);
  });

  it('refuses and sends nothing when the device has not reported a value', async () => {
    const { home, setter, target } = await rig();
    await expect(
      setter.set(
        {
          target,
          control: 'brightness',
          value: () => 10,
          percent: false,
          serialised: false,
          relative: true,
        },
        testRun(),
      ),
    ).rejects.toThrow(ApiError);
    expect(home.adapter.executed).toStrictEqual([]);
  });

  it('refuses a control that is not a number', async () => {
    const { home, setter, target } = await rig(40);
    await expect(
      setter.set(
        {
          target,
          control: 'power',
          value: () => 1,
          percent: false,
          serialised: false,
          relative: true,
        },
        testRun(),
      ),
    ).rejects.toThrow('no number to change');
    expect(home.adapter.executed).toStrictEqual([]);
  });
});

describe('device.set handler', () => {
  it('changes by an amount through the handler and reports the devices sent to', async () => {
    const { home, handlers } = await rig(20);
    const result = await handlers['device.set']?.(
      { target: { device: home.lampId }, control: 'brightness', by: -5 },
      requestOf('device.set'),
      testRun(),
    );
    expect(result).toMatchObject({ ok: true, value: { ok: true, sent: [home.lampId] } });
    expect(result?.ok === true ? Object.hasOwn(result.value, 'value') : true).toBe(false);
    expect(home.adapter.executed.map((command) => command.value)).toStrictEqual([15]);
  });

  it('keeps an absolute value ahead of an amount', async () => {
    const { home, handlers } = await rig(20);
    const result = await handlers['device.set']?.(
      { target: { device: home.lampId }, control: 'brightness', to: 70, by: 5 },
      requestOf('device.set'),
      testRun(),
    );
    expect(result).toMatchObject({ ok: true, value: { value: 70 } });
    expect(home.adapter.executed.map((command) => command.value)).toStrictEqual([70]);
  });

  it('is Invalid when neither a value nor an amount is given', async () => {
    const { home, handlers } = await rig(20);
    const result = await handlers['device.set']?.(
      { target: { device: home.lampId }, control: 'brightness' },
      requestOf('device.set'),
      testRun(),
    );
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(home.adapter.executed).toStrictEqual([]);
  });

  it('fades to the value over the transition time through the fade handler', async () => {
    const { home, handlers, clock } = await rig(20);
    const done = handlers['device.set']?.(
      { target: { device: home.lampId }, control: 'brightness', to: 70, transition: 3000 },
      requestOf('device.set'),
      testRun(),
    );
    await flush();
    clock.advanceTo('2026-10-08T12:00:01.000Z');
    await flush();
    clock.advanceTo('2026-10-08T12:00:03.000Z');
    expect(await done).toMatchObject({ ok: true, value: { ok: true, value: 70 } });
    const values = home.adapter.executed.map((command) => command.value);
    expect(values).toHaveLength(3);
    expect(values.at(-1)).toBe(70);
    expect(values).toStrictEqual([37, 53, 70]);
  });

  it('refuses a fade with percent instead of sending at once', async () => {
    const { home, handlers } = await rig(20);
    const result = await handlers['device.set']?.(
      {
        target: { device: home.lampId },
        control: 'brightness',
        to: 70,
        percent: true,
        transition: 3000,
      },
      requestOf('device.set'),
      testRun(),
    );
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(home.adapter.executed).toStrictEqual([]);
  });

  it('refuses a fade to a value that is not a number', async () => {
    const { home, handlers } = await rig(20);
    const result = await handlers['device.set']?.(
      { target: { device: home.lampId }, control: 'power', to: true, transition: 3000 },
      requestOf('device.set'),
      testRun(),
    );
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(home.adapter.executed).toStrictEqual([]);
  });

  it('sends at once when the transition is zero', async () => {
    const { home, handlers } = await rig(20);
    await handlers['device.set']?.(
      { target: { device: home.lampId }, control: 'brightness', to: 70, transition: 0 },
      requestOf('device.set'),
      testRun(),
    );
    expect(home.adapter.executed.map((command) => command.value)).toStrictEqual([70]);
  });
});

describe('device.set_temporarily handler', () => {
  const ask = { control: 'brightness', to: 70, duration: 1000 };

  it('refuses a fade time instead of ignoring it', async () => {
    const run = vi.fn(() => Promise.resolve(null));
    const { home, handlers } = await rig(20, { run });
    const result = await handlers['device.set_temporarily']?.(
      { ...ask, target: { device: home.lampId }, transition: 2000 },
      requestOf('device.set_temporarily'),
      testRun(),
    );
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses percent instead of reading the value as an absolute number', async () => {
    const run = vi.fn(() => Promise.resolve(null));
    const { home, handlers } = await rig(20, { run });
    const result = await handlers['device.set_temporarily']?.(
      { ...ask, target: { device: home.lampId }, percent: true },
      requestOf('device.set_temporarily'),
      testRun(),
    );
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(run).not.toHaveBeenCalled();
  });

  it('runs the temporary change when neither is asked for', async () => {
    const run = vi.fn(() => Promise.resolve(null));
    const { home, handlers } = await rig(20, { run });
    const result = await handlers['device.set_temporarily']?.(
      { ...ask, target: { device: home.lampId }, transition: 0 },
      requestOf('device.set_temporarily'),
      testRun(),
    );
    expect(result).toMatchObject({ ok: true });
    expect(run).toHaveBeenCalledOnce();
  });
});
