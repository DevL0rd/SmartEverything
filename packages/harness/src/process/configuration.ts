import {
  AI_HARNESS_CONFIGURATION_REPORT,
  AI_HARNESS_CONFIGURATION_STORED_REPORT,
} from '@smarteverything/domain';
import type { HarnessDesiredConfiguration } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { HarnessRuntime } from '../host/runtime';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessHttp } from './http';

export class ProcessHarnessConfiguration {
  private runtime: HarnessRuntime | undefined;
  private registered = false;
  private tail: Promise<void> = Promise.resolve();
  private failure: Error | undefined;
  private readonly log = new Logger('tool.harness-configuration');

  constructor(private readonly http: HarnessHttp) {}

  bind(runtime: HarnessRuntime): void {
    this.runtime = runtime;
  }

  changed = (): void => {
    this.report(false);
  };

  pending = (): void => {
    this.report(true);
  };

  async configure(configuration: HarnessDesiredConfiguration): Promise<void> {
    const runtime = this.requireRuntime();
    this.registered = true;
    await runtime.configure(configuration);
    this.report(runtime.configurationState().pendingRevision !== null);
    await this.flush();
  }

  stop(): void {
    this.registered = false;
  }

  async flush(): Promise<void> {
    await this.tail;
    if (this.failure !== undefined) throw this.failure;
  }

  private report(pending: boolean): void {
    if (!this.registered) return;
    const runtime = this.requireRuntime();
    const state = runtime.configurationState();
    if (state.revision === null)
      throw new HarnessRuntimeError('composition_incompatible', 'No applied host configuration.');
    const identity = this.http.identity();
    const report = AI_HARNESS_CONFIGURATION_REPORT.parse({
      target: { kind: 'device', device_id: identity.device_id },
      runtime_instance: identity.runtime_instance,
      connection_generation: identity.generation,
      revision: state.revision,
      readiness: state.readiness,
      reported_at: new Date().toISOString(),
      ...(pending && state.pendingRevision !== null
        ? { pending_revision: state.pendingRevision }
        : {}),
    });
    const manifest = runtime.manifest();
    this.tail = this.tail
      .then(async (): Promise<void> => {
        await this.http.call(
          { operation: 'configuration_report', report, manifest },
          AI_HARNESS_CONFIGURATION_STORED_REPORT,
        );
      })
      .catch((cause: unknown): void => {
        this.failure =
          cause instanceof Error
            ? cause
            : new HarnessRuntimeError(
                'runtime_unavailable',
                'Host configuration publication failed with an invalid error result.',
              );
        this.log.error('configuration.report_failed', cause);
      });
  }

  private requireRuntime(): HarnessRuntime {
    if (this.runtime === undefined)
      throw new HarnessRuntimeError('runtime_unavailable', 'Host composition is not initialized.');
    return this.runtime;
  }
}
