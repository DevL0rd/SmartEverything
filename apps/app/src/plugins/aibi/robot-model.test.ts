import { describe, expect, it } from 'vitest';
import { clock } from '../../format/time';
import { gridCaption } from './moves-grid';
import { robotView } from './robot-model';
import { LINES, reportOf, statusOf } from './robot-fixture';

const CONTACT = '2026-10-18T10:00:00Z';

describe('the robot card text', () => {
  it('says it is awake and on its base, and keeps the time with what it last heard', () => {
    const view = robotView(statusOf({ lines: LINES, robot: reportOf() }), 'awake', true);
    expect(view.chip).toEqual({ tone: 'positive', label: 'Awake' });
    expect(view.line).toBe('On its base');
    expect(view.quote).toBe(`${clock(LINES[0].at)} · “What’s the weather?”`);
    expect(view.asleep).toBe(false);
  });

  it('says when it was last seen when there is nothing it heard to quote', () => {
    const view = robotView(statusOf({ robot: reportOf() }), 'awake', true);
    expect(view.line).toBe(`On its base · last seen ${clock(CONTACT)}`);
    expect(view.quote).toBeNull();
  });

  it('says it is connected when nothing is known about its base', () => {
    const view = robotView(statusOf({ lines: LINES }), 'awake', null);
    expect(view.words).toBe('Connected');
    expect(view.line).toBe('Connected');
  });

  it('warns when the robot is awake but off its base', () => {
    const view = robotView(statusOf({ robot: reportOf(['Not on base']) }), 'awake', false);
    expect(view.chip).toEqual({ tone: 'warning', label: 'Off its base' });
    expect(view.line).toBe(`Off its base · last seen ${clock(CONTACT)}`);
    expect(view.words).toBe('Off its base');
  });

  it('says what it is doing while in a conversation', () => {
    const listening = robotView(statusOf({ conversation: true }), 'listening', true);
    expect(listening.chip.label).toBe('Listening');
    expect(listening.line).toBe(`Listening… · On its base · last seen ${clock(CONTACT)}`);
    const speaking = robotView(statusOf({ conversation: true, lines: LINES }), 'speaking', true);
    expect(speaking.chip).toEqual({ tone: 'info', label: 'Speaking' });
    expect(speaking.line).toBe('Answering · On its base');
  });

  it('describes a sleeping robot with when it was last seen and no quote', () => {
    const view = robotView(statusOf({ lines: LINES }), 'asleep', true);
    expect(view.chip).toEqual({ tone: 'neutral', label: 'Asleep' });
    expect(view.line).toBe(`Asleep or away from Wi‑Fi · last seen ${clock(CONTACT)}`);
    expect(view.quote).toBeNull();
    expect(view.asleep).toBe(true);
  });

  it('leaves out the time when the robot has never made contact', () => {
    const view = robotView(statusOf({ contact: null }), 'asleep', null);
    expect(view.line).toBe('Asleep or away from Wi‑Fi');
  });

  it('puts a failed server before everything else', () => {
    const status = statusOf({ server: { state: 'failed', reason: 'Port 443 is taken' } });
    const view = robotView(status, 'awake', true);
    expect(view.chip).toEqual({ tone: 'critical', label: 'Needs attention' });
    expect(view.line).toBe('AIBI’s server did not start');
    expect(view.critical).toBe(true);
    expect(view.problem).toBe(true);
    expect(view.settings).toBe(true);
    expect(view.quote).toBeNull();
  });

  it('asks for a key as a warning, not an error', () => {
    const view = robotView(statusOf({ configured: false }), 'awake', true);
    expect(view.chip.tone).toBe('warning');
    expect(view.critical).toBe(false);
    expect(view.problem).toBe(true);
    expect(view.settings).toBe(false);
  });

  it('has no problem while all is well', () => {
    expect(robotView(statusOf(), 'awake', true).problem).toBe(false);
    expect(robotView(statusOf(), 'asleep', true).problem).toBe(false);
  });
});

describe('the moves caption', () => {
  it('says moves wait while the robot sleeps', () => {
    expect(gridCaption(statusOf(), true)).toBe('Moves wait until AIBI wakes up.');
  });

  it('invites a tap during a conversation and explains the delay otherwise', () => {
    expect(gridCaption(statusOf({ conversation: true }), false)).toBe(
      'Tap a move and AIBI does it.',
    );
    expect(gridCaption(statusOf(), false)).toBe('Moves are sent with AIBI’s next answer.');
  });
});
