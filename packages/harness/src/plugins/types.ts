import type { Context } from '@deepseek-ai/cordis';

export interface PluginEnvironment {
  readonly cwd: string;
  readonly server: boolean;
}

export interface HarnessPlugin {
  readonly name: string;
  readonly mount: (ctx: Context, environment: PluginEnvironment) => Promise<void>;
}
