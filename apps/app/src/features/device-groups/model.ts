import { presentDevice, type PresentedCapability } from '@smarteverything/domain';
import type { Device } from '../../store/state';

export interface GroupControlChoice {
  readonly reference: string;
  readonly presented: PresentedCapability;
  readonly device: Device;
  readonly supported: number;
}

function referenceOf(presented: PresentedCapability): string {
  return presented.role ?? presented.key;
}

function safeControl(presented: PresentedCapability): boolean {
  return (
    presented.writable &&
    presented.danger.tier === 'none' &&
    (presented.tier === 'primary' || presented.tier === 'control') &&
    presented.capability.value.kind !== 'action' &&
    presented.capability.value.kind !== 'text'
  );
}

function unified(
  presented: PresentedCapability,
  peers: readonly PresentedCapability[],
): PresentedCapability {
  const descriptor = presented.capability.value;
  if (descriptor.kind === 'enum') {
    const options = [
      ...new Map(
        peers.flatMap((peer) => peer.options).map((option) => [option.value, option]),
      ).values(),
    ];
    return {
      ...presented,
      options,
      capability: {
        ...presented.capability,
        value: { ...descriptor, options: options.map((option) => option.value) },
      },
    };
  }
  if (descriptor.kind !== 'number') return presented;
  const ranges = peers
    .map((peer) => peer.capability.value)
    .filter((value) => value.kind === 'number');
  const value =
    presented.role === 'brightness'
      ? {
          ...descriptor,
          min: Math.max(...ranges.map((range) => Math.ceil((range.min / range.max) * 100))),
          max: 100,
          step: 1,
        }
      : {
          ...descriptor,
          min: Math.max(...ranges.map((range) => range.min)),
          max: Math.min(...ranges.map((range) => range.max)),
          step: Math.max(...ranges.map((range) => range.step)),
        };
  return { ...presented, capability: { ...presented.capability, value } };
}

export function groupControlChoices(devices: readonly Device[]): readonly GroupControlChoice[] {
  const all = devices.flatMap((device) =>
    presentDevice(device)
      .capabilities.filter(safeControl)
      .map((presented) => ({ device, presented, reference: referenceOf(presented) })),
  );
  const references = [...new Set(all.map((entry) => entry.reference))];
  return references.flatMap((reference) => {
    const peers = all.filter((entry) => entry.reference === reference);
    const first = peers[0];
    if (first === undefined) return [];
    const presented = unified(
      first.presented,
      peers.map((entry) => entry.presented),
    );
    const descriptor = presented.capability.value;
    if (descriptor.kind === 'number' && descriptor.min > descriptor.max) return [];
    return [{ ...first, presented, supported: peers.length }];
  });
}
