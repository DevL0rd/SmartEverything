const denied = { granted: false, canAskAgain: false, status: 'denied' } as const;

export const getPermissionsAsync = (): Promise<typeof denied> => Promise.resolve(denied);

export const requestPermissionsAsync = (): Promise<typeof denied> => Promise.resolve(denied);

export const getDevicePushTokenAsync = (): Promise<{ readonly data: string }> =>
  Promise.resolve({ data: '' });

export const setNotificationCategoryAsync = (): Promise<[]> => Promise.resolve([]);

export const useLastNotificationResponse = (): null => null;
