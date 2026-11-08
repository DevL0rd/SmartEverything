import { describe, expect, it } from 'vitest';
import { SUBSCRIPTION_WEEK_MINUTES, weeklySubscriptionWindow } from '../src/ai-subscription-usage';

function window(
  id: string,
  minutes: number | null = SUBSCRIPTION_WEEK_MINUTES,
): { readonly id: string; readonly window_duration_mins: number | null } {
  return { id, window_duration_mins: minutes };
}

describe('weekly subscription allowance', () => {
  it('selects Claude’s aggregate allowance and omits model and shorter windows', () => {
    const weekly = window('seven_day', null);
    const model = window('seven_day_sonnet');
    const short = window('five_hour', 300);
    expect(weeklySubscriptionWindow({ runtime: 'claude', windows: [model, short, weekly] })).toBe(
      weekly,
    );
    expect(
      weeklySubscriptionWindow({ runtime: 'claude', windows: [model, short] }),
    ).toBeUndefined();
  });

  it('selects the ordinary Codex account for its reported seven-day duration', () => {
    const weekly = window('["codex","primary"]');
    const model = window('["model","secondary"]');
    const short = window('["codex","secondary"]', 300);
    expect(weeklySubscriptionWindow({ runtime: 'codex', windows: [model, short, weekly] })).toBe(
      weekly,
    );
    expect(weeklySubscriptionWindow({ runtime: 'codex', windows: [model, short] })).toBeUndefined();
    expect(
      weeklySubscriptionWindow({
        runtime: 'codex',
        windows: [window('primary', 300), window('secondary')],
      }),
    ).toEqual(window('secondary'));
  });

  it('leaves an unlabelled or ambiguous account allowance unavailable', () => {
    expect(weeklySubscriptionWindow(undefined)).toBeUndefined();
    expect(
      weeklySubscriptionWindow({
        runtime: 'codex',
        windows: [window('["account","primary"]'), window('["account","secondary"]')],
      }),
    ).toBeUndefined();
    expect(
      weeklySubscriptionWindow({
        runtime: 'codex',
        windows: [window('["account","primary"]', null)],
      }),
    ).toBeUndefined();
  });
});
