export interface Wrapped {
  readonly command: string;
  readonly args: readonly string[];
}

export interface Target {
  readonly kind: string;
  readonly root: string;
  mount(): Promise<void>;
  unmount(): Promise<void>;
  wrap(command: string, args: readonly string[]): Wrapped;
  drain(): readonly string[];
}
