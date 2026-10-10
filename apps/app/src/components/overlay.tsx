import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { cn } from '../design/cn';
import { useEscape } from './use-escape';

export interface OverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly label: string;
  readonly scrim: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

export function Overlay({
  open,
  onClose,
  label,
  scrim,
  className,
  children,
}: OverlayProps): ReactNode {
  useEscape(open, onClose);
  return (
    <Modal
      transparent
      visible={open}
      onRequestClose={onClose}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className={cn('flex-1', className)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${label}`}
          onPress={onClose}
          className={cn('absolute inset-0', scrim && 'bg-scrim')}
        />
        {children}
      </View>
    </Modal>
  );
}
