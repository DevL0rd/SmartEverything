import { describe, expect, it } from 'vitest';
import { SCHEDULE_STEPS, type ScheduleStep } from '@smarteverything/domain';
import { actionsOf, powerVerbOf, stepsOf } from './steps';

const PROFILE = '10000000-0000-4000-8000-000000000001';
const CHAT = '10000000-0000-4000-8000-000000000002';
const LAMP = '30000000-0000-4000-8000-000000000001';

function stepsFrom(input: unknown): ScheduleStep[] {
  return SCHEDULE_STEPS.parse(input);
}

describe('schedule steps and editor actions', () => {
  it('turns an AI step into a wake action for the schedule owner and back', () => {
    const steps = stepsFrom([{ kind: 'ai', prompt: 'Check the garden', chatId: CHAT }]);
    const actions = actionsOf(steps, PROFILE);
    expect(actions).toStrictEqual([
      { type: 'wake_ai', profileId: PROFILE, chatId: CHAT, instruction: 'Check the garden' },
    ]);
    expect(stepsOf(actions ?? [])).toStrictEqual([
      { kind: 'ai', prompt: 'Check the garden', chatId: CHAT },
    ]);
  });

  it('turns any other tool step into a generic tool action that keeps its arguments', () => {
    const steps = stepsFrom([
      { kind: 'tool', tool: 'voice_speak', args: { text: 'Dinner', deviceId: LAMP } },
    ]);
    const actions = actionsOf(steps, PROFILE);
    expect(actions).toStrictEqual([
      {
        type: 'tool',
        profileId: PROFILE,
        tool: 'voice_speak',
        args: { text: 'Dinner', deviceId: LAMP },
      },
    ]);
    expect(stepsOf(actions ?? [])).toStrictEqual([
      { kind: 'tool', tool: 'voice_speak', args: { text: 'Dinner', deviceId: LAMP } },
    ]);
  });

  it('shows a device control on a room as a generic tool action', () => {
    const args = { rooms: ['Bedroom'], families: ['light'], capability: 'power', value: true };
    const actions = actionsOf(stepsFrom([{ kind: 'tool', tool: 'device_control', args }]), PROFILE);
    expect(actions).toStrictEqual([
      { type: 'tool', profileId: PROFILE, tool: 'device_control', args },
    ]);
  });

  it('keeps a single device control as a device command', () => {
    const args = { deviceIds: [LAMP], capability: 'power', value: false };
    const actions = actionsOf(stepsFrom([{ kind: 'tool', tool: 'device_control', args }]), PROFILE);
    expect(actions).toStrictEqual([
      { type: 'command', deviceId: LAMP, capability: 'power', value: false },
    ]);
  });

  it('refuses to edit a step that stops the run on failure so the flag is never lost', () => {
    const steps = stepsFrom([{ kind: 'ai', prompt: 'Try', stopOnFailure: true }]);
    expect(actionsOf(steps, PROFILE)).toBeNull();
  });

  it('refuses to edit a wait longer than a day', () => {
    expect(actionsOf(stepsFrom([{ kind: 'wait', seconds: 90_000 }]), PROFILE)).toBeNull();
  });

  it('finds the power verb even when another step cannot be edited', () => {
    const steps = stepsFrom([
      { kind: 'ai', prompt: 'Try', stopOnFailure: true },
      {
        kind: 'tool',
        tool: 'device_control',
        args: { deviceIds: [LAMP], capability: 'power', value: false },
      },
    ]);
    expect(powerVerbOf(steps, LAMP)).toBe('Off');
  });
});
