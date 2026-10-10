import type { Action, CommandAction, SignalInput } from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { CommandInsert, CommandRow, HubDatabase } from '../database/port';
import type { AutomationAiSlot } from './automation-ai';

export interface ActionOrigin {
  readonly automationId: string;
  readonly name: string;
  readonly signal: SignalInput | null;
}

export interface ActionRunnerOptions {
  readonly store: Pick<HubDatabase, 'insertCommands'>;
  readonly submit: (rows: readonly CommandRow[]) => void;
  readonly sceneActions: (sceneId: string) => readonly CommandAction[] | undefined;
  readonly notify: (origin: ActionOrigin, message: string) => void;
  readonly ai: AutomationAiSlot;
  readonly clock: Pick<Clock, 'sleep'>;
}

export class UnknownSceneError extends Error {
  override readonly name = 'UnknownSceneError';

  constructor(sceneId: string) {
    super(`Scene ${sceneId} does not exist in this home.`);
  }
}

function commandOf(action: CommandAction, source: CommandInsert['source']): CommandInsert {
  return { deviceId: action.deviceId, capability: action.capability, value: action.value, source };
}

export class ActionRunner {
  constructor(private readonly options: ActionRunnerOptions) {}

  async runScene(sceneId: string): Promise<void> {
    const actions = this.options.sceneActions(sceneId);
    if (actions === undefined) {
      throw new UnknownSceneError(sceneId);
    }
    await this.issue(actions.map((action) => commandOf(action, 'scene')));
  }

  async run(actions: readonly Action[], origin: ActionOrigin): Promise<void> {
    for (const action of actions) {
      await this.runOne(action, origin);
    }
  }

  private async runOne(action: Action, origin: ActionOrigin): Promise<void> {
    switch (action.type) {
      case 'command':
        await this.issue([commandOf(action, 'automation')]);
        return;
      case 'scene':
        await this.runScene(action.sceneId);
        return;
      case 'delay':
        await this.options.clock.sleep(action.seconds * 1000);
        return;
      case 'notify':
        this.options.notify(origin, action.message);
        return;
      case 'wake_ai':
        await this.options.ai.current().wake(action, origin);
        return;
      case 'tool':
        await this.options.ai.current().tool(action, origin);
        return;
    }
  }

  private async issue(commands: readonly CommandInsert[]): Promise<void> {
    this.options.submit(await this.options.store.insertCommands(commands));
  }
}
