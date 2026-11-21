import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import { automationOf, logLine, programRig, type ProgramRig } from './support/program-rig';

let rig: ProgramRig;

beforeEach(async () => {
  captureLogs();
  rig = await programRig();
});

afterEach(async () => {
  await rig.close();
});

function body(id: string): {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: ReturnType<typeof automationOf>;
} {
  return {
    id,
    name: 'Copy of Hello',
    enabled: false,
    definition: automationOf([logLine('say', 'hi')]),
  };
}

describe('adding an automation with an id the client generated', () => {
  it('keeps the client id and returns the same automation when the create is repeated', async () => {
    const id = randomUUID();
    const first = await rig.service.create(rig.owner.caller, body(id));
    const again = await rig.service.create(rig.owner.caller, body(id));

    expect(first).toMatchObject({ ok: true, id, revision: 1 });
    expect(again).toMatchObject({ ok: true, id, revision: 1 });
    expect(rig.programs.list().filter((row) => row.id === id)).toHaveLength(1);
    expect(rig.programs.list()).toHaveLength(1);
  });

  it('refuses an automation id that belongs to someone else', async () => {
    const id = randomUUID();
    await rig.service.create(rig.owner.caller, body(id));

    await expect(rig.service.create(rig.member.caller, body(id))).rejects.toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(rig.programs.list()).toHaveLength(1);
  });
});
