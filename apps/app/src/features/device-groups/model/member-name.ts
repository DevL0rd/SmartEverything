const REMOVED_DEVICE = 'A removed device';

export function memberNameOf(
  members: readonly { readonly id: string; readonly label: string }[],
  deviceId: string,
): string {
  return members.find((member) => member.id === deviceId)?.label ?? REMOVED_DEVICE;
}
