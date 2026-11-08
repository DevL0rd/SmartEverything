export type HomeMapSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'room'; readonly roomId: string }
  | { readonly kind: 'device'; readonly deviceId: string };

export interface SelectionParams {
  readonly room?: string | undefined;
  readonly device?: string | undefined;
}

export const NO_SELECTION: HomeMapSelection = { kind: 'none' };

function present(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

export function selectionOf(params: SelectionParams): HomeMapSelection {
  const deviceId = present(params.device);
  if (deviceId !== null) return { kind: 'device', deviceId };
  const roomId = present(params.room);
  return roomId === null ? NO_SELECTION : { kind: 'room', roomId };
}

export function selectionParams(selection: HomeMapSelection): Readonly<Record<string, string>> {
  switch (selection.kind) {
    case 'none':
      return {};
    case 'room':
      return { room: selection.roomId };
    case 'device':
      return { device: selection.deviceId };
  }
}

export function sameSelection(left: HomeMapSelection, right: HomeMapSelection): boolean {
  if (left.kind === 'room') return right.kind === 'room' && left.roomId === right.roomId;
  if (left.kind === 'device') return right.kind === 'device' && left.deviceId === right.deviceId;
  return right.kind === 'none';
}
