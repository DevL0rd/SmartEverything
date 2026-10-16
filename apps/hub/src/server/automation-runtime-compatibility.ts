import {
  AUTOMATION_RUN_DETAILS_CAPABILITY,
  AUTOMATION_EFFECTS_CAPABILITY,
  AUTOMATION_SPEECH_CAPABILITY,
  automationFeatureChange,
  automationChangeForReader,
} from '@smarteverything/domain';
import type { Outgoing, Subscription } from './live-dialect';
import type { Connection } from './live-visibility';

export class AutomationRuntimeReaders {
  private readonly effects = new WeakSet<Connection>();
  private readonly speech = new WeakSet<Connection>();
  private readonly detailed = new WeakSet<Connection>();
  observe(connection: Connection, message: Subscription['message']): void {
    if (message.capabilities?.includes(AUTOMATION_EFFECTS_CAPABILITY) === true)
      this.effects.add(connection);
    else this.effects.delete(connection);
    if (message.capabilities?.includes(AUTOMATION_SPEECH_CAPABILITY) === true)
      this.speech.add(connection);
    else this.speech.delete(connection);
    if (message.capabilities?.includes(AUTOMATION_RUN_DETAILS_CAPABILITY) === true)
      this.detailed.add(connection);
    else this.detailed.delete(connection);
  }
  project(connection: Connection, message: Outgoing): Outgoing | null {
    if (message.type !== 'change') return message;
    const change = automationFeatureChange(message, {
      effects: this.effects.has(connection),
      speech: this.speech.has(connection),
    });
    return change === null
      ? null
      : automationChangeForReader(change, this.detailed.has(connection));
  }
}
