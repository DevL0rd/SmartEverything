export const anchorKey = {
  setting: (settingId: string): string => `setting:${settingId}`,
  capability: (deviceId: string, capability: string): string =>
    `capability:${deviceId}:${capability}`,
  step: (stepId: string): string => `step:${stepId}`,
  nav: (node: string): string => `nav:${node}`,
  tile: (deviceId: string): string => `tile:device:${deviceId}`,
} as const;
