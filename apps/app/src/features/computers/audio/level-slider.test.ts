import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface SliderProps {
  onChange: (level: number) => void;
  onCommit: (level: number) => void;
}

const sliders = vi.hoisted((): SliderProps[] => []);

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: (props: { children?: ReactNode }): ReactNode => props.children,
}));
vi.mock('../../../components/slider', () => ({
  Slider: (props: SliderProps): null => {
    sliders.push(props);
    return null;
  },
}));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));

import { LevelSlider } from './level-slider';

const roots: ReturnType<typeof createRoot>[] = [];

function mount(muted: boolean, onCommit: () => void, onUnmute: () => void): () => SliderProps {
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  roots.push(root);
  act(() => {
    root.render(
      createElement(LevelSlider, {
        label: 'Speakers volume',
        value: 40,
        max: 100,
        disabled: false,
        muted,
        onCommit,
        onUnmute,
      }),
    );
  });
  return (): SliderProps => {
    const [latest] = sliders.slice(-1);
    if (latest === undefined) throw new Error('No slider');
    return latest;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  sliders.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a volume slider being dragged', () => {
  it('sends the first level at once and then the latest one every 100 ms', () => {
    const onCommit = vi.fn();
    const slider = mount(false, onCommit, vi.fn());
    act(() => {
      slider().onChange(10);
    });
    act(() => {
      slider().onChange(20);
      slider().onChange(30);
    });
    expect(onCommit.mock.calls.map((call: unknown[]) => call[0])).toEqual([10]);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onCommit.mock.calls.map((call: unknown[]) => call[0])).toEqual([10, 30]);
  });

  it('does not send the released level again when it was just sent', () => {
    const onCommit = vi.fn();
    const slider = mount(false, onCommit, vi.fn());
    act(() => {
      slider().onChange(10);
      slider().onCommit(10);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('sends the released level when it differs from the last one sent', () => {
    const onCommit = vi.fn();
    const slider = mount(false, onCommit, vi.fn());
    act(() => {
      slider().onChange(10);
      slider().onCommit(12);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onCommit.mock.calls.map((call: unknown[]) => call[0])).toEqual([10, 12]);
  });

  it('unmutes a muted slider once per drag', () => {
    const onUnmute = vi.fn();
    const slider = mount(true, vi.fn(), onUnmute);
    act(() => {
      slider().onChange(10);
      slider().onChange(20);
    });
    expect(onUnmute).toHaveBeenCalledTimes(1);
    act(() => {
      slider().onCommit(20);
    });
    act(() => {
      slider().onChange(30);
    });
    expect(onUnmute).toHaveBeenCalledTimes(2);
  });

  it('leaves an unmuted slider alone', () => {
    const onUnmute = vi.fn();
    const slider = mount(false, vi.fn(), onUnmute);
    act(() => {
      slider().onChange(10);
    });
    expect(onUnmute).not.toHaveBeenCalled();
  });
});
