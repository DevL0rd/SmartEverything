import type { ModelOverride } from '../types';
import { XIAOMI_DEVICE_INFORMATION, diagnostic, hidden, overrideOf } from './xiaomi-common';

const cameraSetting = overrideOf('setting', 'camera');

const alertSetting = overrideOf('setting', 'security');

const storage = overrideOf('maintenance', 'camera');

const SENSITIVITY = { Low: 'Low', Middle: 'Medium', High: 'High' };

const STREAM_DETAILS = {
  'raw:9.1': diagnostic('Talk mode'),
  'raw:9.2': diagnostic('Audio codec'),
  'raw:9.3': diagnostic('Audio bit depth'),
  'raw:9.4': diagnostic('Video codec'),
  'raw:9.5': diagnostic('Audio sample rate'),
  'raw:9.6': diagnostic('Audio channels'),
  'raw:9.7': diagnostic('Talk codec'),
  'raw:9.8': diagnostic('Lens correction X'),
  'raw:9.9': diagnostic('Lens correction Y'),
  'raw:9.10': diagnostic('Resolutions'),
  'raw:action.9.1': hidden('Start peer-to-peer stream'),
  'raw:action.9.2': hidden('Stop stream'),
};

const ASSISTANT_STREAMS = {
  'raw:action.27.5': hidden('Google Home stream'),
  'raw:action.28.4': hidden('Alexa snapshot'),
  'raw:action.28.5': hidden('Alexa stream'),
  'raw:action.28.6': hidden('Alexa stream connected'),
  'raw:action.28.7': hidden('Alexa stream ended'),
};

const SELF_CHECK = {
  'raw:26.2': diagnostic('Self-check results'),
  'raw:26.3': diagnostic('Manual check result'),
  'raw:action.26.1': hidden('Start self-check'),
  'raw:action.26.2': hidden('Stop self-check'),
  'raw:action.26.3': hidden('Sync manual check'),
  'raw:action.26.4': hidden('Stop self-check items'),
};

const DETECTION = {
  'raw:5.2': alertSetting('Alert interval'),
  'raw:5.4': alertSetting('Motion alerts from', { clock: 'seconds' }),
  'raw:5.5': alertSetting('Motion alerts until', { clock: 'seconds' }),
  'raw:8.5': alertSetting('Detect pets'),
  'raw:8.6': alertSetting('Detect hand gestures'),
  'raw:8.8': alertSetting('Detect people', { role: 'detect_people' }),
  'raw:8.9': alertSetting('Detect movement'),
  'raw:8.10': alertSetting('Detect a crying baby'),
  'raw:8.21': alertSetting('Follow pets', { role: 'follow_pets' }),
  'raw:8.23': alertSetting('Movement sensitivity', { options: SENSITIVITY }),
  'raw:8.28': alertSetting('Detect unusual sounds'),
  'raw:8.29': alertSetting('Sound sensitivity', { options: SENSITIVITY }),
  'raw:8.30': alertSetting('Auto zoom on people', { role: 'smart_zoom' }),
  'raw:8.31': diagnostic('Close-up active'),
};

const PATROL = {
  'raw:10.1': hidden('Favourite areas'),
  'raw:10.2': diagnostic('Active favourite area'),
  'raw:11.1': alertSetting('Patrol'),
  'raw:11.2': alertSetting('Patrol every'),
  'raw:11.3': alertSetting('Patrol from', { clock: 'minutes' }),
  'raw:11.4': alertSetting('Patrol until', { clock: 'minutes' }),
  'raw:11.5': diagnostic('Patrol days'),
  'raw:11.6': alertSetting('Patrol mode', {
    options: { 'Panoramic Cruise': 'Panorama', 'Fixed Point Cruise': 'Saved positions' },
  }),
  'raw:11.7': hidden('Patrol positions'),
};

const FENCE = {
  'raw:15.1': alertSetting('Virtual fence'),
  'raw:15.2': hidden('Virtual fence area'),
  'raw:15.3': alertSetting('Alert when someone enters'),
  'raw:15.4': alertSetting('Alert when someone leaves'),
  'raw:15.5': alertSetting('Show the fence area'),
  'raw:15.6': diagnostic('Fence area count'),
  'raw:15.7': diagnostic('Fence area shape'),
  'raw:15.8': diagnostic('Fence supports concave areas'),
  'raw:24.1': alertSetting('Privacy zones'),
  'raw:24.3': hidden('Privacy zone areas'),
};

const MEMORY_CARD = {
  'raw:4.1': storage('Memory card', {
    options: { 'Non Existent': 'No card', 'Card Is Full': 'Full', 'Card Damage': 'Damaged' },
  }),
  'raw:4.2': storage('Card size', { unit: 'MB' }),
  storage_free: storage('Card free', { unit: 'MB' }),
  'raw:4.4': storage('Card used', { unit: 'MB' }),
  'raw:4.5': hidden('Card ejected notice'),
  'raw:4.6': storage('Recording time left', { unit: 'min' }),
  'raw:action.4.1': storage('Format memory card', {
    role: 'format_storage',
    danger: { tier: 'typed', word: 'FORMAT' },
  }),
  'raw:action.4.2': storage('Eject memory card', { danger: { tier: 'confirm' } }),
};

export const CAMERA_083AE2: ModelOverride = {
  family: 'camera',
  capabilities: {
    ...XIAOMI_DEVICE_INFORMATION,
    ...STREAM_DETAILS,
    ...ASSISTANT_STREAMS,
    ...SELF_CHECK,
    ...DETECTION,
    ...PATROL,
    ...FENCE,
    ...MEMORY_CARD,
    power: { label: 'Camera on', tier: 'primary' },
    'raw:2.10': diagnostic('Pan and tilt supported'),
    night_vision: cameraSetting('Night vision'),
    watermark: cameraSetting('Timestamp'),
    'raw:2.6': cameraSetting('Full-colour night view'),
    'raw:2.11': alertSetting('Follow people', { role: 'follow_people' }),
    recording: cameraSetting('Record to memory card', {
      options: { 'No Record': 'Off', 'Motion Record': 'On motion', 'All Record': 'Always' },
    }),
    'raw:2.14': cameraSetting('Lens correction'),
    'raw:2.21': { label: 'Zoom', tier: 'control', role: 'zoom', group: 'camera' },
    'raw:2.22': cameraSetting('Anti-flicker', { options: { '50': '50 Hz', '60': '60 Hz' } }),
    'raw:2.23': cameraSetting('Rotate image', { role: 'image_flip', unit: '°' }),
    'raw:action.2.1': storage('Recalibrate pan and tilt', { danger: { tier: 'confirm' } }),
    'raw:action.2.2': storage('Restart camera', { role: 'restart', danger: { tier: 'confirm' } }),
    motion_detection: alertSetting('Motion alerts'),
    motion_sensitivity: alertSetting('Motion sensitivity'),
    status_light: cameraSetting('Status light'),
    volume: { label: 'Speaker volume', tier: 'control', group: 'media', unit: '%' },
    mute: { label: 'Mute speaker', tier: 'control', group: 'media' },
    'raw:14.1': diagnostic('Keyframe interval'),
    'raw:14.2': diagnostic('Cloud offset'),
    'raw:14.3': diagnostic('Cloud offset (basic)'),
    'raw:25.2': diagnostic('Pairing code link'),
    'raw:16.1': hidden('Family guard settings'),
    call_status: {
      label: 'Call',
      tier: 'reading',
      readOnly: true,
      options: { 'Idle Hang Up': 'Idle', Calling: 'Ringing', Busy: 'In a call' },
    },
    camera_stream: hidden('Live view'),
    ptz: { label: 'Pan and tilt', tier: 'control' },
  },
};
