import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useStableCallback } from '../../../design/use-stable-callback';
import { HoldRepeat, type HoldSource } from './hold-repeat';

export interface HoldHandlers {
  readonly onPressIn: () => void;
  readonly onPressOut: () => void;
  readonly onPress: () => void;
  readonly onBlur: () => void;
}

type Latest = Pick<HoldSource, 'fire' | 'rateMs' | 'held'>;

function nothing(): void {
  return undefined;
}

function watchBackground(onBackground: () => void): () => void {
  const subscription = AppState.addEventListener('change', onBackground);
  return (): void => {
    subscription.remove();
  };
}

function handlersOf(hold: HoldRepeat): HoldHandlers {
  return {
    onPressIn: (): void => {
      hold.pressIn();
    },
    onPressOut: (): void => {
      hold.pressOut();
    },
    onPress: (): void => {
      hold.press();
    },
    onBlur: (): void => {
      hold.cancel();
    },
  };
}

export function useHoldRepeat(
  fire: Latest['fire'],
  rateMs: Latest['rateMs'],
  held: Latest['held'] = nothing,
): HoldHandlers {
  const latest = useStableCallback((): Latest => ({ fire, rateMs, held }));
  const [bound] = useState(() => {
    const hold = new HoldRepeat({
      fire: (stop): void => {
        latest().fire(stop);
      },
      rateMs: (): number | null => latest().rateMs(),
      held: (): void => {
        latest().held();
      },
      watchBackground,
    });
    return { hold, handlers: handlersOf(hold) };
  });
  useEffect(
    (): (() => void) => () => {
      bound.hold.cancel();
    },
    [bound],
  );
  return bound.handlers;
}
