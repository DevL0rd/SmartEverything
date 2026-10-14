import {
  ApiError,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
const VIRTUAL: ReadonlySet<string> = new Set([
  'boolean',
  'number',
  'enum',
  'text',
  'button',
  'group',
]);
export function validateShellyValues(
  snapshot: ShellyPresenceDevice,
  action: ShellyPresenceAction,
): void {
  if (action.action === 'set_presence') {
    const current = { ...snapshot.config, ...action.config };
    if (
      typeof current.zmin === 'number' &&
      typeof current.zmax === 'number' &&
      current.zmin >= current.zmax
    )
      refuse('Minimum detection height must be below the accepted maximum.');
  }
  if (action.action === 'set_light') {
    const previous = snapshot.light.find((sensor) => sensor.config.id === action.id);
    if (previous === undefined) refuse('That light sensor no longer exists.');
    const current = { ...previous.config, ...action.config };
    if ((current.dark_thr ?? 0) >= (current.bright_thr ?? Infinity))
      refuse('Dark threshold must be below the accepted bright threshold.');
  }
  validateVirtual(snapshot, action);
  validateBthome(snapshot, action);
}
function validateVirtual(snapshot: ShellyPresenceDevice, action: ShellyPresenceAction): void {
  if (action.action === 'virtual_delete') {
    if (
      !snapshot.components.some(
        (component) => component.key === action.key && VIRTUAL.has(component.component),
      )
    )
      refuse('Select an existing virtual component to delete.');
    return;
  }
  if (
    action.action !== 'virtual_set' &&
    action.action !== 'virtual_config' &&
    action.action !== 'virtual_button' &&
    action.action !== 'virtual_toggle'
  )
    return;
  const type = virtualType(action);
  const component = snapshot.components.find(
    (candidate) =>
      candidate.component === type && 'id' in candidate.config && candidate.config.id === action.id,
  );
  if (component === undefined)
    refuse('That virtual component does not match the requested type and ID.');
  validateVirtualValue(component, action);
}
function virtualType(action: ShellyPresenceAction): string {
  if (action.action === 'virtual_set') return action.setting.component;
  if (action.action === 'virtual_config') return action.config.component;
  return action.action === 'virtual_toggle' ? 'boolean' : 'button';
}
function validateVirtualValue(
  component: ShellyPresenceDevice['components'][number],
  action: ShellyPresenceAction,
): void {
  if (action.action !== 'virtual_set') return;
  const setting = action.setting;
  if (component.component === 'number' && setting.component === 'number')
    validateNumber(component.config, setting.value);
  if (component.component === 'enum' && setting.component === 'enum')
    validateEnum(component.config.options, setting.value);
}
function validateNumber(
  config: { readonly min?: number | null | undefined; readonly max?: number | null | undefined },
  value: number,
): void {
  if (value < (config.min ?? -Infinity) || value > (config.max ?? Infinity))
    refuse('The value falls outside this virtual component’s accepted limits.');
}
function validateEnum(options: readonly string[], value: string | null): void {
  if (value !== null && !options.includes(value))
    refuse('Choose one of this virtual component’s accepted options.');
}
function validateBthome(snapshot: ShellyPresenceDevice, action: ShellyPresenceAction): void {
  if (action.action !== 'bthome_add_sensor') return;
  if (
    !snapshot.components.some(
      (component) =>
        component.component === 'bthomedevice' &&
        component.config.addr.toLowerCase() === action.config.addr.toLowerCase(),
    )
  )
    refuse('Add the parent BTHome device before adding one of its sensors.');
}
function refuse(message: string): never {
  throw new ApiError('command_refused', message);
}
