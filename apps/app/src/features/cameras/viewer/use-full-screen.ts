import { useEffect, useState } from 'react';
import { Logger } from '@smarteverything/logging';
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

const log = new Logger('app.cameras');

function filled(fill: boolean): void {
  fillScreen(fill).then(
    (result) => {
      log.debug('fullscreen.filled', { fill, result: result.kind });
      if (result.kind === 'unavailable') {
        log.warn('fullscreen.unavailable', { fill, reason: result.reason });
        notify({ message: 'Full screen isn’t available', error: result.reason });
      }
    },
    (error: unknown) => {
      log.error('fullscreen.fill_failed', error, { fill });
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
    log.error('fullscreen.immerse_failed', error, { on });
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
  useEffect(() => {
    log.info('fullscreen.mode_changed', { manual, automatic });
  }, [manual, automatic]);
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
      log.info('fullscreen.fill_ended', {});
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
