export const INVENTORY_BIZ_CODES = ['bindUser', 'delete', 'nameUpdate'] as const;

export type CloudMessage =
  | {
      readonly kind: 'status';
      readonly deviceId: string;
      readonly items: readonly { readonly code: string; readonly value: unknown }[];
    }
  | {
      readonly kind: 'data_points';
      readonly deviceId: string;
      readonly dps: Readonly<Record<string, unknown>>;
    }
  | { readonly kind: 'online' | 'offline'; readonly deviceId: string }
  | { readonly kind: 'inventory_changed'; readonly deviceId: string; readonly bizCode: string }
  | { readonly kind: 'other'; readonly bizCode: string };

export function businessMessage(bizCode: string, deviceId: string | undefined): CloudMessage {
  if (deviceId === undefined) {
    return { kind: 'other', bizCode };
  }
  if (bizCode === 'online' || bizCode === 'offline') {
    return { kind: bizCode, deviceId };
  }
  return INVENTORY_BIZ_CODES.some((code) => code === bizCode)
    ? { kind: 'inventory_changed', deviceId, bizCode }
    : { kind: 'other', bizCode };
}

export class CloudMessageError extends Error {
  override readonly name = 'CloudMessageError';

  constructor(readonly reason: string) {
    super(`A Tuya cloud message could not be read: ${reason}.`);
  }
}
