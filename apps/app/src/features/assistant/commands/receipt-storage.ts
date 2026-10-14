import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import type { AiNativeCommandWrite, AiNativeCommandReceipt } from '@smarteverything/domain';
export interface NativeLocalReceipt {
  readonly key: string;
  readonly identity: {
    readonly scopeKey: string;
    readonly payloadHash: string;
    readonly request: Pick<
      AiNativeCommandWrite,
      'scope' | 'operation_id' | 'command_job_id' | 'definition_id'
    >;
  };
}
export async function retainNativeReceipt(
  scopeKey: string,
  request: AiNativeCommandWrite,
): Promise<NativeLocalReceipt> {
  const receipt = {
    key: `smarteverything.command.${request.operation_id}`,
    identity: {
      scopeKey,
      request: {
        scope: request.scope,
        operation_id: request.operation_id,
        command_job_id: request.command_job_id,
        definition_id: request.definition_id,
      },
      payloadHash: await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(request)),
    },
  };
  await AsyncStorage.setItem(
    receipt.key,
    JSON.stringify({ ...receipt.identity, status: 'pending' }),
  );
  return receipt;
}
export async function saveNativeReceipt(
  local: NativeLocalReceipt,
  receipt: AiNativeCommandReceipt,
): Promise<void> {
  if (receipt.status === 'settled' || receipt.status === 'rejected')
    await AsyncStorage.removeItem(local.key);
  else
    await AsyncStorage.setItem(
      local.key,
      JSON.stringify({ ...local.identity, status: receipt.status, receipt }),
    );
}
export async function retireNativeReceipt(local: NativeLocalReceipt, text: string): Promise<void> {
  await AsyncStorage.setItem(
    local.key,
    JSON.stringify({ ...local.identity, status: 'unknown', text }),
  );
}
export async function discardNativeReceipt(local: NativeLocalReceipt): Promise<void> {
  await AsyncStorage.removeItem(local.key);
}
