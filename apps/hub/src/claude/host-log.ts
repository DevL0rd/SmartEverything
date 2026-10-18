import type { ComputerAiCapabilities, ComputerAiSettings } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { messageOf } from '@smarteverything/logging';

export class HostLog {
  constructor(
    private readonly log: Logger,
    private readonly deviceId: string,
  ) {}

  listener(change: 'added' | 'removed', listeners: number): void {
    this.log.debug(`claude.host_listener_${change}`, { listeners });
  }

  stopping(listeners: number): void {
    this.log.info('claude.host_stopping', { deviceId: this.deviceId, listeners });
  }

  capabilities(capabilities: ComputerAiCapabilities, listeners: number): void {
    this.log.info('claude.capabilities_changed', {
      deviceId: this.deviceId,
      operations: capabilities.operations.length,
      providerReady: capabilities.provider_reason === null,
      listeners,
    });
  }

  settings(next: ComputerAiSettings, previous: ComputerAiSettings): void {
    this.log.info('claude.settings_applied', {
      deviceId: this.deviceId,
      providerEnabled: next.provider.enabled,
      controlEnabled: next.control.enabled,
      autoLink: next.control.auto_link,
      previousProviderEnabled: previous.provider.enabled,
      previousControlEnabled: previous.control.enabled,
    });
  }

  reason(operation: string, reason: string | null): void {
    this.log.info('claude.provider_reason_changed', {
      operation,
      ready: reason === null,
      reason: reason?.slice(0, 200) ?? null,
    });
  }

  discoveryFailed(operation: string, cause: unknown): void {
    this.log.warn('claude.provider_discovery_failed', {
      operation,
      errorName: cause instanceof Error ? cause.name : typeof cause,
      reason: messageOf(cause).slice(0, 300),
    });
  }
}
