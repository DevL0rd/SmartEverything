import type { ReactNode } from 'react';
import Constants from 'expo-constants';
import { ValueRow } from '../../../components/rows';
import { useHubStatus } from '../../../store/selectors';

export function AppVersionRow(): ReactNode {
  return (
    <ValueRow title="App" icon="smartphone" value={Constants.expoConfig?.version ?? 'Unknown'} />
  );
}

export function ServerVersionRow(): ReactNode {
  const hub = useHubStatus();
  return <ValueRow title="Server" icon="server" value={hub?.version ?? 'Not connected'} />;
}
