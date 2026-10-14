import { Logger } from '@smarteverything/logging';
import { serviceProcessStart } from '../../../hub/src/service/process-identity';
import { createHash } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import {
  NODE_SERVICE_READY,
  SERVICE_READY_FILE,
  type NodeServiceReady,
} from '../../../hub/src/service/configuration';
import {
  NODE_ROUTE_VIEW,
  NODE_ROUTE_VIEW_FILE,
  type NodeRouteView,
} from '../../../hub/src/service/route-view';
import { readPrivateServiceFile } from '../../../hub/src/service/private-files';
export { readPrivateServiceFile } from '../../../hub/src/service/private-files';
import { HubTransportError } from './policy.js';
const log = new Logger('desktop.hub-route');
export class DesktopAuthorityView {
  private watcher: FSWatcher | null = null;
  private operation = 0;
  private stopped = false;
  private validating = false;
  private windowDigest: string | null = null;
  private last: NodeRouteView | null = null;
  private current: NodeRouteView | null = null;
  private readonly listeners = new Set<(view: NodeRouteView | null) => void>();
  constructor(
    readonly directory: string,
    readonly credentialChanged: () => void,
  ) {}
  get admitting(): boolean {
    return !this.stopped && !this.validating && this.current !== null;
  }
  get value(): NodeRouteView | null {
    return this.current;
  }
  subscribe(listener: (view: NodeRouteView | null) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }
  async supported(): Promise<boolean> {
    const ready = NODE_SERVICE_READY.parse(
      JSON.parse(await readPrivateServiceFile(this.directory, SERVICE_READY_FILE)),
    );
    return (
      ready.route_authority !== undefined &&
      ready.route_process_start !== undefined &&
      ready.route_process_start === (await serviceProcessStart(ready.pid))
    );
  }
  async start(): Promise<void> {
    if (this.watcher !== null) return;
    this.stopped = false;
    this.watcher = watch(this.directory, (_event, name): void => {
      if (
        name === NODE_ROUTE_VIEW_FILE ||
        name === SERVICE_READY_FILE ||
        name === 'node-window.json' ||
        name === null
      ) {
        void this.refresh().catch((cause: unknown): void => {
          log.warn('route.view_unavailable', {
            error_name: cause instanceof Error ? cause.name : 'unknown',
          });
        });
      }
    });
    this.watcher.on('error', (): void => {
      this.publish(null);
    });
    await this.refresh();
  }
  async refresh(): Promise<NodeRouteView | null> {
    const run = ++this.operation;
    this.validating = true;
    try {
      const { view, digest } = await this.readView(run);
      if (this.stopped || run !== this.operation) return this.current;
      this.validateRevision(view);
      this.validating = false;
      if (this.windowDigest !== null && this.windowDigest !== digest) this.credentialChanged();
      this.windowDigest = digest;
      this.last = view;
      this.publish(view);
      return this.current;
    } catch (cause) {
      if (!this.stopped && run === this.operation) this.publish(null);
      throw cause;
    } finally {
      if (run === this.operation) this.validating = false;
    }
  }
  private async windowDigestFor(run: number): Promise<string> {
    try {
      const window = await readPrivateServiceFile(this.directory, 'node-window.json');
      return createHash('sha256').update(window).digest('hex');
    } catch (cause) {
      if (!this.stopped && run === this.operation) this.credentialChanged();
      throw cause;
    }
  }
  private async readView(
    run: number,
  ): Promise<{ readonly view: NodeRouteView; readonly digest: string }> {
    const digest = await this.windowDigestFor(run);
    const ready = NODE_SERVICE_READY.parse(
      JSON.parse(await readPrivateServiceFile(this.directory, SERVICE_READY_FILE)),
    );
    const view = NODE_ROUTE_VIEW.parse(
      JSON.parse(await readPrivateServiceFile(this.directory, NODE_ROUTE_VIEW_FILE)),
    );
    const latest = NODE_SERVICE_READY.parse(
      JSON.parse(await readPrivateServiceFile(this.directory, SERVICE_READY_FILE)),
    );
    await this.validateService(ready, latest, view);
    return { view, digest };
  }
  private async validateService(
    ready: NodeServiceReady,
    latest: NodeServiceReady,
    view: NodeRouteView,
  ): Promise<void> {
    if (
      new URL(ready.hub_url).origin !== view.canonicalOrigin ||
      ready.route_authority !== view.authorityId ||
      ready.pid !== view.pid ||
      ready.route_process_start !== view.processStart ||
      view.processStart !== (await serviceProcessStart(view.pid)) ||
      latest.pid !== ready.pid ||
      latest.route_authority !== ready.route_authority ||
      latest.route_process_start !== ready.route_process_start
    )
      throw new HubTransportError('Route view differs from the running service incarnation');
  }
  private validateRevision(view: NodeRouteView): void {
    const previous = this.last;
    if (previous?.authorityId !== view.authorityId) return;
    if (
      view.revision < previous.revision ||
      view.state.routeGeneration < previous.state.routeGeneration ||
      view.state.networkGeneration < previous.state.networkGeneration ||
      (view.revision === previous.revision && JSON.stringify(view) !== JSON.stringify(previous))
    )
      throw new HubTransportError('Route view revision or generation moved backward');
  }
  private publish(view: NodeRouteView | null): void {
    if (JSON.stringify(view) === JSON.stringify(this.current)) return;
    this.current = view;
    for (const listener of this.listeners) listener(view);
  }
  stop(): void {
    this.stopped = true;
    this.operation += 1;
    this.watcher?.close();
    this.watcher = null;
    this.publish(null);
    this.listeners.clear();
  }
}
