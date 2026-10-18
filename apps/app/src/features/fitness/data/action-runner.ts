export interface ActionOutcome {
  readonly message: string;
  readonly tone: 'positive' | 'default';
}

export interface ActionRunnerDeps<A extends string> {
  readonly setBusy: (action: A | null) => void;
  readonly refresh: () => void;
  readonly succeeded: (outcome: ActionOutcome) => void;
  readonly failed: (error: unknown) => void;
}

export type ActionRunner<A extends string> = (
  action: A,
  work: () => Promise<ActionOutcome>,
) => Promise<void>;

export function createActionRunner<A extends string>(deps: ActionRunnerDeps<A>): ActionRunner<A> {
  let running = false;
  return async (action, work): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    deps.setBusy(action);
    try {
      deps.succeeded(await work());
    } catch (error: unknown) {
      deps.failed(error);
    } finally {
      running = false;
      deps.setBusy(null);
      deps.refresh();
    }
  };
}
