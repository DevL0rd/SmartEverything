import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { notify } from '../components/toast-store';
import { applyTheme } from '../design/theme';
import { PREFS, usePref } from '../store/prefs';

export function ThemeSync(): ReactNode {
  const appearance = usePref(PREFS.appearance);
  const warned = useRef(false);
  const settings = appearance.status === 'ready' ? appearance.value : PREFS.appearance.defaultValue;
  useEffect(() => {
    applyTheme(settings);
  }, [settings]);
  useEffect(() => {
    if (appearance.status === 'invalid' && !warned.current) {
      warned.current = true;
      notify({
        message: 'Your saved appearance could not be read',
        error: appearance.reason,
        tone: 'critical',
        action: { label: 'Reset', onPress: appearance.reset },
      });
    }
  }, [appearance]);
  return null;
}
