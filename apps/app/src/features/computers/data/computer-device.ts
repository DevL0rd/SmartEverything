import { z } from 'zod';
import { computerRoleOfModel, type JsonValue } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { IconName } from '../../../components/icon';
import type { Device } from '../../../store/state';
import { useLedger } from '../../../store/store-context';

const DETAILS = z.looseObject({
  os: z.string().min(1).optional(),
  portable: z.boolean().optional(),
  processor: z.string().min(1).optional(),
  threads: z.int().positive().optional(),
});

export interface ComputerFacts {
  readonly os: string | null;
  readonly portable: boolean;
  readonly processor: string | null;
  readonly threads: number | null;
}

export function factsOf(device: Device): ComputerFacts {
  const parsed = DETAILS.safeParse(device.details);
  const details = parsed.success ? parsed.data : {};
  return {
    os: details.os ?? null,
    portable: details.portable ?? false,
    processor: details.processor ?? null,
    threads: details.threads ?? null,
  };
}

export function osOf(device: Device): string | null {
  return factsOf(device).os;
}

export function isHub(device: Device): boolean {
  return computerRoleOfModel(device.model) === 'hub';
}

export function computerGlyph(device: Device): IconName {
  if (isHub(device)) return 'server';
  return factsOf(device).portable ? 'laptop' : 'monitor';
}

export function offersAction(device: Device, capability: string): boolean {
  return device.capabilities.some((entry) => entry.key === capability);
}

export function useComputerCommand(device: Device): (capability: string, value: JsonValue) => void {
  const ledger = useLedger();
  return (capability, value) => {
    background(ledger.send(device, capability, value), 'computer.command_failed');
  };
}
