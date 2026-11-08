import { z } from 'zod';
import { ERROR_CLASS, ERROR_CLASSES, type ErrorClass } from '../automation-v3/policy';
import type { FlowType } from '../automation-v3/types';
import type { OutputPortDecl } from './define';

export const ERROR_EXIT_PORT = 'onError';

export const ERROR_VALUE = z.object({
  reason: ERROR_CLASS,
  message: z.string(),
  code: z.string().optional(),
});

export interface ErrorValue {
  readonly reason: ErrorClass;
  readonly message: string;
  readonly code?: string;
}

const TEXT: FlowType = { t: 'text' };

export const ERROR_REASON_TYPE: FlowType = {
  t: 'choice',
  options: ERROR_CLASSES.map((id) => ({ id, label: id })),
};

export const ERROR_OUT: OutputPortDecl = {
  name: 'error',
  type: { t: 'error' },
  optional: true,
  description: 'Why it failed.',
};

export const ERROR_EXIT_OUTPUTS: readonly OutputPortDecl[] = [
  { name: 'reason', type: ERROR_REASON_TYPE, description: 'What kind of failure it was.' },
  { name: 'message', type: TEXT, description: 'What went wrong, in words.' },
  {
    name: 'code',
    type: TEXT,
    optional: true,
    description: 'The code the device or service gave, when it gave one.',
  },
];

export function errorValueOf(reason: ErrorClass, message: string, code?: string): ErrorValue {
  return code === undefined ? { reason, message } : { reason, message, code };
}
