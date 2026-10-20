import { createContext, useContext } from 'react';

export interface InstanceHost {
  readonly detach: (instanceKey: string) => Promise<void>;
  readonly openSameSteps: (functionId: string) => void;
}

const InstanceHostContext = createContext<InstanceHost | null>(null);

export const InstanceHostProvider = InstanceHostContext.Provider;

export function useInstanceHost(): InstanceHost | null {
  return useContext(InstanceHostContext);
}
