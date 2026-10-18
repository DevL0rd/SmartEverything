import { describe, expect, it, vi } from 'vitest';
import type { ShellyArea } from '@smarteverything/shelly';
import { z } from 'zod';
import { painterViewport } from './painter-viewport';
import { painterGesture, type PainterGestureInput } from './use-painter-gesture';

const ROOM: ShellyArea = [[0, 4, 3, 0]];
const WIDTH = 160;

const HANDLER = z.custom<(event: unknown) => void>((value) => typeof value === 'function');
const HANDLERS = z.object({
  onBegin: HANDLER,
  onUpdate: HANDLER,
  onEnd: HANDLER,
  onFinalize: z.custom<() => void>((value) => typeof value === 'function'),
});
type Handlers = z.infer<typeof HANDLERS>;

function touch(x: number, y: number): object {
  return { x, y, translationX: 0, translationY: 0 };
}

function setup(overrides: Partial<PainterGestureInput> = {}): {
  readonly handlers: Handlers;
  readonly change: ReturnType<typeof vi.fn>;
  readonly rejected: ReturnType<typeof vi.fn>;
  readonly preview: ReturnType<typeof vi.fn>;
} {
  const change = vi.fn();
  const rejected = vi.fn();
  const preview = vi.fn();
  const gesture = painterGesture({
    area: [],
    allowed: ROOM,
    tool: 'paint',
    width: WIDTH,
    viewport: painterViewport([]),
    disabled: false,
    change,
    cursor: vi.fn(),
    preview,
    rejected,
    ...overrides,
  });
  return { handlers: HANDLERS.parse(Reflect.get(gesture, 'handlers')), change, rejected, preview };
}

describe('painterGesture', () => {
  it('commits a stroke inside the main room into the zone area when the finger lifts', () => {
    const { handlers, change, rejected } = setup();
    handlers.onBegin(touch(65, 15));
    handlers.onEnd(touch(65, 15));
    expect(change).toHaveBeenCalledWith([[1, 2, 2, 1]]);
    expect(rejected).toHaveBeenLastCalledWith(false);
  });

  it('flags a stroke wholly outside the main room and changes nothing', () => {
    const { handlers, change, rejected } = setup();
    handlers.onBegin(touch(5, 5));
    handlers.onEnd(touch(5, 5));
    expect(change).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenLastCalledWith(true);
  });

  it('clears the rejection as soon as the next touch begins', () => {
    const { handlers, rejected } = setup();
    handlers.onBegin(touch(5, 5));
    expect(rejected).toHaveBeenLastCalledWith(false);
  });

  it('clears the live preview when the touch ends', () => {
    const { handlers, preview } = setup();
    handlers.onFinalize();
    expect(preview).toHaveBeenLastCalledWith([]);
  });
});
