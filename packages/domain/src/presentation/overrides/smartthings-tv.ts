import { currentApp } from '../../television-apps';
import { INPUT_LABELS } from '../../television-inputs';
import { TV_KEY_LABELS } from '../../television-keys';
import type { CapabilityOverrides } from '../types';
import { diagnostic, hidden, overrideOf } from './xiaomi-common';

const media = overrideOf('control', 'media');

const mediaExtra = overrideOf('extra', 'media');

const FEATURE_FLAGS = [
  'media_output_supported',
  'ime_adv_supported',
  'wifi_update_support',
  'executable_service_list',
  'remoteless_supported',
  'art_supported',
  'mobile_cam_supported',
] as const;

const SUPPORTED_FEATURES: CapabilityOverrides = Object.fromEntries(
  FEATURE_FLAGS.map((flag) => [
    `raw:samsungvd.supports_features.${flag}`,
    diagnostic(`Supports ${flag.replaceAll('_', ' ')}`),
  ]),
);

const LIGHT_CONTROL: CapabilityOverrides = Object.fromEntries(
  [
    'supported_mode_map',
    'request_id',
    'stream_control',
    'selected_app_id',
    'error_code',
    'supported_modes',
  ].map((attribute) => [
    `raw:samsungvd.light_control.${attribute}`,
    diagnostic(`Light sync ${attribute.replaceAll('_', ' ')}`),
  ]),
);

export const SMARTTHINGS_TV: CapabilityOverrides = {
  ...SUPPORTED_FEATURES,
  ...LIGHT_CONTROL,
  input_source: { label: 'Input', tier: 'primary', options: INPUT_LABELS },
  remote_key: { label: 'Remote button', tier: 'hidden', group: 'media', options: TV_KEY_LABELS },
  'raw:media_input_source.input_source': hidden('Input (all sources)'),
  'raw:audio_volume:volume_up': media('Volume up'),
  'raw:audio_volume:volume_down': media('Volume down'),
  'raw:tv_channel:channel_up': media('Channel up'),
  'raw:tv_channel:channel_down': media('Channel down'),
  'raw:tv_channel.tv_channel_name': media('Now watching', {
    tier: 'reading',
    role: 'current_app',
    readOnly: true,
    format: (value) => currentApp(typeof value === 'string' ? value : null)?.name ?? '',
  }),
  'raw:media_track_control:previous_track': media('Previous'),
  'raw:media_track_control:next_track': media('Next'),
  'raw:media_track_control.supported_track_control_commands': diagnostic('Track commands'),
  'raw:custom.error.error': diagnostic('Last error'),
  'raw:custom.error:set_error': hidden('Set error'),
  'raw:custom.picturemode.picture_mode': media('Picture mode', { role: 'picture_mode' }),
  'raw:custom.picturemode.supported_picture_modes': diagnostic('Picture modes'),
  'raw:custom.picturemode.supported_picture_modes_map': diagnostic('Picture mode ids'),
  'raw:custom.picturemode:set_picture_mode': hidden('Change picture mode'),
  'raw:custom.soundmode.sound_mode': media('Sound mode', { role: 'sound_mode' }),
  'raw:custom.soundmode.supported_sound_modes': diagnostic('Sound modes'),
  'raw:custom.soundmode.supported_sound_modes_map': diagnostic('Sound mode ids'),
  'raw:custom.soundmode:set_sound_mode': hidden('Change sound mode'),
  'raw:custom.accessibility:set_accessibility': hidden('Accessibility menu'),
  'raw:custom.recording:record_start': mediaExtra('Start recording'),
  'raw:custom.recording:record_stop': mediaExtra('Stop recording'),
  'raw:custom.tvsearch:search': hidden('Search on the TV'),
  'raw:samsungvd.remote_control:send': hidden('Remote button'),
  'raw:samsungvd.ambient.info': diagnostic('Ambient mode details'),
  'raw:samsungvd.ambient:send_data': hidden('Ambient mode data'),
  'raw:samsungvd.ambient:set_ambient_on': media('Ambient mode', { role: 'ambient_mode' }),
  'raw:samsungim.fixed_find_node:refresh': hidden('Refresh find node'),
  'raw:samsungvd.thing_status.updated_time': diagnostic('Status updated'),
  'raw:samsungvd.thing_status.status': diagnostic('Update status', { role: 'tv_updating' }),
  'raw:sec.device_connection_state.device_connection_state': diagnostic('Connection state'),
  'raw:sec.device_connection_state:refresh_connection': hidden('Refresh connection'),
  'raw:refresh:refresh': hidden('Refresh'),
  'raw:samsungvd.firmware_version.firmware_version': diagnostic('Firmware'),
  'raw:samsungvd.firmware_version:set_firmware_version': hidden('Set firmware version'),
  'raw:samsungvd.supports_power_on_by_ocf.supports_power_on_by_ocf': diagnostic(
    'Can be turned on remotely',
    { role: 'power_on_remote' },
  ),
  'raw:samsungvd.device_category.category': diagnostic('Category', { role: 'tv_category' }),
  'raw:samsungvd.light_control.selected_mode': media('Light sync', { role: 'light_sync_mode' }),
  'raw:samsungvd.light_control:set_light_control_mode': hidden('Change light sync mode'),
  'raw:samsungvd.launch_service:launch_tvplus': hidden('Open Samsung TV Plus'),
};
