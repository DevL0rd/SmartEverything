import type { ProjectFilesService } from '../projects/service';
import type { Store } from '../store/store';
import { EmbeddedBrowserAuthority } from './embedded-browser-authority';
import { EmbeddedBrowserControllers } from './embedded-browser-controllers';
import { EmbeddedBrowserSockets } from './embedded-browser-socket';
import { ViewerFocus } from './viewer-focus';
export class BrowserService {
  readonly controllers: EmbeddedBrowserControllers;
  readonly sockets: EmbeddedBrowserSockets;
  constructor(store: Store, projects: ProjectFilesService) {
    this.controllers = new EmbeddedBrowserControllers(
      store,
      new EmbeddedBrowserAuthority(store),
      new ViewerFocus(),
      projects,
    );
    this.sockets = new EmbeddedBrowserSockets(store, this.controllers);
  }
  stop(): void {
    this.controllers.stop();
    this.sockets.stop();
  }
}
