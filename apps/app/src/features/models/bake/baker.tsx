'use dom';

import { useDOMImperativeHandle } from 'expo/dom';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { background } from '@smarteverything/logging';
import { useStableCallback } from '../../../design/use-stable-callback';
import { bakeDriver, refuseBake, type BakeDriver, type BakeEvents } from './bake-engines';
import { BAKE_MESSAGE, type BakerDomProps, type BakerHandle } from './bake-protocol';

const FRAME = { width: '100%', height: '100%', overflow: 'hidden' } as const;

const CANVAS = { width: '100%', height: '100%', display: 'block' } as const;

function useDriver(
  events: BakeEvents,
): readonly [RefObject<BakeDriver | null>, (canvas: HTMLCanvasElement | null) => void] {
  const driver = useRef<BakeDriver | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (canvas === null) return undefined;
    const made = bakeDriver(canvas, events);
    driver.current = made;
    made.start();
    return (): void => {
      made.dispose();
      driver.current = null;
    };
  }, [canvas, events]);
  return [driver, setCanvas];
}

export default function Baker(props: BakerDomProps): ReactNode {
  const { ref } = props;
  const onReady = useStableCallback(props.onReady);
  const onResult = useStableCallback(props.onResult);
  const onLost = useStableCallback(props.onLost);
  const onUnavailable = useStableCallback(props.onUnavailable);
  const events = useMemo<BakeEvents>(
    () => ({
      ready: (): void => {
        background(onReady(), 'model.bake_report_failed');
      },
      result: (text): void => {
        background(onResult(text), 'model.bake_send_failed');
      },
      lost: (cause): void => {
        background(onLost(cause), 'model.bake_report_failed');
      },
      unavailable: (detail): void => {
        background(onUnavailable(detail), 'model.bake_report_failed');
      },
    }),
    [onReady, onResult, onLost, onUnavailable],
  );
  const [driver, attach] = useDriver(events);
  useDOMImperativeHandle<BakerHandle>(
    ref,
    () => ({
      bake: (...args): void => {
        const [text] = BAKE_MESSAGE.parse(args);
        if (driver.current === null) {
          refuseBake(events, text, 'the baker has no driver');
          return;
        }
        driver.current.send(text);
      },
    }),
    [driver, events],
  );
  return (
    <div style={FRAME} aria-hidden>
      <canvas ref={attach} style={CANVAS} />
    </div>
  );
}
