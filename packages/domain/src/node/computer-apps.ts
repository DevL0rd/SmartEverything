import { z } from 'zod';
import { SESSION_APP } from './computer-session-state';

export const INSTALLED_APP = z.strictObject({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  comment: z.string().max(300).nullable(),
  icon: z.string().max(300).nullable(),
});

export type InstalledApp = z.infer<typeof INSTALLED_APP>;

export const APP_USAGE = z.strictObject({
  appId: z.string().min(1),
  name: z.string().min(1),
  seconds: z.number().nonnegative(),
});

export type AppUsage = z.infer<typeof APP_USAGE>;

export const COMPUTER_APPS = z.strictObject({
  installed: z.array(INSTALLED_APP),
  focused: SESSION_APP.nullable(),
  today: z.array(APP_USAGE),
  week: z.array(APP_USAGE),
});

export type ComputerApps = z.infer<typeof COMPUTER_APPS>;

export const APP_CLOSED = z.strictObject({ windows: z.int().nonnegative() });
