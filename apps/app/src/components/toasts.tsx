import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { isNative } from '../design/platform';
import { useSizeClass } from '../design/size-class';
import { ToastCard } from './toast-card';
import { useKeyboardObstacle, useMeasuredFrame, useToastRoom, type Frame } from './toast-obstacles';
import { isUndoChord, setToastCapacity, undoLatestToast, useShownToasts } from './toast-store';

const CAPACITY = { touch: 1, pointer: 3 } as const;

const EDITING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

function useUndoShortcut(): void {
  useEffect(() => {
    if (isNative()) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      const editing = event.target instanceof Element && event.target.closest(EDITING) !== null;
      const chord = {
        key: event.key,
        mod: event.metaKey || event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
        editing,
      };
      if (isUndoChord(chord) && undoLatestToast()) {
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, []);
}

export function Toasts(): ReactNode {
  const { nav, idiom } = useSizeClass();
  const [host, setHost] = useState<Frame | null>(null);
  const { attach, onLayout } = useMeasuredFrame(setHost);
  const room = useToastRoom(host);
  const shown = useShownToasts();
  const place = { bottom: room.bottom ?? 0, left: room.start ?? 0 };
  useKeyboardObstacle();
  useUndoShortcut();
  useEffect(() => {
    setToastCapacity(CAPACITY[idiom]);
  }, [idiom]);
  return (
    <View ref={attach} onLayout={onLayout} pointerEvents="box-none" className="absolute inset-0">
      <View
        pointerEvents="box-none"
        style={place}
        className={cn(
          'absolute right-0 gap-2 px-gutter',
          room.bottom === null ? 'pb-safe-offset-4' : 'pb-3',
          room.start === null ? 'pl-safe-offset-4' : null,
          nav === 'bar' ? 'items-center' : 'items-start',
        )}
      >
        {shown.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </View>
    </View>
  );
}
