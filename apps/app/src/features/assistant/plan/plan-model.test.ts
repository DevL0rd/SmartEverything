import { describe, expect, it } from 'vitest';
import { planModeView } from './plan-model';

describe('planModeView', () => {
  it('offers only Turn on while plan mode is off or not reported', () => {
    expect(planModeView(undefined)).toStrictEqual({
      status: 'Off',
      action: 'Turn on',
      line: '/plan',
    });
    expect(planModeView({ active: false, pending: false }).action).toBe('Turn on');
  });

  it('offers only Turn off while plan mode is on', () => {
    expect(planModeView({ active: true, pending: false })).toStrictEqual({
      status: 'On',
      action: 'Turn off',
      line: '/plan off',
    });
  });

  it('says what the next message will do and offers the way back', () => {
    expect(planModeView({ active: false, pending: true })).toStrictEqual({
      status: 'Turns on with your next message',
      action: 'Turn off',
      line: '/plan off',
    });
    expect(planModeView({ active: true, pending: true })).toStrictEqual({
      status: 'Turns off with your next message',
      action: 'Turn on',
      line: '/plan',
    });
  });
});
