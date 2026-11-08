import { createElement, type KeyboardEvent, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type * as NativeModule from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Interactive } from '../../../components/interactive';
import { Segmented } from '../../../components/segmented';
import { AIR_RANGES, type AirRange } from '../data/air-history';

type KeyInput = Pick<KeyboardEvent, 'key' | 'repeat' | 'preventDefault' | 'stopPropagation'>;

interface RecordedPressable extends Omit<NativeModule.PressableProps, 'onPress'> {
  readonly onKeyDown?: (event: KeyInput) => void;
  readonly onPress?: () => void;
}

const { platform, recorded } = vi.hoisted(() => ({
  platform: { native: false },
  recorded: new Array<RecordedPressable>(),
}));

vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<typeof NativeModule>();
  return {
    ...original,
    Pressable: (props: RecordedPressable): ReactNode => {
      recorded.push(props);
      return createElement(original.Pressable, props);
    },
  };
});

vi.mock('../../../design/platform', () => ({
  isNative: (): boolean => platform.native,
  useIdiom: (): 'pointer' => 'pointer',
}));
vi.mock('../../../design/colour', () => ({ useColour: (): string => 'currentColor' }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../platform/haptics', () => ({ selectionTick: vi.fn() }));
vi.mock('../../../queries/history', () => ({ readHistory: vi.fn() }));

function control(label: string): RecordedPressable {
  const found = recorded.findLast((props) => props.accessibilityLabel === label);
  if (found === undefined) throw new Error(`Missing pressable: ${label}`);
  return found;
}

function keyInput(key: string, repeat = false): KeyInput {
  return { key, repeat, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

function renderChoice(
  role: 'checkbox' | 'radio' | 'switch',
  onPress: () => void,
  disabled = false,
): RecordedPressable {
  const props = {
    label: 'Choice',
    role,
    checked: false,
    disabled,
    onPress,
    children: 'Choice',
  } satisfies Parameters<typeof Interactive>[0];
  renderToStaticMarkup(createElement(Interactive, props));
  return control('Choice');
}

beforeEach(() => {
  platform.native = false;
  recorded.length = 0;
});

describe('Interactive tab selection', () => {
  it.each([true, false])('exposes aria-selected=%s on web tabs', (selected) => {
    const props = {
      label: 'Workouts',
      role: 'tab',
      selected,
      children: 'Workouts',
    } satisfies Parameters<typeof Interactive>[0];
    const markup = renderToStaticMarkup(createElement(Interactive, props));
    expect(markup).toContain('role="tab"');
    expect(markup).toContain(`aria-selected="${String(selected)}"`);
  });
});

describe('Interactive choice activation', () => {
  it.each(['checkbox', 'radio', 'switch'] as const)(
    'uses Space once per key press for a %s without scrolling or consuming Enter',
    (role) => {
      const onPress = vi.fn();
      const control = renderChoice(role, onPress);
      const space = keyInput(' ');
      control.onKeyDown?.(space);
      control.onKeyDown?.(keyInput(' ', true));
      const enter = keyInput('Enter');
      control.onKeyDown?.(enter);
      expect(onPress).toHaveBeenCalledOnce();
      expect(space.preventDefault).toHaveBeenCalledOnce();
      expect(space.stopPropagation).toHaveBeenCalledOnce();
      expect(enter.preventDefault).not.toHaveBeenCalled();
      expect(enter.stopPropagation).not.toHaveBeenCalled();
      expect(control.onPress).toBe(onPress);
    },
  );

  it.each(['checkbox', 'radio', 'switch'] as const)(
    'leaves disabled and native %s activation to the platform pressable',
    (role) => {
      const onPress = vi.fn();
      expect(renderChoice(role, onPress, true)).toMatchObject({ disabled: true });
      expect(control('Choice').onKeyDown).toBeUndefined();
      platform.native = true;
      const native = renderChoice(role, onPress);
      expect(native.onKeyDown).toBeUndefined();
      expect(native.onPress).toBe(onPress);
    },
  );
});

describe('Air history period control', () => {
  it('updates the checked period when Space selects 7 d', () => {
    let range: AirRange = '24h';
    const renderPeriod = (): string =>
      renderToStaticMarkup(
        createElement(Segmented<AirRange>, {
          label: 'Period',
          options: AIR_RANGES,
          value: range,
          onChange: (value): void => {
            range = value;
          },
        }),
      );
    renderPeriod();
    expect(control('7 d')['aria-checked']).toBe(false);
    control('7 d').onKeyDown?.(keyInput(' '));
    expect(range).toBe('7d');
    renderPeriod();
    expect(control('7 d')['aria-checked']).toBe(true);
    expect(control('24 h')['aria-checked']).toBe(false);
  });
});
