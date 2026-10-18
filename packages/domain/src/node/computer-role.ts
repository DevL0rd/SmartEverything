import { z } from 'zod';
import type { PowerAction } from './node-requests';
import type { ServiceOperation } from './computer-system';
import type { ProcessSignal } from './computer-processes';

export const COMPUTER_ROLES = ['pc', 'hub'] as const;

export const COMPUTER_ROLE = z.enum(COMPUTER_ROLES);

export type ComputerRole = z.infer<typeof COMPUTER_ROLE>;

export const COMPUTER_ROLE_LABELS: Readonly<Record<ComputerRole, string>> = {
  pc: 'Computer',
  hub: 'Hub',
};

export const COMPUTER_ICON_KEYS = ['computer', 'hub'] as const;

export const COMPUTER_ICON_KEY = z.enum(COMPUTER_ICON_KEYS);

export type ComputerIconKey = z.infer<typeof COMPUTER_ICON_KEY>;

export const COMPUTER_ROLE_ICONS: Readonly<Record<ComputerRole, ComputerIconKey>> = {
  pc: 'computer',
  hub: 'hub',
};

export const COMPUTER_ROLE_MODELS: Readonly<Record<ComputerRole, string>> = {
  pc: 'smarteverything.computer',
  hub: 'smarteverything.computer.hub',
};

export function computerRoleOfModel(model: string): ComputerRole | null {
  return COMPUTER_ROLES.find((role) => COMPUTER_ROLE_MODELS[role] === model) ?? null;
}

export function computerIconKeyOfModel(model: string): ComputerIconKey {
  const role = computerRoleOfModel(model);
  return role === null ? COMPUTER_ROLE_ICONS.pc : COMPUTER_ROLE_ICONS[role];
}

export interface ComputerGuard {
  readonly blockedPowerActions: readonly PowerAction[];
  readonly blockedOwnServiceOperations: readonly ServiceOperation[];
  readonly blockedOwnProcessSignals: readonly ProcessSignal[];
}

export const COMPUTER_GUARDS: Readonly<Record<ComputerRole, ComputerGuard>> = {
  pc: { blockedPowerActions: [], blockedOwnServiceOperations: [], blockedOwnProcessSignals: [] },
  hub: {
    blockedPowerActions: ['shut_down', 'restart', 'sleep', 'hibernate'],
    blockedOwnServiceOperations: ['stop', 'restart', 'disable'],
    blockedOwnProcessSignals: ['end', 'force', 'stop'],
  },
};

export const HUB_GUARD_MESSAGE =
  'This machine runs the hub; stopping it also stops everything that depends on it. Repeat the request with explicit confirmation to proceed.';

export const HUB_AI_REFUSAL =
  'This machine runs the hub, and this would stop the hub itself in the middle of this request. The person has to do it from this hub\u2019s page in the app.';

const HUB_OWN_UNIT = /^smarteverything(?:[-_.@]|$)/i;

export function isHubOwnUnit(unit: string): boolean {
  return HUB_OWN_UNIT.test(unit.trim());
}

export type ComputerGuardRequest =
  | { readonly kind: 'power'; readonly action: PowerAction }
  | { readonly kind: 'own_service'; readonly operation: ServiceOperation }
  | { readonly kind: 'own_process'; readonly signal: ProcessSignal };

export function computerGuardBlocks(
  role: ComputerRole,
  request: ComputerGuardRequest,
  explicit: boolean,
): boolean {
  if (explicit) return false;
  const guard = COMPUTER_GUARDS[role];
  switch (request.kind) {
    case 'power':
      return guard.blockedPowerActions.includes(request.action);
    case 'own_service':
      return guard.blockedOwnServiceOperations.includes(request.operation);
    case 'own_process':
      return guard.blockedOwnProcessSignals.includes(request.signal);
  }
}
