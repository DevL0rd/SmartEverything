import { afterEach, describe, expect, it } from 'vitest';
import type { FlowNode, PortValue, SignalInput, TriggerNode } from '@smarteverything/domain';
import { signalFire } from '../../../src/automations/triggers-v3/armers';
import { compileCore } from './support';
import {
  closeSetups,
  lit,
  node,
  program,
  rigV3,
  trigger,
  triggerChecks,
  type Expectation,
  type RigV3,
} from '../support/rig-v3';

afterEach(closeSetups);

const ROBOT = 'robot-1';
const WHEN = '2026-10-25T10:00:00.000Z';

function robotSignal(kind: string, data: SignalInput['data']): SignalInput {
  return {
    source: 'event',
    kind,
    subject: ROBOT,
    field: null,
    value: true,
    previous: null,
    at: WHEN,
    profileId: null,
    data: { family: 'vacuum', ...data },
  };
}

function dimTo(rig: RigV3, value: PortValue): FlowNode {
  return node('dim', 'device.set', {
    target: lit({ device: rig.home.lampId }),
    control: lit('brightness'),
    to: value,
  });
}

async function drive(
  rig: RigV3,
  vacuum: TriggerNode,
  check: Expectation,
  signal: SignalInput,
): Promise<void> {
  rig.add(
    program(
      triggerChecks(check, { yes: 41, no: 99 }, (value) => dimTo(rig, value)),
      { triggers: [vacuum] },
    ),
  );
  rig.engine.sync();
  rig.engine.observe(signal);
  await rig.until(() => rig.finished.length === 1);
}

function dims(rig: RigV3): unknown[] {
  return rig.home.adapter.executed.map((command) => command.value);
}

describe('trigger.vacuum reaches the run as its typed outputs', () => {
  it('gives the vacuum, the event and the rooms of a finished job, and no fault', async () => {
    const rig = await rigV3();
    await drive(
      rig,
      trigger('trigger.vacuum', { vacuum: lit(ROBOT), event: lit('finished') }),
      [
        ['vacuum', ROBOT],
        ['event', 'finished'],
        ['rooms', ['Kitchen', 'Hall']],
      ],
      robotSignal('cycle_finished', {
        outcome: 'finished',
        rooms: [
          { id: 16, name: 'Kitchen' },
          { id: 17, name: 'Hall' },
        ],
      }),
    );
    expect(dims(rig)).toStrictEqual([41]);
  });

  it('gives the fault text when the robot ran into a problem', async () => {
    const rig = await rigV3();
    await drive(
      rig,
      trigger('trigger.vacuum', { vacuum: lit(ROBOT), event: lit('error') }),
      [
        ['vacuum', ROBOT],
        ['event', 'error'],
        ['fault', 'The robot is stuck'],
      ],
      robotSignal('fault', { code: 21, title: 'The robot is stuck', message: 'Free the robot' }),
    );
    expect(dims(rig)).toStrictEqual([41]);
  });

  it('leaves the fault out of the payload when the event is not a problem', () => {
    const wanted = trigger('trigger.vacuum', { vacuum: lit(ROBOT), event: lit('finished') });
    const compiled = compileCore('auto', [wanted]);
    const payload = signalFire(
      compiled,
      robotSignal('cycle_finished', { outcome: 'finished' }),
      wanted.id,
    )?.payload;
    expect(payload).toEqual({ vacuum: ROBOT, event: 'finished', rooms: [], at: WHEN });
  });

  it('names the rooms when the robot starts a job', async () => {
    const rig = await rigV3();
    await drive(
      rig,
      trigger('trigger.vacuum', { event: lit('started') }),
      [
        ['vacuum', ROBOT],
        ['event', 'started'],
        ['rooms', ['Kitchen']],
      ],
      robotSignal('activity', { name: 'clean_started', rooms: [{ id: 16, name: 'Kitchen' }] }),
    );
    expect(dims(rig)).toStrictEqual([41]);
  });

  it('ignores another robot', async () => {
    const rig = await rigV3();
    rig.add(
      program([dimTo(rig, lit(41))], {
        triggers: [trigger('trigger.vacuum', { vacuum: lit('robot-2'), event: lit('finished') })],
      }),
    );
    rig.engine.sync();
    rig.engine.observe(robotSignal('cycle_finished', { outcome: 'finished' }));
    await rig.settle();
    expect(rig.finished).toHaveLength(0);
  });
});
