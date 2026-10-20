import { z } from 'zod';

export const COMPUTER_SCOPES = z.strictObject({
  metrics: z.boolean().describe('readings such as processor, memory and temperatures'),
  processes: z.boolean().describe('the list of running programs and ending your own'),
  power: z.boolean().describe('shut down, restart, sleep, lock and sign out'),
  apps: z.boolean().describe('opening and closing apps and windows'),
  app_events: z
    .boolean()
    .describe('telling the home when apps open, close, come to the front or leave it'),
  system: z
    .boolean()
    .describe('sound, screens and system settings such as power mode, Wi-Fi and services'),
  files: z.boolean().describe('browsing and downloading files'),
  screenshots: z.boolean().describe('taking screenshots'),
  input: z.boolean().describe('pointer and keyboard control by SmartEverything'),
  ai_power: z.boolean().describe('whether the AI may use power actions'),
});

export type ComputerScopes = z.infer<typeof COMPUTER_SCOPES>;

export type ComputerScope = keyof ComputerScopes;

export const DEFAULT_COMPUTER_SCOPES: ComputerScopes = {
  metrics: true,
  processes: true,
  power: true,
  apps: true,
  app_events: true,
  system: true,
  files: true,
  screenshots: true,
  input: false,
  ai_power: true,
};

export const COMPUTER_SCOPES_PATCH = COMPUTER_SCOPES.partial().refine(
  (patch) => Object.keys(patch).length > 0,
  { message: 'change at least one permission' },
);

export type ComputerScopesPatch = z.infer<typeof COMPUTER_SCOPES_PATCH>;

export const COMPUTER_SCOPE_OFF: Readonly<Record<ComputerScope, string>> = {
  metrics: 'Readings are turned off for this computer.',
  processes: 'Programs are turned off for this computer.',
  power: 'Power actions are turned off for this computer.',
  apps: 'Apps are turned off for this computer.',
  app_events: 'App events are turned off for this computer.',
  system: 'Sound, screens and system settings are turned off for this computer.',
  files: 'Files are turned off for this computer.',
  screenshots: 'Screenshots are turned off for this computer.',
  input:
    'Pointer and keyboard control is turned off for this computer. The person turns it on in its permissions.',
  ai_power: 'The AI may not use power actions on this computer.',
};
