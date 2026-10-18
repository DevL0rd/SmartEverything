import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  API_ENDPOINTS as E,
  type ComputerScope,
  type ComputerScopes,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { useDevice, useIsOwner } from '../../../store/selectors';

export interface ComputerReach {
  readonly name: string;
  readonly owner: boolean;
  readonly online: boolean;
}

export function useComputerReach(deviceId: string): ComputerReach {
  const device = useDevice(deviceId);
  const owner = useIsOwner();
  return {
    name: device?.label ?? 'This computer',
    owner,
    online: device?.online === true,
  };
}

function scopesKey(deviceId: string): readonly string[] {
  return ['window', 'computer-scopes', deviceId];
}

export function useComputerScopes(
  deviceId: string,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<ComputerScopes>> {
  return useScreenQuery({
    queryKey: scopesKey(deviceId),
    queryFn: () => api().call(E.readComputerScopes, { params: { deviceId } }),
    enabled,
  });
}

interface ScopeChange {
  readonly scope: ComputerScope;
  readonly value: boolean;
}

export function useComputerScopeChange(
  deviceId: string,
  scopeLabel: (scope: ComputerScope) => string,
): ReturnType<typeof useMutation<ComputerScopes, Error, ScopeChange>> {
  const client = useQueryClient();
  const mutation: ReturnType<typeof useMutation<ComputerScopes, Error, ScopeChange>> = useMutation({
    mutationFn: ({ scope, value }: ScopeChange) =>
      api().call(E.updateComputerScopes, { params: { deviceId }, body: { [scope]: value } }),
    onSuccess: (scopes) => {
      client.setQueryData(scopesKey(deviceId), scopes);
    },
    onError: (error, change) => {
      notify({
        message: `${scopeLabel(change.scope)} access wasn’t changed`,
        error,
        tone: 'critical',
        action: {
          label: 'Try again',
          onPress: () => {
            mutation.mutate(change);
          },
        },
      });
    },
  });
  return mutation;
}
