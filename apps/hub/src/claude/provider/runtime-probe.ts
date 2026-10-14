import { query, type Query, type Options } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeProviderOptions } from '@smarteverything/domain';
import { ProviderInput } from './input';
import { requireSubscription } from './job-state';
import { configurationOptions } from './configured-options';
import { subscriptionEnvironment, workDirectory } from './options';
interface ProbeConfig {
  readonly directory: string;
  readonly options: ClaudeProviderOptions;
  readonly executable?: string;
}
export async function providerProbe(config: ProbeConfig): Promise<Query> {
  const options: Options = {
    ...configurationOptions(config.options),
    cwd: await workDirectory(config.directory, config.options),
    tools: [],
    settingSources: config.options.setting_sources ?? [],
    env: subscriptionEnvironment(),
    permissionMode: 'default',
    ...(config.executable === undefined ? {} : { pathToClaudeCodeExecutable: config.executable }),
  };
  const runtime = query({ prompt: new ProviderInput(), options });
  try {
    requireSubscription((await runtime.initializationResult()).account);
    return runtime;
  } catch (cause) {
    runtime.close();
    throw cause;
  }
}
