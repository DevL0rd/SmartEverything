import type { HarnessPlatform, HubHarnessControl } from '@smarteverything/domain';

export class NodeHarnessError extends Error {
  override readonly name = 'NodeHarnessError';
}

export class NodeHarnessBinding {
  private generation: string | null = null;
  constructor(
    readonly instance: string,
    readonly os: HarnessPlatform,
  ) {}
  validate(frame: HubHarnessControl, device: string): void {
    if (frame.device_id !== device || frame.runtime_instance !== this.instance)
      throw new NodeHarnessError('Computer control names another host instance.');
    if (frame.type === 'harness_welcome') {
      if (this.generation !== null) throw new NodeHarnessError('Duplicate computer welcome.');
      this.generation = frame.generation;
      return;
    }
    if (this.generation !== frame.generation)
      throw new NodeHarnessError('Computer control names another generation.');
  }
}
