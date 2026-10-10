import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useSizeClass } from '../design/size-class';
import { ToastCard } from './toast-card';
import { useKeyboardObstacle, useMeasuredFrame, useToastRoom, type Frame } from './toast-obstacles';
import { setToastCapacity, useShownToasts } from './toast-store';

const CAPACITY = { touch: 1, pointer: 3 } as const;

export function Toasts(): ReactNode {
  const { nav, idiom } = useSizeClass();
  const [host, setHost] = useState<Frame | null>(null);
  const { attach, onLayout } = useMeasuredFrame(setHost);
  const room = useToastRoom(host);
  const shown = useShownToasts();
  const place = { bottom: room.bottom ?? 0, left: room.start ?? 0 };
  useKeyboardObstacle();
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
