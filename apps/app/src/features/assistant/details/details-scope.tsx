import { createContext, use, type ReactNode } from 'react';
import { router, type Href } from 'expo-router';

export type PanelOperation = 'model' | 'device' | 'access';

interface DetailsScope {
  readonly close: () => void;
  readonly onDeleted: () => void;
}

const Scope = createContext<DetailsScope | null>(null);

export function DetailsScopeProvider({
  value,
  children,
}: {
  readonly value: DetailsScope;
  readonly children: ReactNode;
}): ReactNode {
  return <Scope value={value}>{children}</Scope>;
}

function useScope(): DetailsScope {
  const scope = use(Scope);
  if (scope === null) {
    throw new Error('Chat details components must render inside DetailsScopeProvider.');
  }
  return scope;
}

export function useDetailsClose(): () => void {
  return useScope().close;
}

export function useDetailsDeleted(): () => void {
  return useScope().onDeleted;
}

export function useGo(): (target: Href) => void {
  const { close } = useScope();
  return (target) => {
    close();
    router.push(target);
  };
}

export function useOpenPanel(): (operation: PanelOperation) => void {
  const { close } = useScope();
  return (operation) => {
    close();
    router.setParams({ operation });
  };
}
