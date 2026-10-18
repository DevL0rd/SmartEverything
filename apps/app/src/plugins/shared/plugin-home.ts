export function homeWhenDeviceOf(
  kind: string,
  widgets: readonly { readonly type: string }[],
): (devices: readonly { readonly kind: string }[]) => readonly string[] {
  const types = widgets.map((widget) => widget.type);
  return (devices) => (devices.some((device) => device.kind === kind) ? types : []);
}
