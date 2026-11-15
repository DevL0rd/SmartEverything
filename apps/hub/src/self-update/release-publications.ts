import type { PipelineComponent } from '@smarteverything/domain';

export type PublicationListener = (component: PipelineComponent, commit: string) => Promise<void>;

export class ReleasePublications {
  private readonly listeners: PublicationListener[] = [];

  listen(listener: PublicationListener): void {
    this.listeners.push(listener);
  }

  async published(component: PipelineComponent, commit: string): Promise<void> {
    for (const listener of this.listeners) await listener(component, commit);
  }
}
