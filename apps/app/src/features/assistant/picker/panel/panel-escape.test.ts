import { describe, expect, it } from 'vitest';
import { EscapeStack } from '../../../../components/use-escape';
import { panelEscapeOf } from './panel-escape';
import type { PanelPage } from './panel-state';

function press(page: PanelPage, text: string): string[] {
  const stack = new EscapeStack();
  const fired: string[] = [];
  const escape = panelEscapeOf(page, text);
  if (escape !== 'close') {
    stack.push({
      eligible: () => true,
      run: () => {
        fired.push(escape);
      },
    });
  }
  stack.push({
    eligible: () => true,
    run: () => {
      fired.push('close');
    },
  });
  stack.fire();
  return fired;
}

describe('Esc in the model panel', () => {
  it('goes back from the machine and thinking pages before anything else', () => {
    expect(panelEscapeOf('machine', 'sonnet')).toBe('back');
    expect(press('thinking', '')).toEqual(['back']);
  });

  it('clears the search before closing', () => {
    expect(press('main', 'sonnet')).toEqual(['clear']);
  });

  it('closes the panel from the main page with an empty search', () => {
    expect(press('main', '')).toEqual(['close']);
  });
});
