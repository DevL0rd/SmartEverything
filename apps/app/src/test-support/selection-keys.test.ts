import { createElement, type KeyboardEvent, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type * as NativeModule from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestSheet } from '../features/automations/runs/test/test-sheet';
import { RingChoice } from '../plugins/oralb/settings/ring-choice';
import { ColourPicker } from '../components/colour-picker';
import { ColourStrip } from '../components/colour-strip';

type KeyInput = Pick<KeyboardEvent, 'key' | 'repeat' | 'preventDefault' | 'stopPropagation'>;

interface RecordedPressable extends NativeModule.PressableProps {
  readonly onKeyDown?: (event: KeyInput) => void;
}

const { recorded, setRing } = vi.hoisted(() => ({
  recorded: new Array<RecordedPressable>(),
  setRing: vi.fn(() => Promise.resolve(true)),
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

vi.mock('../design/platform', () => ({
  isNative: (): boolean => false,
  useIdiom: (): 'pointer' => 'pointer',
}));
vi.mock('../design/colour', () => ({ useColour: (): string => 'currentColor' }));
vi.mock('../platform/haptics', () => ({ selectionTick: vi.fn() }));
vi.mock('../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../components/sheet', () => ({
  Sheet: ({ children }: { children: ReactNode }): ReactNode => children,
}));
vi.mock('../features/automations/runs/test/overrides', () => ({ Overrides: (): null => null }));
vi.mock('../features/automations/runs/test/payload-form', () => ({
  PayloadForm: (): null => null,
}));
vi.mock('../features/automations/runs/test/run-for-real', () => ({ RunForReal: (): null => null }));
vi.mock('../store/control', () => ({
  useControl: (): { set: typeof setRing } => ({ set: setRing }),
}));
vi.mock('../plugins/toothbrush/settings/anchored', () => ({
  Anchored: ({ children }: { children: ReactNode }): ReactNode => children,
}));
vi.mock('react-native-reanimated', () => ({ useSharedValue: vi.fn() }));
vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: ReactNode }): ReactNode => children,
  Gesture: {
    Pan: (): unknown => {
      const chain = {
        enabled: (): unknown => chain,
        runOnJS: (): unknown => chain,
        minDistance: (): unknown => chain,
        onBegin: (): unknown => chain,
        onUpdate: (): unknown => chain,
        onFinalize: (): unknown => chain,
      };
      return chain;
    },
  },
}));

function control(label: string): RecordedPressable {
  const found = recorded.findLast((props) => props.accessibilityLabel === label);
  if (found === undefined) throw new Error(`Missing pressable: ${label}`);
  return found;
}

function activate(label: string, repeat = false): void {
  const event = { key: ' ', repeat, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  control(label).onKeyDown?.(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(event.stopPropagation).toHaveBeenCalledOnce();
}

const presets = [
  { id: 'blue', label: 'Blue', colour: '#00f' },
  { id: 'green', label: 'Green', colour: '#0f0' },
];

function sheetMarkup(lastEvent: Parameters<typeof TestSheet>[0]['lastEvent']): string {
  return renderToStaticMarkup(
    createElement(TestSheet, {
      open: true,
      automationId: 'test',
      name: 'Sample automation',
      note: null,
      fields: [],
      lastEvent,
      breakpoints: [],
      starting: null,
      onClose: vi.fn(),
      onTest: vi.fn(),
      onRealRun: vi.fn(() => Promise.resolve()),
    }),
  );
}

function ringMarkup(open: boolean): string {
  return renderToStaticMarkup(
    createElement(RingChoice, {
      deviceId: 'brush',
      gate: { open, reason: null },
      handle: { ringColour: 'blue' },
    }),
  );
}

beforeEach(() => {
  recorded.length = 0;
  setRing.mockClear();
});

describe('selection controls on web', () => {
  it('tabs into the selected colour strip swatch and activates it with Space', () => {
    const onPick = vi.fn();
    renderToStaticMarkup(
      createElement(ColourStrip, {
        label: 'Colour',
        swatches: presets,
        selectedId: 'green',
        onPick,
        onMore: vi.fn(),
      }),
    );
    expect(control('Green')).toMatchObject({ tabIndex: 0, 'aria-checked': true });
    expect(control('Blue')).toMatchObject({ tabIndex: -1, 'aria-checked': false });
    activate('Green');
    activate('Green', true);
    expect(onPick.mock.calls).toEqual([['green']]);
  });

  it('exposes the starting value and only handles Space on available test-sheet cards', () => {
    sheetMarkup({ label: 'A trigger fired', values: {} });
    const typed = 'Values I type. Fill in what the trigger would give.';
    expect(control('Last real event. A trigger fired')).toMatchObject({
      tabIndex: 0,
      'aria-checked': true,
    });
    expect(control(typed)).toMatchObject({ tabIndex: 0, 'aria-checked': false });
    activate(typed);

    sheetMarkup(null);
    const unavailable = control('Last real event. Nothing has triggered this yet.');
    expect(unavailable).toMatchObject({ tabIndex: -1, disabled: true, 'aria-checked': false });
    expect(unavailable.onKeyDown).toBeUndefined();
    expect(control(typed)['aria-checked']).toBe(true);
  });

  it('commits a colour picker preset once with Space and announces its checked state', () => {
    const onCommit = vi.fn();
    const warm = { hue: 32, saturation: 52, value: 100 };
    const props = { value: warm, label: 'Colour', onChange: vi.fn(), onCommit };
    renderToStaticMarkup(createElement(ColourPicker, props));
    expect(control('Warm')['aria-checked']).toBe(true);
    expect(control('Candle')['aria-checked']).toBe(false);
    activate('Warm');
    activate('Warm', true);
    expect(onCommit.mock.calls).toEqual([[warm]]);

    renderToStaticMarkup(createElement(ColourPicker, { ...props, disabled: true }));
    expect(control('Warm').disabled).toBe(true);
    expect(control('Warm').onKeyDown).toBeUndefined();
  });

  it('sends one ring colour choice with Space and exposes the locked selection', () => {
    ringMarkup(true);
    expect(control('Blue, current colour')['aria-checked']).toBe(true);
    expect(control('White')['aria-checked']).toBe(false);
    activate('White');
    activate('White', true);
    expect(setRing.mock.calls).toEqual([['white']]);

    recorded.length = 0;
    const locked = ringMarkup(false);
    expect(locked).toMatch(
      /<div(?=[^>]*aria-label="Blue, current colour")(?=[^>]*aria-checked="true")(?=[^>]*aria-disabled="true")(?=[^>]*tabindex="-1")/,
    );
    expect(recorded).toHaveLength(0);
  });
});
