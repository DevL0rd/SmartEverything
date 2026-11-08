import { describe, expect, it } from 'vitest';
import { landing, leafParams } from './route-landing.test-util';

describe('fitness links', () => {
  it('open every section inside the Fitness tab section switcher', () => {
    expect(landing('/fitness')).toBe('(fitness) > fitness/(sections) > index');
    for (const section of ['activity', 'nutrition', 'heart', 'sleep', 'body', 'vitals']) {
      expect(landing(`/fitness/${section}`)).toBe(`(fitness) > fitness/(sections) > ${section}`);
    }
    expect(landing('/fitness/workouts')).toBe('(fitness) > fitness/(sections) > workouts/index');
  });

  it('keep detail pages as pushes on the Fitness stack', () => {
    expect(landing('/fitness/workouts/w1')).toBe('(fitness) > fitness/workouts/[workoutId]');
    expect(landing('/fitness/metric/steps')).toBe('(fitness) > fitness/metric/[metric]');
    expect(landing('/fitness/browse')).toBe('(fitness) > fitness/browse');
  });

  it('stay inside the assistant when opened from a chat', () => {
    const chat = ['(app)', '(z-assistant)', 'assistant/chat/[chatId]'];
    expect(landing('/fitness/activity', chat)).toBe('(z-assistant) > fitness/activity');
    expect(landing('/fitness/workouts', chat)).toBe('(z-assistant) > fitness/workouts/index');
    expect(landing('/fitness/metric/steps', chat)).toBe('(z-assistant) > fitness/metric/[metric]');
  });

  it('open the Fitness tab from any other tab', () => {
    expect(landing('/fitness/heart', ['(app)', '(home)', 'index'])).toBe(
      '(fitness) > fitness/(sections) > heart',
    );
  });

  it('carry the day and the start flag to the section they open', () => {
    expect(leafParams('/fitness/heart?day=2026-10-01')).toEqual({ day: '2026-10-01' });
    expect(leafParams('/fitness/workouts?start=1')).toEqual({ start: '1' });
  });
});
