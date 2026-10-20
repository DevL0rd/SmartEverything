import { describe, expect, it } from 'vitest';
import { stepBar } from './brush-model';
import { oralbFrameOf, oralbSessionOf, oralbViewOf, sessionOf, viewOf } from './fixtures';
import {
  liveSteps,
  sessionZoneStates,
  stepCaption,
  timerLabel,
  timerProgress,
  zoneStates,
} from './stage-model';

const PROFILE = viewOf().profile;

describe('zone states while brushing', () => {
  it('shows finished zones as done, the running one as current and the rest as to do', () => {
    const states = zoneStates(stepBar('clean', 6, 120, 45));
    expect(states.get(1)).toBe('done');
    expect(states.get(2)).toBe('done');
    expect(states.get(3)).toBe('current');
    expect(states.get(4)).toBe('todo');
  });

  it('keeps a zone that comes round again current while it is being brushed', () => {
    const states = zoneStates(stepBar('white_plus', 6, 120, 105));
    expect(states.get(2)).toBe('done');
    expect(states.get(5)).toBe('current');
  });

  it('draws nothing for a mode without zones', () => {
    expect(zoneStates(stepBar('tongue_care', 6, 120, 10)).size).toBe(0);
  });
});

describe('the caption under the step bar', () => {
  it('names the step and the zone in plain words', () => {
    expect(stepCaption(PROFILE, stepBar('clean', 6, 120, 45))).toBe('Step 3 of 6: Upper right');
  });

  it('says the routine is finished at the end', () => {
    expect(stepCaption(PROFILE, stepBar('clean', 6, 120, 120))).toBe('Routine finished');
  });

  it('calls a step without a zone the whole mouth', () => {
    expect(stepCaption(PROFILE, stepBar('tongue_care', 6, 120, 10))).toBe(
      'Step 1 of 1: Whole mouth',
    );
  });
});

describe('the timer', () => {
  it('reads elapsed of total and never passes a full ring', () => {
    expect(timerLabel(65, 120)).toBe('1:05 of 2:00');
    expect(timerProgress(60, 120)).toBe(0.5);
    expect(timerProgress(200, 120)).toBe(1);
    expect(timerProgress(10, 0)).toBe(0);
  });
});

describe('zones of a finished session', () => {
  it('marks the zones reached as done and the ones a short session never got to as missed', () => {
    const states = sessionZoneStates(sessionOf({ durationS: 50, complete: false }), PROFILE);
    expect(states.get(1)).toBe('done');
    expect(states.get(2)).toBe('done');
    expect(states.get(6)).toBe('missed');
  });

  it('estimates nothing for a session without a mode or for a mode without zones', () => {
    expect(sessionZoneStates(sessionOf({ mode: null }), PROFILE).size).toBe(0);
    expect(sessionZoneStates(sessionOf({ mode: 'tongue_care' }), PROFILE).size).toBe(0);
  });
});

describe('an Oral-B brush timed by the handle’s pacer', () => {
  const profile = oralbViewOf().profile;

  it('follows the quarter the handle reports instead of the clock', () => {
    const frame = oralbFrameOf({ activity: 'brushing', session: 'running', elapsedS: 20, zone: 3 });
    const steps = liveSteps(frame, profile.zones, 120);
    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'current', 'todo']);
    expect(zoneStates(steps).get(3)).toBe('current');
  });

  it('starts at the first quarter before the handle names one and finishes them all at the end', () => {
    const early = liveSteps(oralbFrameOf({ elapsedS: 3, zone: null }), profile.zones, 120);
    expect(early.map((step) => step.state)).toEqual(['current', 'todo', 'todo', 'todo']);
    const end = liveSteps(oralbFrameOf({ elapsedS: 120, zone: 4 }), profile.zones, 120);
    expect(end.every((step) => step.state === 'done')).toBe(true);
  });

  it('keeps the clock estimate for a brush that has no pacer', () => {
    const steps = liveSteps(frameOf45(), 6, 120);
    expect(steps.map((step) => step.state).slice(0, 3)).toEqual(['done', 'done', 'current']);
  });

  it('marks the quarters a finished session filled and the ones it stopped short of', () => {
    const states = sessionZoneStates(oralbSessionOf(), profile);
    expect(states.get(1)).toBe('done');
    expect(states.get(2)).toBe('done');
    expect(states.get(3)).toBe('missed');
    expect(states.get(4)).toBe('missed');
  });
});

function frameOf45(): ReturnType<typeof oralbFrameOf> {
  return oralbFrameOf({ zoneSource: 'estimated', mode: 'clean', elapsedS: 45 });
}
