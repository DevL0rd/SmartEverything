import type { FlowType } from '../automation-v3/types';
import type { InputPortDecl, OutputPortDecl } from './define';
import { ERROR_OUT } from './error-port';
import type { OptionSourceId } from './option-sources';

export const TEXT: FlowType = { t: 'text' };
export const BOOLEAN: FlowType = { t: 'boolean' };

export interface Option {
  readonly id: string;
  readonly label: string;
}

export const SENT: readonly OutputPortDecl[] = [
  { name: 'ok', type: BOOLEAN, description: 'Whether the computer did it.' },
  ERROR_OUT,
];

export const SEND_EFFECT = {
  retry: 'external',
  budget: 'effects',
  mode: 'fire_and_forget',
} as const;

export const WAIT_EFFECT = { retry: 'external', budget: 'effects' } as const;

export const COMPUTER: InputPortDecl = {
  name: 'computer',
  type: { t: 'ref', of: 'computer' },
  required: true,
  description: 'Which computer.',
  summary: true,
};

export function choice(
  name: string,
  options: readonly Option[],
  label: string,
  description: string,
): InputPortDecl {
  return {
    name,
    type: { t: 'choice', options: [...options] },
    required: false,
    static: true,
    description,
    ui: { label },
  };
}

export function picker(
  name: string,
  source: OptionSourceId,
  label: string,
  description: string,
): InputPortDecl {
  return {
    name,
    type: TEXT,
    required: false,
    static: true,
    description,
    ui: { label, optionsFrom: source },
  };
}

export function text(name: string, label: string, description: string): InputPortDecl {
  return { name, type: TEXT, required: false, live: true, description, ui: { label } };
}

export function toggle(name: string, label: string, description: string): InputPortDecl {
  return { name, type: BOOLEAN, required: false, live: true, description, ui: { label } };
}
