export type CallOpen = (callMessageId: string) => boolean;

export class OpenCalls {
  private probe: CallOpen | null = null;

  attach(probe: CallOpen): void {
    this.probe = probe;
  }

  isOpen(callMessageId: string): boolean {
    return this.probe?.(callMessageId) ?? false;
  }
}
