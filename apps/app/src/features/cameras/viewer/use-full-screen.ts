import { useEffect, useState } from 'react';
import { notify } from '../../../components/toast-store';
import { useSizeClass } from '../../../design/size-class';
import { fillScreen, immerse, onScreenFillEnded } from '../player/rtc';

export interface FullScreen {
  readonly immersive: boolean;
  readonly automatic: boolean;
  readonly manual: boolean;
  readonly toggle: () => void;
  readonly leave: () => void;
}

function filled(fill: boolean): void {
  fillScreen(fill).then(
    (result) => {
      if (result.kind === 'unavailable') {
        notify({ message: 'Full screen isn’t available', error: result.reason });
      }
    },
    (error: unknown) => {
      notify({
        message: 'Full screen didn’t open',
        error,
        tone: 'critical',
      });
    },
  );
}

function immersed(on: boolean): void {
  immerse(on).catch((error: unknown) => {
    notify({
      message: 'The system bars didn’t hide',
      error,
    });
  });
}

export function useFullScreen(startFull: boolean): FullScreen {
  const size = useSizeClass();
  const automatic = size.idiom === 'touch' && size.height === 'compact';
  const [manual, setManual] = useState(startFull);
  const immersive = manual || automatic;
  const automaticOnly = automatic && !manual;
  useEffect(() => {
    if (!automaticOnly) {
      return undefined;
    }
    immersed(true);
    return (): void => {
      immersed(false);
    };
  }, [automaticOnly]);
  useEffect(() => {
    if (!manual) {
      return undefined;
    }
    filled(true);
    const stop = onScreenFillEnded(() => {
      setManual(false);
    });
    return (): void => {
      stop();
      filled(false);
    };
  }, [manual]);
  return {
    immersive,
    automatic,
    manual,
    toggle: (): void => {
      setManual(!manual);
    },
    leave: (): void => {
      setManual(false);
    },
  };
}
