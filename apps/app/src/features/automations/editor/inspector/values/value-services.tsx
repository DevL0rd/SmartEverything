import { createContext, useContext } from 'react';
import type { InspectorEnv } from '../sections/section-types';

export interface ReferenceOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

export interface ReferenceCatalogue {
  readonly options: (of: string) => readonly ReferenceOption[];
}

export interface SecretAccess {
  readonly options: readonly ReferenceOption[];
  readonly owner: boolean;
  readonly onAdd: () => void;
}

export interface ValueServices {
  readonly env: InspectorEnv;
  readonly references: ReferenceCatalogue;
  readonly secrets: SecretAccess;
}

export const ValueServicesContext = createContext<ValueServices | null>(null);

export function useValueServices(): ValueServices {
  const services = useContext(ValueServicesContext);
  if (services === null) {
    throw new Error('A value editor was rendered outside ValueServicesContext');
  }
  return services;
}
