export function filesKey(deviceId: string): readonly string[] {
  return ['window', 'computer-files', deviceId];
}

export function listKey(deviceId: string, path: string): readonly string[] {
  return [...filesKey(deviceId), 'list', path];
}

export function placesKey(deviceId: string): readonly string[] {
  return [...filesKey(deviceId), 'places'];
}
