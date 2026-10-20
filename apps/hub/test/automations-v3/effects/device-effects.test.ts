import { randomUUID } from 'node:crypto';
import { CAPABILITY_KEY, type CommandAction } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { commandMetadata, stampOf } from '../../../src/automations/effects/command-metadata';
import { DeviceSetter, type DeviceSetPorts } from '../../../src/automations/effects/device-set';
import { DeviceToggler } from '../../../src/automations/effects/device-toggle';
import { runScene, UnknownSceneError } from '../../../src/automations/effects/scene';
import { CommandIssuer } from '../../../src/automations/issue-commands';
import { AutomationRunCancelledError } from '../../../src/automations/effects/run-abort';
import { closeSetups, NOW, setup } from '../../support/executor-setup';
import { FakeClock } from '../../support/fake-clock';
import { testRun, triggerWithDepth } from './support';

afterEach(closeSetups);

interface Parts {
  readonly home: Awaited<ReturnType<typeof setup>>;
  readonly ports: DeviceSetPorts;
  readonly setter: DeviceSetter;
}

async function parts(): Promise<Parts> {
  const home = await setup();
  const clock = new FakeClock(NOW.toISOString());
  const issuer = new CommandIssuer({
    store: home.db.store,
    database: home.db.database,
    executor: home.executor,
    clock,
  });
  const ports = { store: home.db.store, executor: home.executor, issuer };
  return { home, ports, setter: new DeviceSetter(ports) };
}

describe('device set effect', () => {
  it('sends the value, reports who got it and stamps the commands with the run', async () => {
    const { home, setter } = await parts();
    const run = testRun(triggerWithDepth(1));
    const result = await setter.set(
      {
        target: { kind: 'devices', deviceIds: [home.lampId] },
        control: 'brightness',
        value: () => 40,
        percent: false,
        serialised: false,
        at: { nodePath: 'node-1', iteration: 4, attempt: 2 },
      },
      run,
    );
    expect(result).toStrictEqual({ sent: [home.lampId], skipped: [], note: null });
    expect(home.adapter.executed.map((command) => command.value)).toStrictEqual([40]);
    const [row] = run.recorded;
    const metadata = commandMetadata(home.db.store).of(row?.id ?? '', NOW.getTime());
    expect(metadata).toMatchObject({
      runId: run.runId,
      nodePath: 'node-1',
      iteration: 4,
      attempt: 2,
      causeRunId: run.runId,
      causeAutomationId: run.automationId,
      causeDepth: 2,
    });
  });

  it('reads the value inside the command lane when the value follows the device', async () => {
    const { home, setter } = await parts();
    let reads = 0;
    await setter.set(
      {
        target: { kind: 'devices', deviceIds: [home.lampId] },
        control: 'brightness',
        value: () => {
          reads += 1;
          return 25;
        },
        percent: false,
        serialised: true,
      },
      testRun(),
    );
    expect(reads).toBe(1);
    expect(home.adapter.executed.map((command) => command.value)).toStrictEqual([25]);
  });

  it('refuses a control that no member supports and sends nothing', async () => {
    const { home, setter } = await parts();
    await expect(
      setter.set(
        {
          target: { kind: 'devices', deviceIds: [home.lampId] },
          control: 'volume',
          value: () => 1,
          percent: false,
          serialised: true,
        },
        testRun(),
      ),
    ).rejects.toMatchObject({ code: 'command_refused' });
    expect(home.adapter.executed).toStrictEqual([]);
  });

  it('stops before sending when the run was cancelled', async () => {
    const { home, setter } = await parts();
    const run = testRun();
    run.controller.abort();
    await expect(
      setter.set(
        {
          target: { kind: 'devices', deviceIds: [home.lampId] },
          control: 'brightness',
          value: () => 10,
          percent: false,
          serialised: true,
        },
        run,
      ),
    ).rejects.toBeInstanceOf(AutomationRunCancelledError);
    expect(home.adapter.executed).toStrictEqual([]);
  });
});

describe('device toggle effect', () => {
  it('flips each member from the value the reader gives', async () => {
    const { home, ports } = await parts();
    const toggler = new DeviceToggler(ports, () => false);
    const result = await toggler.toggle(
      { target: { kind: 'devices', deviceIds: [home.lampId] }, control: 'power' },
      testRun(),
    );
    expect(result.values).toStrictEqual([{ deviceId: home.lampId, value: true }]);
    expect(home.adapter.executed.map((command) => command.value)).toStrictEqual([true]);
  });

  it('refuses a control that is not on or off', async () => {
    const { home, ports } = await parts();
    const toggler = new DeviceToggler(ports, () => 40);
    await expect(
      toggler.toggle(
        { target: { kind: 'devices', deviceIds: [home.lampId] }, control: 'brightness' },
        testRun(),
      ),
    ).rejects.toMatchObject({ code: 'command_refused' });
    expect(home.adapter.executed).toStrictEqual([]);
  });
});

describe('scene effect', () => {
  it('issues the scene commands as scene commands', async () => {
    const { home, ports } = await parts();
    const action: CommandAction = {
      type: 'command',
      deviceId: home.lampId,
      capability: CAPABILITY_KEY.parse('power'),
      value: true,
    };
    const run = testRun();
    await runScene(
      ports.issuer,
      { sceneId: randomUUID(), actions: [action], at: stampOf('s') },
      run,
    );
    expect(run.recorded.map((row) => row.source)).toStrictEqual(['scene']);
    expect(home.adapter.executed.map((command) => command.value)).toStrictEqual([true]);
  });

  it('names a scene that is not in the home', async () => {
    const { ports } = await parts();
    await expect(
      runScene(ports.issuer, { sceneId: 'gone', actions: undefined }, testRun()),
    ).rejects.toBeInstanceOf(UnknownSceneError);
  });
});
