import type { ReactNode } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NODE_REGISTRY } from '@smarteverything/domain';

vi.mock('./condition-editor', () => ({
  ConditionEditor: (): ReactNode => 'ConditionEditor',
}));

const { LiteralEditor } = await import('./literal-editor');
const { fieldOf } = await import('../schema-fields');

describe('LiteralEditor', () => {
  it('renders the condition editor for the device trigger test port', () => {
    const port = NODE_REGISTRY.get('trigger.device')?.inputs.find((input) => input.name === 'test');
    expect(port).toBeDefined();
    if (port === undefined) return;
    const html = renderToStaticMarkup(
      createElement(LiteralEditor, {
        control: fieldOf(port).control,
        label: 'Only when the value',
        value: undefined,
        disabled: false,
        onChange: () => undefined,
      }),
    );
    expect(html).toBe('ConditionEditor');
  });
});
