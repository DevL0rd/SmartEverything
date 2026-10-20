import { PermissionsAndroid, Platform } from 'react-native';

const API_WITH_RUNTIME_PERMISSIONS = 31;

function needsRuntimePermissions(): boolean {
  return (
    Platform.OS === 'android' &&
    typeof Platform.Version === 'number' &&
    Platform.Version >= API_WITH_RUNTIME_PERMISSIONS
  );
}

export async function connectPermitted(): Promise<boolean> {
  if (!needsRuntimePermissions()) {
    return true;
  }
  const connect = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  if (await PermissionsAndroid.check(connect)) {
    return true;
  }
  return (await PermissionsAndroid.request(connect)) === PermissionsAndroid.RESULTS.GRANTED;
}

export async function scanAndConnectPermitted(): Promise<boolean> {
  if (!needsRuntimePermissions()) {
    return true;
  }
  const answers = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return Object.values(answers).every((answer) => answer === PermissionsAndroid.RESULTS.GRANTED);
}
