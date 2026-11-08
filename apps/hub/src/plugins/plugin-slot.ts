import type {
  JsonValue,
  PluginOptionPage,
  PluginOptionQuery,
  PluginStatus,
} from '@smarteverything/domain';
import { failure, type HubToolResult, type ToolCaller } from '../ai-tools/hub-tool';
import { Backoff } from './backoff';
import type { Contributions } from './contributions';
import { pluginSource } from './plugin-logs';
import { recordProcessOutput } from '../service/process-output';
import { MissingSecretError } from './placeholders';
import type { PluginRuntime, RuntimeSinks, RuntimeTool } from './runtime';
import { messageOf, type Logger } from '@smarteverything/logging';

export interface SlotOptions {
  readonly id: string;
  readonly log: Logger;
  readonly factory: (sinks: RuntimeSinks) => PluginRuntime;
  readonly contributions: (log: (line: string) => void) => Contributions;
  readonly status: (status: PluginStatus, detail: string | null) => void;
  readonly toolsChanged: () => void;
  readonly now: () => Date;
}

export class PluginSlot {
  private readonly backoff = new Backoff();
  private runtime: PluginRuntime | null = null;
  private contributed: Contributions | null = null;
  private retry: NodeJS.Timeout | null = null;
  private wanted = false;

  constructor(private readonly options: SlotOptions) {}

  async start(): Promise<void> {
    this.wanted = true;
    this.cancelRetry();
    await this.release();
    const contributed = this.options.contributions(this.log);
    const runtime = this.options.factory(this.sinks(contributed));
    this.contributed = contributed;
    this.runtime = runtime;
    this.options.status('starting', null);
    this.backoff.started(this.options.now().getTime());
    try {
      await runtime.start();
      this.options.status('running', null);
    } catch (cause) {
      this.failed(cause);
    }
  }

  async stop(): Promise<void> {
    this.wanted = false;
    this.cancelRetry();
    await this.release();
    this.options.toolsChanged();
  }

  settingsChanged(settings: Readonly<Record<string, JsonValue>>): void {
    this.runtime?.settingsChanged(settings);
  }

  tools(): readonly RuntimeTool[] {
    return this.runtime?.tools() ?? [];
  }

  choices(source: string, query: PluginOptionQuery, caller: ToolCaller): Promise<PluginOptionPage> {
    return this.runtime === null
      ? Promise.resolve({ state: 'unavailable', message: 'The plugin is not running.' })
      : this.runtime.choices(source, query, caller);
  }

  call(
    name: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): Promise<HubToolResult> {
    return this.runtime === null
      ? Promise.resolve(failure('The plugin is not running'))
      : this.runtime.call(name, args, caller);
  }

  private readonly log = (line: string): void => {
    recordProcessOutput(
      {
        source: pluginSource(this.options.id),
        scope: this.options.log.scope,
        event: 'plugin.output',
      },
      line,
      this.options.now(),
    );
  };

  private async release(): Promise<void> {
    const runtime = this.runtime;
    const contributed = this.contributed;
    this.runtime = null;
    this.contributed = null;
    try {
      await runtime?.stop();
    } finally {
      contributed?.stop();
    }
  }

  private failed(cause: unknown): void {
    const reason = messageOf(cause).slice(0, 400);
    if (cause instanceof MissingSecretError) {
      this.options.log.warn('plugin.needs_auth', { reason });
      this.options.status('needs_auth', reason);
      return;
    }
    this.crashed(reason, cause);
  }

  private crashed(detail: string, cause: unknown = new Error(detail)): void {
    this.options.log.error('plugin.crashed', cause);
    this.options.status('crashed', detail);
    if (!this.wanted) {
      return;
    }
    const delay = this.backoff.nextDelay(this.options.now().getTime());
    this.retry = setTimeout(() => {
      this.retry = null;
      this.start().catch((cause: unknown) => {
        this.failed(cause);
      });
    }, delay);
    this.retry.unref();
  }

  private cancelRetry(): void {
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
  }

  private sinks(contributed: Contributions): RuntimeSinks {
    return {
      ...contributed.sinks,
      log: this.log,
      toolsChanged: this.options.toolsChanged,
      status: (status, detail): void => {
        if (status === 'crashed') {
          this.crashed(detail ?? 'The plugin stopped');
        } else {
          this.options.status(status, detail);
        }
      },
    };
  }
}
