import {
  ApiError,
  PLUGIN_MANIFEST,
  type JsonValue,
  type PluginOptionPage,
  type PluginOptionQuery,
} from '@smarteverything/domain';
import { failure, type HubToolResult, type ToolCaller } from '../ai-tools/hub-tool';
import type {
  BuiltinPlugin,
  PluginOptionProvider,
  PluginStop,
  PluginTool,
  Unsubscribe,
} from './builtin/contract';
import { builtinContext, type BuiltinContextOptions } from './builtin-context';
import type { PluginRuntime, RuntimeSinks, RuntimeTool } from './runtime';

export interface BuiltinRuntimeOptions {
  readonly plugin: BuiltinPlugin;
  readonly settings: Readonly<Record<string, JsonValue>>;
  readonly context: BuiltinContextOptions;
  readonly sinks: RuntimeSinks;
}

type SettingsListener = (settings: Readonly<Record<string, JsonValue>>) => void;

export class BuiltinPluginStartError extends Error {
  override readonly name = 'BuiltinPluginStartError';
}

export class BuiltinRuntime implements PluginRuntime {
  private registered: readonly PluginTool[] = [];
  private readonly disposers = new Set<Unsubscribe>();
  private controller: AbortController | null = null;
  private stopPlugin: PluginStop | null = null;
  private readonly settingsListeners = new Set<SettingsListener>();
  private readonly providers = new Map<string, PluginOptionProvider>();

  constructor(private readonly options: BuiltinRuntimeOptions) {}

  async start(): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    const started = await this.options.plugin.start(
      builtinContext(this.options.context, {
        manifest: PLUGIN_MANIFEST.parse(this.options.plugin.manifest),
        signal: controller.signal,
        sinks: this.options.sinks,
        tools: (tools): void => {
          this.registered = tools;
          this.options.sinks.toolsChanged();
        },
        track: (stop) => this.track(stop),
        watchSettings: (listener) => this.watchSettings(listener),
        options: (source, provider) => this.provide(source, provider),
      }),
      this.options.settings,
    );
    if (!started.ok) {
      await this.stop();
      throw new BuiltinPluginStartError(started.reason);
    }
    this.stopPlugin = started.stop;
  }

  async stop(): Promise<void> {
    this.controller?.abort();
    this.controller = null;
    const stopPlugin = this.stopPlugin;
    this.stopPlugin = null;
    this.registered = [];
    this.providers.clear();
    try {
      await stopPlugin?.();
    } finally {
      this.disposers.forEach((dispose) => {
        dispose();
      });
      this.disposers.clear();
    }
  }

  settingsChanged(settings: Readonly<Record<string, JsonValue>>): void {
    this.settingsListeners.forEach((listener) => {
      listener(settings);
    });
  }

  tools(): readonly RuntimeTool[] {
    return this.registered;
  }

  call(
    name: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): Promise<HubToolResult> {
    const tool = this.registered.find((candidate) => candidate.name === name);
    return tool === undefined
      ? Promise.resolve(failure(`The plugin has no tool named ${name}`))
      : tool.run(args, caller);
  }

  async choices(source: string, query: PluginOptionQuery): Promise<PluginOptionPage> {
    const provider = this.providers.get(source);
    if (provider === undefined && this.controller === null) {
      return { state: 'unavailable', message: 'The plugin is not running. Check its status.' };
    }
    if (provider === undefined) {
      throw new ApiError('not_found', `The plugin has no list named ${source}.`);
    }
    return await provider(query);
  }

  private provide(source: string, provider: PluginOptionProvider): Unsubscribe {
    this.providers.set(source, provider);
    return this.track((): void => {
      this.providers.delete(source);
    });
  }

  private watchSettings(listener: SettingsListener): Unsubscribe {
    this.settingsListeners.add(listener);
    return this.track((): void => {
      this.settingsListeners.delete(listener);
    });
  }

  private track(stop: Unsubscribe): Unsubscribe {
    this.disposers.add(stop);
    return (): void => {
      if (this.disposers.delete(stop)) {
        stop();
      }
    };
  }
}
