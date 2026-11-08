import type { JsonValue, PresentedCapability } from '@smarteverything/domain';
import { confirm } from '../../../components/confirm-store';
import type { IconName } from '../../../components/icon';

export function argumentsOf(presented: PresentedCapability): readonly string[] {
  const descriptor = presented.capability.value;
  return descriptor.kind === 'action' ? (descriptor.arguments ?? []) : [];
}

export function presetArguments(presented: PresentedCapability): JsonValue | undefined {
  const names = argumentsOf(presented);
  if (names.length === 0) {
    return null;
  }
  return presented.role === 'filter_reset'
    ? Object.fromEntries(names.map((name) => [name, 0]))
    : undefined;
}

const NUMBER = /^-?\d+(\.\d+)?$/;

export function argumentValue(text: string): JsonValue {
  const trimmed = text.trim();
  if (NUMBER.test(trimmed)) {
    return Number(trimmed);
  }
  if (trimmed === 'true' || trimmed === 'false') {
    return trimmed === 'true';
  }
  return trimmed;
}

export async function approved(
  presented: PresentedCapability,
  deviceName: string,
): Promise<boolean> {
  const danger = presented.danger;
  if (danger.tier === 'none') {
    return true;
  }
  return confirm({
    title: `${presented.label}?`,
    body:
      danger.tier === 'typed'
        ? `This can't be undone on ${deviceName}.`
        : `${deviceName} will do this right away.`,
    confirmLabel: presented.label,
    tone: 'destructive',
    ...(danger.tier === 'typed' ? { typed: danger.word } : {}),
  });
}

export interface ActionLook {
  readonly icon: IconName;
  readonly destructive: boolean;
}

const ACTION_LOOKS: Readonly<Record<PresentedCapability['danger']['tier'], ActionLook>> = {
  none: { icon: 'play', destructive: false },
  confirm: { icon: 'shield', destructive: false },
  typed: { icon: 'warning', destructive: true },
};

export function actionLookOf(presented: PresentedCapability): ActionLook {
  return ACTION_LOOKS[presented.danger.tier];
}
