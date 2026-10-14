import type { RefObject } from 'react';
import type { View } from 'react-native';
import { measureAnchor, type Rect } from '../../../components/anchor';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
const TransientContext = createContext({
  commandsOpened: false,
  dismissCommands: (): void => undefined,
});
export function CommandTransientProvider({
  opened,
  dismiss,
  children,
}: {
  readonly opened: boolean;
  readonly dismiss: () => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <TransientContext.Provider value={{ commandsOpened: opened, dismissCommands: dismiss }}>
      {children}
    </TransientContext.Provider>
  );
}
export function useCommandTransient(close: () => void): () => void {
  const context = useContext(TransientContext);
  useEffect(() => {
    if (context.commandsOpened) close();
  }, [context.commandsOpened, close]);
  return context.dismissCommands;
}

export function openCommandPicker(
  dismiss: () => void,
  ref: RefObject<View | null>,
  show: (anchor: Rect) => void,
): void {
  dismiss();
  measureAnchor(ref, show);
}
