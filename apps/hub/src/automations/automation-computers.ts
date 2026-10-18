import type { ComputerFeature, NodeRequest } from '@smarteverything/domain';
import type { z } from 'zod';
import type { ComputerViewer } from '../computers/computer-access';

export interface AutomationComputers {
  readonly ask: <T>(
    viewer: ComputerViewer,
    deviceId: string,
    request: NodeRequest,
    schema: z.ZodType<T>,
  ) => Promise<T>;
  readonly features: (deviceId: string) => readonly ComputerFeature[] | null;
}

class ComputersNotReadyError extends Error {
  override readonly name = 'ComputersNotReadyError';

  constructor() {
    super('Computers aren’t connected to this server yet, so this step couldn’t run.');
  }
}

export class AutomationComputersSlot {
  private computers: AutomationComputers | null = null;

  attach(computers: AutomationComputers): () => void {
    this.computers = computers;
    return (): void => {
      if (this.computers === computers) this.computers = null;
    };
  }

  current(): AutomationComputers {
    if (this.computers === null) throw new ComputersNotReadyError();
    return this.computers;
  }

  features(deviceId: string): readonly ComputerFeature[] | null {
    return this.computers?.features(deviceId) ?? null;
  }
}
