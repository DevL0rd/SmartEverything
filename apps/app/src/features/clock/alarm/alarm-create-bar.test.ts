import { isValidElement, type ReactElement } from 'react';
import { expect, it, vi } from 'vitest';
import { Button } from '../../../components/button';
import { AlarmCreateBar, type AlarmScreen } from './alarm-body';
import { newDraftOf } from './alarm-draft';

vi.mock('react-native', () => ({ View: (): null => null }));
vi.mock('../../../components/button', () => ({ Button: (): null => null }));
vi.mock('../../../components/text', () => ({}));
vi.mock('../../../store/clock', () => ({}));
vi.mock('../../../store/selectors', () => ({}));
vi.mock('../../../store/store-context', () => ({}));
vi.mock('../../planner', () => ({}));
vi.mock('../frame/hub-status', () => ({}));
vi.mock('./alarm-fields', () => ({}));
vi.mock('./alarm-challenge', () => ({}));
vi.mock('./alarm-sunrise', () => ({}));
vi.mock('./alarm-wake', () => ({}));
vi.mock('./ring-targets', () => ({}));
vi.mock('./use-alarm-edit', () => ({}));

interface BarProps {
  readonly className: string;
  readonly children: readonly ReactElement<{ readonly label: string; readonly grow?: boolean }>[];
}

const draft = newDraftOf(
  {
    sound: { kind: 'tone', id: 'default' },
    ramp_seconds: 30,
    snooze_minutes: 10,
    snooze_limit: null,
    targets: [],
    wake_automation_id: null,
    world_clocks: [],
  },
  '07:00',
);

const screen: AlarmScreen = {
  title: 'New alarm',
  editing: {
    draft,
    alarm: null,
    busy: false,
    change: vi.fn(),
    create: vi.fn(),
    skipNext: vi.fn(),
    ringNextAgain: vi.fn(),
    remove: vi.fn(),
  },
  fields: {
    draft,
    compact: false,
    now: 0,
    timeZone: 'UTC',
    weekStart: 1,
    disabled: false,
    skipOn: null,
    onChange: vi.fn(),
  },
};

it('gives its growing buttons the full footer width so their labels show', () => {
  const bar = AlarmCreateBar({ screen, onCancel: vi.fn() });
  if (!isValidElement<BarProps>(bar)) throw new Error('no bar');
  const buttons = bar.props.children.filter((child) => child.type === Button);
  expect(buttons.map((button) => button.props.label)).toEqual(['Cancel', 'Add alarm']);
  expect(buttons.every((button) => button.props.grow === true)).toBe(true);
  expect(bar.props.className.split(' ')).toContain('w-full');
});
