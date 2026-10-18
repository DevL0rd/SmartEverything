import { GatewayPages } from './gateway-pages';
import { EmbeddedBrowserAuthority } from './embedded-browser-authority';
import { EmbeddedBrowserControllers } from './embedded-browser-controllers';
import { EmbeddedBrowserSockets } from './embedded-browser-socket';
import type { AiPreviewNotice } from '@smarteverything/domain';
import type { HarnessService } from '../harness/service';
import type { ComputerNodeAccess } from '../computers/node-access';
import type { Logger } from '@smarteverything/logging';
import { PreviewDiagnosticAuthority } from './diagnostic-authority';
import { PreviewDiagnostics } from './diagnostics';
import { PreviewDiagnosticSockets } from './diagnostic-socket';
import type { AssistantService } from '../assistant/service';
import { PreviewPublications } from './publications';
import { PreviewDocuments } from './documents';
import { PreviewSources } from './sources';
import { ViewerFocus } from './viewer-focus';
import { PreviewFileDocuments } from './file-documents';
import { PreviewLeases } from './leases';
import { PreviewDataSockets } from './data-sockets';
import { PreviewGateway, type PreviewGatewayConfig } from './gateway';
export class PreviewService {
  readonly browserControllers: EmbeddedBrowserControllers;
  readonly browserSockets: EmbeddedBrowserSockets;
  readonly diagnostics: PreviewDiagnostics;
  readonly diagnosticSockets: PreviewDiagnosticSockets;
  readonly publications: PreviewPublications;
  readonly leases: PreviewLeases;
  readonly documents: PreviewDocuments;
  readonly files: PreviewFileDocuments;
  readonly data: PreviewDataSockets;
  readonly gateway: PreviewGateway;
  constructor(
    harness: HarnessService,
    access: ComputerNodeAccess,
    log: Logger,
    options: {
      readonly assistant: AssistantService;
      readonly config?: PreviewGatewayConfig;
      readonly notice: (value: AiPreviewNotice) => void;
    },
  ) {
    this.publications = new PreviewPublications(harness, options.notice);
    this.documents = new PreviewDocuments(
      harness.store,
      options.notice,
      options.assistant.projects,
      log,
    );
    this.files = new PreviewFileDocuments(harness, this.documents, log);
    const sources = new PreviewSources(this.publications, this.documents);
    const focus = new ViewerFocus();
    this.leases = new PreviewLeases(harness.store, sources);
    this.diagnostics = new PreviewDiagnostics(
      harness.store,
      new PreviewDiagnosticAuthority(harness.store, sources),
      options.assistant,
      focus,
    );
    this.browserControllers = new EmbeddedBrowserControllers(
      harness.store,
      new EmbeddedBrowserAuthority(harness.store, sources),
      focus,
    );
    this.browserSockets = new EmbeddedBrowserSockets(harness.store, this.browserControllers);
    this.diagnosticSockets = new PreviewDiagnosticSockets(harness.store, this.diagnostics);
    this.data = new PreviewDataSockets(access, log);
    this.gateway = new PreviewGateway(options.config, this.leases, this.data, log);
    this.gateway.configurePages(new GatewayPages(harness.store, this.documents));
  }
  async stop(): Promise<void> {
    this.browserControllers.stop();
    this.browserSockets.stop();
    this.diagnostics.stop();
    this.diagnosticSockets.stop();
    await this.gateway.stop();
    this.publications.stop();
    this.documents.stop();
    this.files.stop();
  }
}
