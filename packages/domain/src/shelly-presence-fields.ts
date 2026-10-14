import type { ShellyPresencePage } from './shelly-presence-pages';

export type ShellyFieldValue =
  | { readonly kind: 'boolean' }
  | {
      readonly kind: 'number';
      readonly min?: number;
      readonly max?: number;
      readonly step?: number;
      readonly unit?: string;
      readonly nullable?: boolean;
    }
  | {
      readonly kind: 'text';
      readonly maxLength: number;
      readonly secret?: boolean;
      readonly nullable?: boolean;
    }
  | {
      readonly kind: 'enum';
      readonly options: readonly string[];
      readonly nullable?: boolean;
      readonly optionLabels?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'strings';
      readonly maxItems: number;
      readonly maxLength: number;
      readonly nullable?: boolean;
    }
  | {
      readonly kind: 'string_map';
      readonly maxItems: number;
      readonly maxLength: number;
      readonly nullable?: boolean;
    }
  | { readonly kind: 'stored_values' }
  | { readonly kind: 'area' }
  | { readonly kind: 'rgb' }
  | { readonly kind: 'time_window' };
export interface ShellyPresenceField {
  readonly id: string;
  readonly component: string;
  readonly path: readonly string[];
  readonly title: string;
  readonly page: ShellyPresencePage;
  readonly focus: string;
  readonly keywords: readonly string[];
  readonly value: ShellyFieldValue;
  readonly action: string;
  readonly permission: 'read' | 'write' | 'privileged' | 'destructive' | 'access';
}
export interface ShellyPresenceOperationDescriptor {
  readonly action: string;
  readonly title: string;
  readonly page: ShellyPresencePage;
  readonly focus: string;
  readonly keywords: readonly string[];
  readonly method: string;
  readonly permission: ShellyPresenceField['permission'];
}
