import type { CapabilityOverride, CapabilityOverrides } from '../types';
function diagnostic(label: string): CapabilityOverride {
  return {
    label,
    tier: 'diagnostic',
    groupLabel: 'Details',
    readOnly: true,
    keywords: ['microwave', 'cooking', 'oven'],
  };
}
export const MICROWAVE_DETAILS: CapabilityOverrides = {
  'raw:oven_setpoint.oven_setpoint_range': diagnostic('Oven setpoint oven setpoint range'),
  'raw:oven_mode.supported_oven_modes': diagnostic('Oven mode supported oven modes'),
  'raw:oven_mode.oven_mode': diagnostic('Oven mode oven mode'),
  'raw:oven_operating_state.completion_time': diagnostic('Oven operating state completion time'),
  'raw:oven_operating_state.machine_state': diagnostic('Oven operating state machine state'),
  'raw:oven_operating_state.progress': diagnostic('Oven operating state progress'),
  'raw:oven_operating_state.supported_machine_states': diagnostic(
    'Oven operating state supported machine states',
  ),
  'raw:oven_operating_state.oven_job_state': diagnostic('Oven operating state oven job state'),
  'raw:oven_operating_state.operation_time': diagnostic('Oven operating state operation time'),
  'raw:oven_operating_state:stop': diagnostic('Oven operating state stop'),
  'raw:oven_operating_state:start': diagnostic('Oven operating state start'),
  'raw:temperature_measurement.temperature_range': diagnostic(
    'Temperature measurement temperature range',
  ),
  'raw:samsungce.device_identification.micom_assay_code': diagnostic(
    'device identification micom assay code',
  ),
  'raw:samsungce.device_identification.model_name': diagnostic('device identification model name'),
  'raw:samsungce.device_identification.serial_number': diagnostic(
    'device identification serial number',
  ),
  'raw:samsungce.device_identification.serial_number_extra': diagnostic(
    'device identification serial number extra',
  ),
  'raw:samsungce.device_identification.release_country': diagnostic(
    'device identification release country',
  ),
  'raw:samsungce.device_identification.model_classification_code': diagnostic(
    'device identification model classification code',
  ),
  'raw:samsungce.device_identification.description': diagnostic(
    'device identification description',
  ),
  'raw:samsungce.device_identification.release_year': diagnostic(
    'device identification release year',
  ),
  'raw:samsungce.device_identification.binary_id': diagnostic('device identification binary id'),
  'raw:samsungce.kitchen_device_identification.supported_service_list': diagnostic(
    'kitchen device identification supported service list',
  ),
  'raw:samsungce.kitchen_device_identification.region_code': diagnostic(
    'kitchen device identification region code',
  ),
  'raw:samsungce.kitchen_device_identification.model_code': diagnostic(
    'kitchen device identification model code',
  ),
  'raw:samsungce.kitchen_device_identification.fuel': diagnostic(
    'kitchen device identification fuel',
  ),
  'raw:samsungce.kitchen_device_identification.type': diagnostic(
    'kitchen device identification type',
  ),
  'raw:samsungce.kitchen_device_identification.representative_component': diagnostic(
    'kitchen device identification representative component',
  ),
  'raw:samsungce.driver_version.version_number': diagnostic('driver version version number'),
  'raw:samsungce.oven_mode.supported_oven_modes': diagnostic('oven mode supported oven modes'),
  'raw:samsungce.oven_operating_state.completion_time': diagnostic('Reported completion time'),
  'raw:samsungce.microwave_power.supported_power_levels': diagnostic(
    'microwave power supported power levels',
  ),
  'raw:samsungce.lamp.supported_brightness_level': diagnostic('lamp supported brightness level'),
  'raw:samsungce.kitchen_mode_specification.specification': diagnostic(
    'kitchen mode specification specification',
  ),
  'raw:samsungce.software_update.target_module': diagnostic('software update target module'),
  'raw:samsungce.software_update.otn_duid': diagnostic('software update otn duid'),
  'raw:samsungce.software_update.available_module_details': diagnostic(
    'software update available module details',
  ),
  'raw:samsungce.software_update.available_modules': diagnostic(
    'software update available modules',
  ),
  'raw:samsungce.software_update.protocol_version': diagnostic('software update protocol version'),
  'raw:samsungce.software_update.module_update_counts': diagnostic(
    'software update module update counts',
  ),
  'raw:sec.diagnostics_information.log_type': diagnostic('diagnostics information log type'),
  'raw:sec.diagnostics_information.endpoint': diagnostic('diagnostics information endpoint'),
  'raw:sec.diagnostics_information.min_version': diagnostic('diagnostics information min version'),
  'raw:sec.diagnostics_information.signin_permission': diagnostic(
    'diagnostics information signin permission',
  ),
  'raw:sec.diagnostics_information.setup_id': diagnostic('diagnostics information setup id'),
  'raw:sec.diagnostics_information.protocol_type': diagnostic(
    'diagnostics information protocol type',
  ),
  'raw:sec.diagnostics_information.ts_id': diagnostic('diagnostics information ts id'),
  'raw:sec.diagnostics_information.mn_id': diagnostic('diagnostics information mn id'),
  'raw:sec.diagnostics_information.dump_type': diagnostic('diagnostics information dump type'),
  'raw:sec.wifi_configuration.auto_reconnection': diagnostic(
    'wifi configuration auto reconnection',
  ),
  'raw:sec.wifi_configuration.min_version': diagnostic('wifi configuration min version'),
  'raw:sec.wifi_configuration.supported_wi_fi_freq': diagnostic(
    'wifi configuration supported wi fi freq',
  ),
  'raw:sec.wifi_configuration.supported_auth_type': diagnostic(
    'wifi configuration supported auth type',
  ),
  'raw:sec.wifi_configuration.protocol_type': diagnostic('wifi configuration protocol type'),
  'raw:sec.calm_connection_care.role': diagnostic('calm connection care role'),
  'raw:sec.calm_connection_care.protocols': diagnostic('calm connection care protocols'),
  'raw:sec.calm_connection_care.version': diagnostic('calm connection care version'),
  'raw:samsungce.quick_control.version': diagnostic('quick control version'),
  'raw:samsungce.software_version.versions': diagnostic('software version versions'),
  'raw:samsungce.software_version.platform_version': diagnostic(
    'software version platform version',
  ),
};
