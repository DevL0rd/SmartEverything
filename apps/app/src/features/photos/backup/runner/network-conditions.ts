import NetInfo, { NetInfoStateType, type NetInfoState } from '@react-native-community/netinfo';
import type { Conditions } from '../model/types';
import type { ConditionsPort } from './ports';

export interface ChargingSource {
  read(): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}

function meteredOf(state: NetInfoState): boolean {
  return state.details === null ? true : state.details.isConnectionExpensive;
}

export function conditionsPort(charging: ChargingSource): ConditionsPort {
  return {
    async read(): Promise<Conditions> {
      const [network, plugged] = await Promise.all([NetInfo.fetch(), charging.read()]);
      return {
        connected: network.isConnected === true,
        metered: meteredOf(network),
        wifi: network.type === NetInfoStateType.wifi,
        charging: plugged,
      };
    },
    subscribe(listener): () => void {
      const offNetwork = NetInfo.addEventListener(listener);
      const offCharging = charging.subscribe(listener);
      return (): void => {
        offNetwork();
        offCharging();
      };
    },
  };
}
