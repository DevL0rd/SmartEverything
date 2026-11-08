import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Modal, type ModalProps } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { hideToastLayer, showToastLayer } from './toast-layers';
import { ToastLayer } from './toasts';

export function ToastModal({ visible = true, onShow, children, ...props }: ModalProps): ReactNode {
  const layer = useId();
  const shown = useRef(false);
  useEffect(() => {
    if (!visible) shown.current = false;
    if (shown.current) showToastLayer(layer);
    return (): void => {
      hideToastLayer(layer);
    };
  }, [layer, visible]);
  const onModalShow: NonNullable<ModalProps['onShow']> = (event) => {
    if (visible) {
      shown.current = true;
      showToastLayer(layer);
    }
    onShow?.(event);
  };
  return (
    <Modal {...props} visible={visible} onShow={onModalShow}>
      <GestureHandlerRootView className="flex-1" accessibilityViewIsModal>
        {children}
        <ToastLayer id={layer} />
      </GestureHandlerRootView>
    </Modal>
  );
}
