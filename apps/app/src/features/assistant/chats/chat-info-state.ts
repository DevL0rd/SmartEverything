import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

export function useChatInfo(): {
  readonly open: boolean;
  readonly show: () => void;
  readonly hide: () => void;
} {
  const [open, setOpen] = useState(false);
  const { sheet, section } = useLocalSearchParams<{ sheet?: string; section?: string }>();
  const requested = sheet === 'chat' && section !== 'browser';
  const [handled, setHandled] = useState(false);
  if (requested !== handled) {
    setHandled(requested);
    if (requested) setOpen(true);
  }
  useEffect(() => {
    if (sheet === 'chat' && section !== 'browser') {
      router.setParams({ sheet: undefined, section: undefined });
    }
  }, [sheet, section]);
  return {
    open,
    show: (): void => {
      setOpen(true);
    },
    hide: (): void => {
      setOpen(false);
    },
  };
}
