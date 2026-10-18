import { describe, expect, it } from 'vitest';
import type { NavigationAction } from 'expo-router/react-navigation';
import { popTabToRoot } from './tab-router';

function actionsFor(state: Parameters<typeof popTabToRoot>[0]['state']): NavigationAction[] {
  const sent: NavigationAction[] = [];
  popTabToRoot({ state }, (action) => {
    sent.push(action);
  });
  return sent;
}

interface Sections {
  key: string;
  type: string;
  index: number;
  routes: { key: string; name: string }[];
}

const sections = (index: number): Sections => ({
  key: 'sections-1',
  type: 'tab',
  index,
  routes: [
    { key: 'index-1', name: 'index' },
    { key: 'heart-1', name: 'heart' },
  ],
});

describe('pressing the shown tab again', () => {
  it('returns a section switcher to its first section', () => {
    const stack = {
      key: 'stack-1',
      type: 'stack',
      index: 0,
      routes: [{ key: 's', name: 'fitness/(sections)', state: sections(1) }],
    };
    expect(actionsFor(stack)).toEqual([
      { type: 'JUMP_TO', payload: { name: 'index' }, target: 'sections-1' },
    ]);
  });

  it('pops the stack and resets the section switcher under it', () => {
    const stack = {
      key: 'stack-1',
      type: 'stack',
      index: 1,
      routes: [
        { key: 's', name: 'fitness/(sections)', state: sections(1) },
        { key: 'm', name: 'fitness/metric/[metric]' },
      ],
    };
    expect(actionsFor(stack).map((action) => action.type)).toEqual(['POP_TO_TOP', 'JUMP_TO']);
  });

  it('does nothing when every level already shows its first screen', () => {
    const stack = {
      key: 'stack-1',
      type: 'stack',
      index: 0,
      routes: [{ key: 's', name: 'fitness/(sections)', state: sections(0) }],
    };
    expect(actionsFor(stack)).toEqual([]);
  });
});
