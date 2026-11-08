import { createContext, useContext } from 'react';
import type { OptionSourceId } from '@smarteverything/domain';
import type { InspectorEnv } from '../sections/section-types';
import type { DeviceScope } from './literal-model';

export interface ReferenceOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

export interface ReferenceCatalogue {
  readonly options: (of: string, capabilities?: readonly string[]) => readonly ReferenceOption[];
}

export interface SecretAccess {
  readonly options: readonly ReferenceOption[];
  readonly owner: boolean;
  readonly onAdd: () => void;
}

export type DeviceChoices =
  | { readonly status: 'ready'; readonly options: readonly ReferenceOption[] }
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface ValueServices {
  readonly env: InspectorEnv | null;
  readonly references: ReferenceCatalogue;
  readonly secrets: SecretAccess;
  readonly deviceOptions: (source: OptionSourceId, scope: DeviceScope) => DeviceChoices;
}

export const ValueServicesContext = createContext<ValueServices | null>(null);

export function useValueServices(): ValueServices {
  const services = useContext(ValueServicesContext);
  if (services === null) {
    throw new Error('A value editor was rendered outside ValueServicesContext');
  }
  return services;
}
