import type { ReactNode } from 'react';
import { ComputerAudioScreen } from '../audio/audio-screen';
import { ComputerDisplaysScreen } from '../displays/displays-screen';
import { ComputerAppsScreen } from '../apps/apps-screen';
import { ComputerFilesScreen } from '../files/files-screen';
import { ComputerNetworkScreen } from '../network/network-screen';
import { ComputerPerformanceScreen } from '../performance/performance-screen';
import { ComputerProcessesScreen } from '../processes/processes-screen';
import { ComputerScopesScreen } from '../scopes/scopes-screen';
import { ComputerStorageScreen } from '../storage/storage-screen';
import { ComputerSystemScreen } from '../system/system-screen';
import { ComputerOverviewScreen } from './computer-overview';

export type ComputerScreen = (props: { readonly deviceId: string }) => ReactNode;

export const COMPUTER_SCREENS: Readonly<Record<string, ComputerScreen>> = {
  overview: ComputerOverviewScreen,
  performance: ComputerPerformanceScreen,
  processes: ComputerProcessesScreen,
  apps: ComputerAppsScreen,
  audio: ComputerAudioScreen,
  displays: ComputerDisplaysScreen,
  files: ComputerFilesScreen,
  network: ComputerNetworkScreen,
  storage: ComputerStorageScreen,
  system: ComputerSystemScreen,
  scopes: ComputerScopesScreen,
};
