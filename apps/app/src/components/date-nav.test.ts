import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ButtonProps {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}

interface CellProps {
  readonly label: string;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}

const seen = vi.hoisted(() => ({
  buttons: new Array<ButtonProps>(),
  cells: new Array<CellProps>(),
  sheets: new Array<{ readonly open: boolean }>(),
}));

vi.mock('react-native', async () => {
  const react = await import('react');
  return {
    View: ({
      className,
      children,
    }: {
      readonly className?: string;
      readonly children?: ReactNode;
    }): ReactNode => react.createElement('div', { className }, children),
  };
});

vi.mock('../design/platform', () => ({ useIdiom: (): string => 'pointer' }));

vi.mock('./sheet', () => ({
  Sheet: (props: { readonly open: boolean; readonly children: ReactNode }): ReactNode => {
    seen.sheets.push(props);
    return props.children;
  },
}));

vi.mock('./interactive', () => ({
  Interactive: (props: CellProps & { readonly children?: ReactNode }): ReactNode => {
    seen.cells.push(props);
    return props.children;
  },
}));

vi.mock('./icon-button', () => ({
  IconButton: (props: ButtonProps): null => {
    seen.buttons.push(props);
    return null;
  },
}));

vi.mock('./icon', () => ({ Icon: (): null => null }));

vi.mock('./text', () => ({
  Text: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    createElement('span', null, children),
}));

const { DateNav } = await import('./date-nav');

type Range = 'day' | 'week' | 'month' | 'year';

function changeSpy(): ReturnType<typeof vi.fn<(date: Date) => void>> {
  return vi.fn<(date: Date) => void>();
}

function render(value: Date, range: Range, onChange = changeSpy(), max?: Date): string {
  seen.buttons.length = 0;
  seen.cells.length = 0;
  seen.sheets.length = 0;
  return renderToStaticMarkup(
    createElement(
      DateNav,
      max === undefined ? { value, range, onChange } : { value, range, onChange, max },
    ),
  );
}

function button(label: string): ButtonProps {
  const found = seen.buttons.find((entry) => entry.label === label);
  if (found === undefined) {
    throw new Error(`no button ${label}`);
  }
  return found;
}

function stepped(value: Date, range: Range, direction: 'Previous' | 'Next'): Date {
  const onChange = changeSpy();
  render(value, range, onChange);
  button(`${direction} ${range}`).onPress();
  expect(onChange).toHaveBeenCalledTimes(1);
  const date = onChange.mock.calls[0]?.[0];
  if (date === undefined) {
    throw new Error('expected a date');
  }
  return date;
}

function dayCells(): CellProps[] {
  return seen.cells.filter((cell) => !cell.label.endsWith('choose date'));
}

function blankCells(markup: string): number {
  return markup.split('<div class="flex-1 items-center"></div>').length - 1;
}

beforeEach(() => {
  seen.buttons.length = 0;
  seen.cells.length = 0;
  seen.sheets.length = 0;
});

describe('DateNav stepping', () => {
  it('moves a day at a time and keeps the time of day', () => {
    const value = new Date(2026, 9, 16, 14, 30);
    expect(stepped(value, 'day', 'Next')).toEqual(new Date(2026, 9, 17, 14, 30));
    expect(stepped(value, 'day', 'Previous')).toEqual(new Date(2026, 9, 15, 14, 30));
  });

  it('moves a week at a time across a month end', () => {
    const value = new Date(2026, 9, 30, 8, 0);
    expect(stepped(value, 'week', 'Next')).toEqual(new Date(2026, 10, 6, 8, 0));
    expect(stepped(value, 'week', 'Previous')).toEqual(new Date(2026, 9, 23, 8, 0));
  });

  it('moves a month at a time and lands on the last day of a shorter month', () => {
    expect(stepped(new Date(2026, 0, 31, 9, 15), 'month', 'Next')).toEqual(
      new Date(2026, 1, 28, 9, 15),
    );
    expect(stepped(new Date(2026, 2, 31), 'month', 'Previous')).toEqual(new Date(2026, 1, 28));
    expect(stepped(new Date(2028, 0, 31), 'month', 'Next')).toEqual(new Date(2028, 1, 29));
  });

  it('rolls over the year when stepping months', () => {
    expect(stepped(new Date(2026, 11, 15), 'month', 'Next')).toEqual(new Date(2027, 0, 15));
    expect(stepped(new Date(2026, 0, 15), 'month', 'Previous')).toEqual(new Date(2025, 11, 15));
  });

  it('moves a year at a time and lands on Feb 28 from a leap day', () => {
    expect(stepped(new Date(2028, 1, 29), 'year', 'Next')).toEqual(new Date(2029, 1, 28));
    expect(stepped(new Date(2026, 5, 10), 'year', 'Previous')).toEqual(new Date(2025, 5, 10));
  });

  it('disables next once the next period starts after the latest allowed date', () => {
    const max = new Date(2026, 9, 16, 12, 0);
    render(new Date(2026, 9, 16, 9, 0), 'day', changeSpy(), max);
    expect(button('Next day').disabled).toBe(true);
    render(new Date(2026, 9, 15, 9, 0), 'day', changeSpy(), max);
    expect(button('Next day').disabled).toBe(false);
  });

  it('stays enabled while the next period has started by the latest allowed date', () => {
    render(new Date(2026, 8, 20), 'month', changeSpy(), new Date(2026, 9, 5));
    expect(button('Next month').disabled).toBe(false);
  });

  it('never goes past the latest allowed date when it lands later in the period', () => {
    const max = new Date(2026, 9, 5);
    const onChange = changeSpy();
    render(new Date(2026, 8, 20), 'month', onChange, max);
    button('Next month').onPress();
    expect(onChange).toHaveBeenCalledWith(max);
  });

  it('is never disabled without a latest date', () => {
    render(new Date(2026, 9, 16), 'week');
    expect(button('Next week').disabled).toBe(false);
  });
});

describe('DateNav calendar', () => {
  it('starts closed and lists every day of the month with the value selected', () => {
    render(new Date(2026, 9, 16), 'day');
    expect(seen.sheets[0]?.open).toBe(false);
    const cells = dayCells();
    expect(cells).toHaveLength(31);
    expect(cells.map((cell) => cell.selected)).toEqual(
      Array.from({ length: 31 }, (_, index) => index === 15),
    );
  });

  it('pads the grid from Monday: Thursday the 1st gives three blanks before and one after', () => {
    const markup = render(new Date(2026, 9, 16), 'day');
    expect(blankCells(markup)).toBe(4);
  });

  it('needs no blanks for a February that starts on Monday and has 28 days', () => {
    const markup = render(new Date(2027, 1, 10), 'day');
    expect(dayCells()).toHaveLength(28);
    expect(blankCells(markup)).toBe(0);
  });

  it('counts the leap day', () => {
    render(new Date(2028, 1, 10), 'day');
    expect(dayCells()).toHaveLength(29);
  });

  it('disables the days after the latest allowed date', () => {
    render(new Date(2026, 9, 16), 'day', changeSpy(), new Date(2026, 9, 20, 12, 0));
    const disabled = dayCells().map((cell) => cell.disabled);
    expect(disabled.slice(0, 20).every((flag) => flag === false)).toBe(true);
    expect(disabled.slice(20).every((flag) => flag === true)).toBe(true);
  });

  it('picks a day by its date', () => {
    const onChange = changeSpy();
    render(new Date(2026, 9, 16), 'day', onChange);
    dayCells()[2]?.onPress();
    const picked = onChange.mock.calls[0]?.[0];
    expect(picked).toEqual(new Date(2026, 9, 3));
  });

  it('shifts the calendar month with its own previous button', () => {
    render(new Date(2026, 9, 16), 'month');
    expect(seen.buttons.filter((entry) => entry.label === 'Previous month')).toHaveLength(2);
  });
});
