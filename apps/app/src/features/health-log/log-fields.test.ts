import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { logFormOf } from './forms';
import { LogFields } from './log-fields';

vi.mock('react-native', () => ({ View: 'div' }));
vi.mock('../../components/date-nav', () => ({ DateNav: (): null => null }));
vi.mock('../../components/number-stepper', () => ({ NumberStepper: (): null => null }));
vi.mock('../../components/select', () => ({ Select: (): null => null }));
vi.mock('../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('span', null, children),
}));
vi.mock('../../components/text-field', () => ({ TextField: (): null => null }));
vi.mock('../../components/time-field', () => ({ TimeField: (): null => null }));
vi.mock('../../store/clock-format', () => ({ useHour24: (): boolean => true }));

function fieldsOf(type: string): string {
  const form = logFormOf(type);
  if (form === null) throw new Error(`Missing health log form ${type}`);
  return renderToStaticMarkup(createElement(LogFields, { form, values: {}, onChange: vi.fn() }));
}

describe('Health log fields', () => {
  it.each(['MenstruationPeriod', 'IntermenstrualBleeding'])(
    'leaves no field group before the timing controls for %s',
    (type) => {
      expect(fieldsOf(type)).toBe('');
    },
  );

  it('renders the field group for weight', () => {
    expect(fieldsOf('Weight')).toContain('<span>Weight</span>');
  });
});
