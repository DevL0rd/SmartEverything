import {
  appCreateBody,
  appUpdateBody,
  nextPageOf,
  oauthGenerateBody,
  oauthUpdateBody,
  readApp,
  readAppCreation,
  readAppList,
  readOAuthGeneration,
  type AppCredentials,
  type AppTargets,
  type SmartThingsApp,
} from '@smarteverything/smartthings';
import {
  requestWithToken,
  type ApiRequest,
  type SmartThingsIo,
} from '../../adapters/smartthings/http';

const APPS_PATH = '/v1/apps';

export interface ListedApp {
  readonly appId: string;
  readonly appName: string;
}

function appPath(appId: string, rest = ''): string {
  return `${APPS_PATH}/${encodeURIComponent(appId)}${rest}`;
}

export class AppsClient {
  constructor(
    private readonly io: SmartThingsIo,
    private readonly token: string,
  ) {}

  async find(appId: string | null, appName: string): Promise<ListedApp | null> {
    const apps: ListedApp[] = [];
    let page: string | null = APPS_PATH;
    while (page !== null) {
      const list = readAppList(await this.call({ method: 'GET', path: page }));
      apps.push(...list.items);
      page = nextPageOf(list);
    }
    return (
      apps.find((app) => app.appId === appId) ?? apps.find((app) => app.appName === appName) ?? null
    );
  }

  async create(
    targets: AppTargets,
  ): Promise<{ readonly app: SmartThingsApp; readonly credentials: AppCredentials }> {
    return readAppCreation(
      await this.call({ method: 'POST', path: APPS_PATH, body: appCreateBody(targets) }),
    );
  }

  async update(app: ListedApp, targets: AppTargets): Promise<SmartThingsApp> {
    const updated = readApp(
      await this.call({
        method: 'PUT',
        path: appPath(app.appId),
        body: appUpdateBody(targets, app.appName),
      }),
    );
    await this.call({
      method: 'PUT',
      path: appPath(app.appId, '/oauth'),
      body: oauthUpdateBody(targets),
    });
    return updated;
  }

  async regenerate(appId: string): Promise<AppCredentials> {
    const received = await this.call({
      method: 'POST',
      path: appPath(appId, '/oauth/generate'),
      body: oauthGenerateBody(),
    });
    return readOAuthGeneration(received, appId);
  }

  async register(appId: string): Promise<void> {
    await this.call({ method: 'PUT', path: appPath(appId, '/register'), body: {} });
  }

  private call(request: ApiRequest): Promise<unknown> {
    return requestWithToken(this.io, this.token, request);
  }
}
