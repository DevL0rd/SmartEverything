import type { IntegrationPorts } from './integration-effects';

class IntegrationNotReadyError extends Error {
  override readonly name = 'IntegrationNotReadyError';

  constructor() {
    super(
      'The AI and camera services aren’t running on this server yet, so this step couldn’t run.',
    );
  }
}

export class AutomationIntegrationSlot implements IntegrationPorts {
  private ports: IntegrationPorts | null = null;

  attach(ports: IntegrationPorts): void {
    this.ports = ports;
  }

  stop(): void {
    this.ports = null;
  }

  private current(): IntegrationPorts {
    if (this.ports === null) throw new IntegrationNotReadyError();
    return this.ports;
  }

  get model(): IntegrationPorts['model'] {
    return this.current().model;
  }

  get pictures(): IntegrationPorts['pictures'] {
    return this.current().pictures;
  }

  get computers(): IntegrationPorts['computers'] {
    return this.current().computers;
  }

  get tools(): IntegrationPorts['tools'] {
    return this.current().tools;
  }

  get signals(): IntegrationPorts['signals'] {
    return this.current().signals;
  }

  get replies(): IntegrationPorts['replies'] {
    return this.current().replies;
  }

  get clock(): IntegrationPorts['clock'] {
    return this.current().clock;
  }

  get ownerProfileId(): IntegrationPorts['ownerProfileId'] {
    return this.current().ownerProfileId;
  }
}
