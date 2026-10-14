import type { HubHarnessControl } from '@smarteverything/domain';

export class NodeHarnessError extends Error {
  override readonly name = 'NodeHarnessError';
}

export class NodeHarnessBinding {
  private generation: string | null = null;
  constructor(
    readonly instance: string,
    private readonly timer: NodeJS.Timeout,
    readonly os: 'linux' | 'macos',
  ) {}
  validate(frame: HubHarnessControl, device: string): void {
    if (frame.device_id !== device || frame.runtime_instance !== this.instance)
      throw new NodeHarnessError('Computer control names another host instance.');
    if (frame.type === 'harness_welcome') {
      if (this.generation !== null) throw new NodeHarnessError('Duplicate computer welcome.');
      this.generation = frame.generation;
      clearTimeout(this.timer);
      return;
    }
    if (this.generation !== frame.generation)
      throw new NodeHarnessError('Computer control names another generation.');
  }
}
