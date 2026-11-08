import { describe, it } from 'vitest';
import { ON, expectSignals, sample } from './signals-of-fixtures';

describe('switch and plug', () => {
  it('report the power draw as a level', () => {
    expectSignals('plug', sample({ load: 0.4 }), { ...ON, level: 0.4 });
    expectSignals('switch', sample({ load: 0.9 }), { ...ON, level: 0.9 });
  });

  it('report only power and online without a draw', () => {
    expectSignals('plug', sample({}), ON);
  });

  it('are off', () => {
    expectSignals('switch', sample({ power: 'off', load: 0 }), {
      power: false,
      online: true,
      level: 0,
    });
  });
});

describe('sensor', () => {
  it('reports presence, a contact and the battery in percent', () => {
    expectSignals('sensor', sample({ presence: true, open: true, battery: 80 }), {
      ...ON,
      presence: true,
      open: 1,
      battery: 0.8,
    });
  });

  it('closes the contact and clears presence', () => {
    expectSignals('sensor', sample({ presence: false, open: false }), {
      ...ON,
      presence: false,
      open: 0,
    });
  });

  it('counts radar objects', () => {
    expectSignals('sensor', sample({ presence: true, detection: { objects: 3, light: 'dark' } }), {
      ...ON,
      presence: true,
      objects: 3,
    });
  });

  it('leaves out a radar count that is unknown and keeps the battery inside 0 to 1', () => {
    expectSignals('sensor', sample({ detection: { objects: null, light: null }, battery: 140 }), {
      ...ON,
      battery: 1,
    });
  });
});

describe('camera', () => {
  it('reports motion and no head pose it cannot know', () => {
    expectSignals('camera', sample({ presence: true }), {
      ...ON,
      motion: true,
      cameraPan: null,
      cameraTilt: null,
    });
  });

  it('is offline', () => {
    expectSignals('camera', sample({ online: false, power: 'unknown' }), {
      power: false,
      online: false,
      cameraPan: null,
      cameraTilt: null,
    });
  });
});

describe('doorbell', () => {
  it('reports motion and the battery', () => {
    expectSignals('doorbell', sample({ presence: true, battery: 35 }), {
      ...ON,
      motion: true,
      battery: 0.35,
    });
  });

  it('rests', () => {
    expectSignals('doorbell', sample({}), ON);
  });
});

describe('button', () => {
  it('has no press yet', () => {
    expectSignals('button', sample({ power: 'unknown' }), { online: true, pressed: 'none' });
  });

  it.each(['single', 'double', 'long'] as const)('reports a %s press', (gesture) => {
    expectSignals(
      'button',
      sample({ power: 'unknown', button: { lastPress: { gesture, at: '2026-10-25T10:00:00Z' } } }),
      { online: true, pressed: gesture },
    );
  });
});

describe('lock', () => {
  it('is locked', () => {
    expectSignals('lock', sample({ locked: true, battery: 60 }), {
      ...ON,
      locked: true,
      battery: 0.6,
    });
  });

  it('is unlocked', () => {
    expectSignals('lock', sample({ locked: false }), { ...ON, locked: false });
  });

  it('is unknown', () => {
    expectSignals('lock', sample({}), ON);
  });
});

describe('cover', () => {
  it('is half open', () => {
    expectSignals('cover', sample({ position: 0.5 }), { ...ON, position: 0.5 });
  });

  it('is closed', () => {
    expectSignals('cover', sample({ position: 0 }), { ...ON, position: 0 });
  });

  it('has no position yet', () => {
    expectSignals('cover', sample({ battery: 10 }), { ...ON, battery: 0.1 });
  });
});
