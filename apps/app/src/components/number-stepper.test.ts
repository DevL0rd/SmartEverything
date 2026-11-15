import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface InputProps {
  readonly className?: string;
  readonly value?: string;
}

const seen = vi.hoisted((): { inputs: InputProps[]; idiom: 'pointer' | 'touch' } => ({
  inputs: new Array<InputProps>(),
  idiom: 'touch',
}));

vi.mock('react-native', async () => {
  const react = await import('react');
  return {
    View: ({ children }: { readonly children?: ReactNode }): ReactNode =>
      react.createElement('div', null, children),
    TextInput: (props: InputProps): null => {
      seen.inputs.push(props);
      return null;
    },
  };
});

vi.mock('../design/platform', () => ({ useIdiom: (): string => seen.idiom }));
vi.mock('../platform/haptics', () => ({ selectionTick: (): void => undefined }));
vi.mock('./icon-button', () => ({ IconButton: (): null => null }));
vi.mock('./text', () => ({
  Text: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    createElement('span', null, children),
}));

const { NumberStepper } = await import('./number-stepper');

function inputClasses(idiom: 'pointer' | 'touch'): readonly string[] {
  seen.idiom = idiom;
  seen.inputs.length = 0;
  renderToStaticMarkup(
    createElement(NumberStepper, {
      value: 5,
      min: 0,
      max: 10,
      step: 1,
      label: 'Repeats',
      onChange: (): void => undefined,
    }),
  );
  return seen.inputs[0]?.className?.split(' ') ?? [];
}

beforeEach(() => {
  seen.inputs.length = 0;
});

describe('NumberStepper value field', () => {
  it('is a 44 px tap target on touch', () => {
    const classes = inputClasses('touch');
    expect(classes).toContain('h-11');
    expect(classes).not.toContain('py-2');
  });

  it('stays compact with a pointer', () => {
    const classes = inputClasses('pointer');
    expect(classes).toContain('h-8');
    expect(classes).not.toContain('h-11');
  });
});
