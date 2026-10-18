import type { DevicePageContribution } from '../../../app-shell/device-pages';

export const NETWORK_PAGES: readonly DevicePageContribution[] = [
  {
    id: 'network',
    title: 'Network',
    subtitle: 'Adapters, Wi-Fi and Bluetooth',
    icon: 'wifi',
    keywords: [
      'network',
      'wifi',
      'wi-fi',
      'ethernet',
      'bluetooth',
      'ip address',
      'vpn',
      'adapter',
      'internet',
      'speed',
      'signal',
    ],
    settings: [
      'Adapters',
      'Download speed',
      'Upload speed',
      'IPv4 address',
      'IPv6 address',
      'Saved Wi-Fi networks',
      'Bluetooth devices',
    ],
  },
];
