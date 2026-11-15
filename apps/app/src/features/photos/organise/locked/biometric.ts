import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'photos-locked-pin';
const MARK_KEY = 'photos-locked-fingerprint';

function keyOf(base: string, clientId: string): string {
  return `${base}.${clientId.replaceAll(/[^\w.-]/gu, '_')}`;
}

export function fingerprintAvailable(): boolean {
  return Platform.OS === 'android' && SecureStore.canUseBiometricAuthentication();
}

export async function keepPin(clientId: string, pin: string): Promise<void> {
  await SecureStore.setItemAsync(keyOf(PIN_KEY, clientId), pin, {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock the Locked folder with your fingerprint',
  });
  await SecureStore.setItemAsync(keyOf(MARK_KEY, clientId), 'on');
}

export async function keptPin(clientId: string): Promise<string | null> {
  return SecureStore.getItemAsync(keyOf(PIN_KEY, clientId), {
    requireAuthentication: true,
    authenticationPrompt: 'Open the Locked folder',
  });
}

export async function pinKept(clientId: string): Promise<boolean> {
  if (!fingerprintAvailable()) return false;
  return (await SecureStore.getItemAsync(keyOf(MARK_KEY, clientId))) === 'on';
}

export async function forgetPin(clientId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyOf(PIN_KEY, clientId));
  await SecureStore.deleteItemAsync(keyOf(MARK_KEY, clientId));
}
