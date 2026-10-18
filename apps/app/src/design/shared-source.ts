export type Listener = () => void;

export class SharedSource {
  private readonly listeners = new Set<Listener>();
  private detach: (() => void) | null = null;

  constructor(private readonly attach: (notify: Listener) => () => void) {}

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    this.detach ??= this.attach(this.notify);
    return (): void => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.detach?.();
        this.detach = null;
      }
    };
  };

  private readonly notify = (): void => {
    for (const listener of [...this.listeners]) listener();
  };
}
