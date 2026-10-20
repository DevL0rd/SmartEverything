import { randomUUID } from 'node:crypto';
import type { AutomationQuestion } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import type { HubTool, HubToolResult } from '../../src/ai-tools/hub-tool';
import type { ToolCheck } from '../../src/ai-tools/tool-hub';
import { AutomationAiSlot } from '../../src/automations/automation-ai';
import { AutomationComputersSlot } from '../../src/automations/automation-computers';
import { hubEffectHandlers } from '../../src/automations/hub-effects';
import { QuestionDesk } from '../../src/automations/questions/desk';
import { setup } from '../support/executor-setup';
import { closeSetups, lit, node, program, RigV3, trigger } from './support/rig-v3';

afterEach(closeSetups);

const REMOTE = randomUUID();

const MINUTE = 60_000;

const TOOL: HubTool = {
  name: 'notify_person',
  title: 'Notify',
  description: 'x',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
};

interface Told {
  readonly personId: unknown;
  readonly text: unknown;
}

interface Built {
  readonly rig: RigV3;
  readonly desk: QuestionDesk;
  readonly told: Told[];
  readonly person: string;
}

async function built(refuse = false): Promise<Built> {
  const home = await setup();
  const told: Told[] = [];
  const person = home.db.store.profiles.first().id;
  const slot = new AutomationAiSlot();
  slot.attach({
    wake: () => Promise.resolve(),
    stop: (): void => undefined,
    tools: {
      check: (): ToolCheck => ({ ok: true, tool: TOOL }),
      call: (_name, args): Promise<HubToolResult> => {
        told.push({ personId: args['personId'], text: args['text'] });
        const response = refuse ? { error: 'quiet hours' } : { result: {} };
        return Promise.resolve({ response, line: '', pictures: [] });
      },
    },
  });
  const holder: { rig?: RigV3 } = {};
  const clock = {
    now: (): Date => {
      if (holder.rig === undefined) throw new Error('the rig is not built yet');
      return holder.rig.clock.now();
    },
  };
  const desk = new QuestionDesk({ questions: home.db.store.automationQuestions, clock });
  const extraEffects = hubEffectHandlers({
    store: home.db.store,
    clock,
    events: { record: (): void => undefined },
    ai: slot,
    computers: new AutomationComputersSlot(),
    questions: desk,
  });
  const rig = new RigV3(home, { extraEffects, questions: desk });
  holder.rig = rig;
  return { rig, desk, told, person };
}

function asking(
  rig: RigV3,
  person: string,
  extra: Record<string, ReturnType<typeof lit>> = {},
): ReturnType<typeof program> {
  return program(
    [
      node('ask', 'notify.ask', {
        person: lit({ person }),
        question: lit('Lock the door?'),
        options: lit(['Yes', 'No']),
        ...extra,
      }),
      node('light', 'device.set', {
        target: lit({ device: rig.home.lampId }),
        control: lit('brightness'),
        to: lit(40),
      }),
    ],
    { triggers: [trigger('trigger.button', { device: lit(REMOTE), press: lit('single') })] },
  );
}

function open(desk: QuestionDesk): AutomationQuestion {
  const [question] = desk.pending(null);
  if (question === undefined) throw new Error('no question is waiting');
  return question;
}

describe('notify.ask in the V3 engine', () => {
  it('asks the person, keeps the run waiting and continues with the answer', async () => {
    const { rig, desk, told, person } = await built();
    const row = rig.add(asking(rig, person, { timeout: lit(30 * MINUTE) }));
    rig.engine.sync();
    rig.press(REMOTE, 'single');
    await rig.until(() => desk.pending(null).length === 1);
    await rig.settle();
    expect(rig.runs(row.id)[0]).toMatchObject({ status: 'waiting' });
    expect(told).toHaveLength(1);
    expect(String(told[0]?.text)).toContain('Lock the door?');
    expect(told[0]?.personId).toBe(person);
    const question = open(desk);
    expect(question).toMatchObject({ person_id: person, options: ['Yes', 'No'], state: 'open' });
    desk.answer(question.id, { profileId: person, owner: false }, 'Yes');
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id)[0]).toMatchObject({ status: 'succeeded' });
    expect(desk.pending(null)).toEqual([]);
  });

  it('keeps asking across a hub restart and still takes the answer', async () => {
    const { rig, desk, person } = await built();
    const row = rig.add(asking(rig, person));
    rig.engine.sync();
    rig.press(REMOTE, 'single');
    await rig.until(() => desk.pending(null).length === 1);
    await rig.settle();
    const question = open(desk);
    rig.restart();
    rig.engine.sync();
    expect(rig.engine.boot()).toStrictEqual({ resumed: 1, cancelled: 0, interrupted: 0 });
    desk.answer(question.id, { profileId: person, owner: true }, 'No');
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id)[0]).toMatchObject({ status: 'succeeded' });
  });

  it('continues when the answer came while the hub was down', async () => {
    const { rig, desk, person } = await built();
    const row = rig.add(asking(rig, person));
    rig.engine.sync();
    rig.press(REMOTE, 'single');
    await rig.until(() => desk.pending(null).length === 1);
    await rig.settle();
    const question = open(desk);
    rig.engine.shutdown();
    desk.answer(question.id, { profileId: person, owner: true }, 'Yes');
    rig.restart();
    rig.engine.sync();
    rig.engine.boot();
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id)[0]).toMatchObject({ status: 'succeeded' });
  });

  it('times out at the deadline and closes the question', async () => {
    const { rig, desk, person } = await built();
    const row = rig.add(asking(rig, person, { timeout: lit(MINUTE) }));
    rig.engine.sync();
    rig.press(REMOTE, 'single');
    await rig.until(() => desk.pending(null).length === 1);
    await rig.settle();
    const question = open(desk);
    await rig.advance(MINUTE + 1);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id)[0]).toMatchObject({ status: 'succeeded' });
    expect(desk.pending(null)).toEqual([]);
    expect(() => desk.answer(question.id, { profileId: person, owner: true }, 'Yes')).toThrow(
      /no longer waiting|run out/,
    );
  });

  it('fails the run when the person cannot be told and leaves no open question', async () => {
    const { rig, desk, person } = await built(true);
    const row = rig.add(asking(rig, person));
    rig.engine.sync();
    rig.press(REMOTE, 'single');
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id)[0]).toMatchObject({ status: 'failed' });
    expect(desk.pending(null)).toEqual([]);
  });

  it('refuses an answer that is not a button, from someone else, or twice', async () => {
    const { rig, desk, person } = await built();
    rig.add(asking(rig, person));
    rig.engine.sync();
    rig.press(REMOTE, 'single');
    await rig.until(() => desk.pending(null).length === 1);
    const question = open(desk);
    expect(() => desk.answer(question.id, { profileId: person, owner: false }, 'Maybe')).toThrow(
      /one of: Yes, No/,
    );
    expect(() =>
      desk.answer(question.id, { profileId: randomUUID(), owner: false }, 'Yes'),
    ).toThrow(/no such question/);
    desk.answer(question.id, { profileId: person, owner: false }, 'Yes');
    expect(() => desk.answer(question.id, { profileId: person, owner: false }, 'No')).toThrow(
      /no longer waiting/,
    );
  });
});
