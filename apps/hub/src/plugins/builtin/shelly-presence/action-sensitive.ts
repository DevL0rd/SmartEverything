import { shellyScheduledActions, type ShellyPresenceAction } from '@smarteverything/domain';
export function shellySensitiveAction(action: ShellyPresenceAction): boolean {
  if (shellyScheduledActions(action).some(shellySensitiveAction)) return true;
  if (action.action === 'webhook_create' || action.action === 'webhook_update')
    return action.webhook.urls?.some(privateDestination) ?? false;
  if (
    [
      'device_password',
      'certificate_put',
      'script_put_code',
      'script_eval',
      'http_request',
      'firmware_upload_write',
      'kvs_set',
    ].includes(action.action)
  )
    return true;
  if (action.action === 'set_component') return sensitiveComponent(action.config);
  return (
    (action.action === 'bthome_device_config' || action.action === 'bthome_add_device') &&
    action.config.key !== undefined
  );
}

function privateDestination(value: string): boolean {
  const url = new URL(value);
  return (
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  );
}

function sensitiveComponent(
  config: Extract<ShellyPresenceAction, { action: 'set_component' }>['config'],
): boolean {
  if (config.component === 'wifi')
    return [config.value.sta, config.value.sta1, config.value.ap].some(
      (network) => network?.pass !== undefined,
    );
  if (config.component === 'mqtt') return config.value.pass !== undefined;
  return config.component === 'sys' && config.value.ui_data !== undefined;
}
