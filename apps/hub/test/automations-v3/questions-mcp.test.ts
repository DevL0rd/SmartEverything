import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { callTool, structured } from '../mcp/client';
import { useRig } from '../automations/support/use-rig';
import { node, programOf } from '../support/automation-fixture';

const rig = useRig();

const CREATED = z.object({ ok: z.boolean(), id: z.string() });
const STARTED = z.object({ ok: z.boolean(), id: z.string(), status: z.string() });
const QUESTIONS = z.object({
  result: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      options: z.array(z.string()),
      state: z.string(),
    }),
  ),
});
const RUNS = z.object({ result: z.array(z.object({ id: z.string(), status: z.string() })) });

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return structured(await callTool(rig().booted.base, await rig().mcp(), name, args));
}

async function until(done: () => Promise<boolean>): Promise<void> {
  for (let round = 0; round < 100 && !(await done()); round += 1) {
    await rig().settle();
  }
}

describe('MCP parity for automation questions', () => {
  it('lists the question a run waits on and lets the AI press its button', async () => {
    const reply = await call('automation_edit', {
      action: 'create',
      name: 'Door',
      definition: programOf(
        [],
        [
          node('notify.ask', {
            person: rig().profileId,
            question: 'Lock the door?',
            options: ['Yes', 'No'],
          }),
          node('device.set', { target: { device: rig().ids.lamp }, control: 'power', to: true }),
        ],
      ),
    });
    const created = CREATED.parse(reply);
    const started = STARTED.parse(await call('automation_run', { automationId: created.id }));
    expect(started.ok).toBe(true);
    await until(async () => {
      const open = QUESTIONS.parse(await call('automation_runs_read', { view: 'questions' }));
      return open.result.length > 0;
    });
    const [question] = QUESTIONS.parse(
      await call('automation_runs_read', { view: 'questions' }),
    ).result;
    expect(question).toMatchObject({
      question: 'Lock the door?',
      options: ['Yes', 'No'],
      state: 'open',
    });
    expect(rig().sent()).toStrictEqual([]);
    await call('automation_answer', { questionId: question?.id, answer: 'Yes' });
    await until(async () => {
      const [run] = RUNS.parse(await call('automation_runs_read', { view: 'list' })).result;
      return run?.status === 'succeeded';
    });
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', true]]);
    const left = QUESTIONS.parse(await call('automation_runs_read', { view: 'questions' }));
    expect(left.result).toStrictEqual([]);
  });
});
