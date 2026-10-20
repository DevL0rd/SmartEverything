import { z } from 'zod';

export const HARNESS_PLATFORM = z.enum(['linux', 'macos', 'windows']);
export type HarnessPlatform = z.infer<typeof HARNESS_PLATFORM>;

export const HARNESS_SANDBOX_ENFORCEMENT = z.enum(['full', 'partial']);
export type HarnessSandboxEnforcement = z.infer<typeof HARNESS_SANDBOX_ENFORCEMENT>;

export class UnsupportedHarnessPlatformError extends Error {
  override readonly name = 'UnsupportedHarnessPlatformError';

  constructor(received: string) {
    super(
      `No harness runs on the platform ${JSON.stringify(received)}; expected linux, darwin or win32.`,
    );
  }
}

export function harnessPlatform(nodePlatform: string): HarnessPlatform {
  switch (nodePlatform) {
    case 'linux':
      return 'linux';
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      throw new UnsupportedHarnessPlatformError(nodePlatform);
  }
}
