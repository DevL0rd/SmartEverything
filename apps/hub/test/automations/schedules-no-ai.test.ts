import { SCHEDULE_ROW, type ScheduleRow, type ScheduleStep } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { ScheduleBook } from '../../src/schedules/book';
import { NO_AI_ENGINE, StepRunner } from '../../src/schedules/steps';
import { testStore, type TestStore } from '../support/store';

const ID = '20000000-0000-4000-8000-000000000001';
const MOMENT = '2026-10-08T10:00:10.000Z';

const AI_STEP: Extract<ScheduleStep, { kind: 'ai' }> = {
  kind: 'ai',
  prompt: 'Summarise the night',
  chatId: null,
  stopOnFailure: false,
};

function rowWith(step: ScheduleStep): ScheduleRow {
  return SCHEDULE_ROW.parse({
    id: ID,
    profile_id: ID,
    client_id: null,
    via: 'app',
    label: 'Briefing',
    timing: { kind: 'in', seconds: 10 },
    occurrences: [MOMENT],
    steps: [step],
    step_lines: [null],
    device_ids: [],
    state: 'scheduled',
    next_at: MOMENT,
    occurrence: 0,
    step: 0,
    results: [],
    confirmed_at: null,
    confirmed_by: null,
    origin: null,
    created_at: MOMENT,
    updated_at: MOMENT,
    finished_at: null,
  });
}

let fixture: TestStore | null = null;

afterEach(async () => {
  await fixture?.close();
  fixture = null;
});

describe('scheduled AI steps on a hub without an AI chat engine', () => {
  it('refuses to schedule an AI step and says what is missing', async () => {
    fixture = await testStore();
    const book = new ScheduleBook(
      fixture.store,
      new ToolHub([]),
      { now: (): Date => new Date(MOMENT) },
      false,
    );
    expect(() =>
      book.create(
        { profileId: ID, clientId: null, role: 'owner', via: 'app', plugin: null },
        { label: null, timing: { kind: 'in', seconds: 10 }, steps: [AI_STEP] },
      ),
    ).toThrow(`Step 1: ${NO_AI_ENGINE}`);
  });

  it('fails a due AI step with the same words instead of running it', async () => {
    fixture = await testStore();
    const runner = new StepRunner(new ToolHub([]), fixture.store, null);
    const outcome = await runner.run(AI_STEP, rowWith(AI_STEP), 'Summarise the night');
    expect(outcome).toStrictEqual({
      outcome: 'failed',
      line: 'Summarise the night',
      detail: NO_AI_ENGINE,
    });
  });
});
