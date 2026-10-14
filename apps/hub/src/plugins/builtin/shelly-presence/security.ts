import {
  ApiError,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
export function validateShellySecurity(
  snapshot: ShellyPresenceDevice,
  action: ShellyPresenceAction,
): void {
  const sys = snapshot.components.find((component) => component.component === 'sys');
  const enhanced = sys?.config.device?.enhanced_security === true;
  if (action.action === 'device_password' && action.password === null && enhanced)
    refuse('Enhanced security requires local authentication.');
  if (action.action !== 'set_component') return;
  const config = action.config;
  if (config.component === 'sys') validateDeviceSecurity(config.value.device, enhanced);
  validateTLS(config, enhanced);
}
function validateDeviceSecurity(
  device:
    | {
        readonly enhanced_security?: boolean | undefined;
        readonly tls_check_cert_validity_time?: boolean | undefined;
      }
    | undefined,
  enhanced: boolean,
): void {
  if (device?.enhanced_security === false)
    refuse('Enhanced security can only be disabled by a permitted factory reset.');
  if (device?.tls_check_cert_validity_time === false && enhanced)
    refuse('Enhanced security requires certificate time validation.');
}
function validateTLS(
  config: Extract<ShellyPresenceAction, { action: 'set_component' }>['config'],
  enhanced: boolean,
): void {
  if (!enhanced) return;
  if (config.component === 'mqtt' && config.value.ssl_ca === '*')
    refuse('Enhanced security requires MQTT certificate verification.');
  if (config.component === 'ws' && config.value.ssl_ca === '*')
    refuse('Enhanced security requires WebSocket certificate verification.');
}
function refuse(message: string): never {
  throw new ApiError('command_refused', message);
}
