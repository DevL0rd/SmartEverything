import type { JsonValue } from '@smarteverything/domain';
import type { ShellyDevice } from '@smarteverything/shelly';
import type { z } from 'zod';
import type { ShellyHttpOptions } from './http';
import type { ShellyParams } from './wire';

export interface OperationPorts {
  readonly device: () => ShellyDevice;
  readonly http: () => ShellyHttpOptions;
  readonly call: <T>(method: string, params: JsonValue, schema: z.ZodType<T>) => Promise<T>;
  readonly refresh: () => Promise<void>;
  readonly reconnect: () => Promise<void>;
}

export type OperationHandler = (ports: OperationPorts, params: ShellyParams) => Promise<JsonValue>;
