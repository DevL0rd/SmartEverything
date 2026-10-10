import { z } from 'zod';

export const COMPUTER_SCOPES = z.strictObject({
  metrics: z.boolean().describe('readings such as processor, memory and temperatures'),
  processes: z.boolean().describe('the list of running programs and ending your own'),
  power: z.boolean().describe('shut down, restart, sleep, lock and sign out'),
  apps: z.boolean().describe('opening and closing apps'),
  files: z.boolean().describe('browsing and downloading files'),
  screenshots: z.boolean().describe('taking screenshots'),
  ai_power: z.boolean().describe('whether the AI may use power actions'),
});

export type ComputerScopes = z.infer<typeof COMPUTER_SCOPES>;

export type ComputerScope = keyof ComputerScopes;

export const DEFAULT_COMPUTER_SCOPES: ComputerScopes = {
  metrics: true,
  processes: true,
  power: true,
  apps: true,
  files: true,
  screenshots: true,
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
  files: 'Files are turned off for this computer.',
  screenshots: 'Screenshots are turned off for this computer.',
  ai_power: 'The AI may not use power actions on this computer.',
};
