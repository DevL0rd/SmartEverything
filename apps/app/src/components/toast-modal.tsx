import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Modal, View, type ModalProps } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { isNative } from '../design/platform';
import { ThemeScope, useScopedTheme } from '../design/theme-scope';
import { focusView } from './focus-request';
import { hideToastLayer, showToastLayer } from './toast-layers';
import { ToastLayer } from './toasts';

export interface ToastModalProps extends ModalProps {
  readonly focusRoot?: boolean;
}

function FocusRoot({
  active,
  children,
}: {
  readonly active: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const root = useRef<View>(null);
  useEffect(() => {
    if (active && !isNative()) focusView(root.current, true);
  }, [active]);
  return (
    <View ref={root} tabIndex={-1} className="flex-1 web:outline-none">
      {children}
    </View>
  );
}

function Scoped({ children }: { readonly children: ReactNode }): ReactNode {
  const theme = useScopedTheme();
  return theme === null ? children : <ThemeScope theme={theme}>{children}</ThemeScope>;
}

export function ToastModal({
  visible = true,
  onShow,
  onDismiss,
  focusRoot = false,
  children,
  ...props
}: ToastModalProps): ReactNode {
  const layer = useId();
  const shown = useRef(false);
  const [presented, setPresented] = useState(visible);
  if (visible && !presented) setPresented(true);
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
  const onModalDismiss = (): void => {
    setPresented(false);
    onDismiss?.();
  };
  if (!visible && !presented) return null;
  const content = focusRoot ? <FocusRoot active={visible}>{children}</FocusRoot> : children;
  return (
    <Modal {...props} visible={visible} onShow={onModalShow} onDismiss={onModalDismiss}>
      <GestureHandlerRootView className="flex-1" accessibilityViewIsModal>
        <Scoped>{content}</Scoped>
        <ToastLayer id={layer} />
      </GestureHandlerRootView>
    </Modal>
  );
}
