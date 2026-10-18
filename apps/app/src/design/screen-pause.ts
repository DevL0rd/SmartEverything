import { createContext, startTransition, use, useEffect, useState } from 'react';

const resuming = new Set<() => void>();
let resumeFrame: number | null = null;

function resumeAll(): void {
  resumeFrame = null;
  const due = [...resuming];
  resuming.clear();
  for (const resume of due) {
    resume();
  }
}

function resumeNextFrame(resume: () => void): void {
  resuming.add(resume);
  resumeFrame ??= requestAnimationFrame(resumeAll);
}

export class ScreenPause {
  private own: boolean;
  private paused: boolean;
  private readonly listeners = new Set<() => void>();
  private readonly held = new Set<() => void>();
  private readonly children = new Set<ScreenPause>();

  constructor(
    private readonly parent: ScreenPause | null,
    own = false,
  ) {
    this.own = own;
    this.paused = own || (parent?.paused ?? false);
  }

  readonly isPaused = (): boolean => this.paused;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };

  attach(): () => void {
    const parent = this.parent;
    parent?.children.add(this);
    this.refresh();
    return (): void => {
      parent?.children.delete(this);
    };
  }

  setOwn(own: boolean): void {
    this.own = own;
    this.refresh();
  }

  gate(wake: () => void): () => void {
    return (): void => {
      if (this.paused) {
        this.held.add(wake);
      } else {
        wake();
      }
    };
  }

  release(wake: () => void): void {
    this.held.delete(wake);
  }

  private refresh(): void {
    const next = this.own || (this.parent?.paused ?? false);
    if (next === this.paused) {
      return;
    }
    this.paused = next;
    for (const child of this.children) {
      child.refresh();
    }
    if (next) {
      this.notify();
    } else {
      resumeNextFrame(this.resume);
    }
  }

  private readonly resume = (): void => {
    if (this.paused) {
      return;
    }
    this.notify();
    const woken = [...this.held];
    this.held.clear();
    for (const wake of woken) {
      wake();
    }
  };

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const ScreenPausedContext = createContext(new ScreenPause(null));

export function useScreenPaused(): boolean {
  const pause = use(ScreenPausedContext);
  const [paused, setPaused] = useState(pause.isPaused);
  useEffect(() => {
    const follow = (): void => {
      if (pause.isPaused()) {
        startTransition(() => {
          setPaused(true);
        });
      } else {
        setPaused(false);
      }
    };
    follow();
    return pause.subscribe(follow);
  }, [pause]);
  return paused;
}
