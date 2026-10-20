import {
  PRINTER_ACTION_INPUT,
  PRINTER_CANDIDATES_VIEW,
  PRINTER_READ_INPUT,
  PRINTER_SETTINGS_VIEW,
  PrinterError,
  type PrinterActionInput,
  type PrinterReadInput,
  type PrinterSettingsView,
} from '@smarteverything/domain';
import type { ToolCaller } from '../contract';
import { requireOwner } from './access';
import type { SessionActions } from './actions';
import { dayKeyOf, type HomeClock } from './clock';
import { pair, type PairingPorts } from './pairing';
import type { PrinterRegistry } from './registry';
import {
  PRINTERS,
  adminUrlOf,
  daysCollection,
  eventsCollection,
  jobsCollection,
  marksCollection,
  prefsOf,
  spansCollection,
  supplyDaysCollection,
  type PrinterRecord,
} from './records';
import { mergePrefs, mergeSettings, defaultSettings } from './settings';
import { PrinterSession } from './session';
import { SNAPSHOTS, passwordSecretName, type SessionHost } from './session-host';
import { jobsView, overviewView, queueView, refOf, suppliesView, traysView } from './views';
import { optionsView } from './views-options';
import { statsView } from './views-stats';
import type { Candidate, PrinterDiscovery } from './discovery';
import { emptyWatch } from './watch-state';

export interface ServiceDeps {
  readonly registry: PrinterRegistry;
  readonly actions: SessionActions;
  readonly host: SessionHost;
  readonly clock: HomeClock;
  readonly discovery: () => Pick<PrinterDiscovery, 'candidates' | 'rescan'> | null;
  readonly pairing: PairingPorts;
  readonly announce: (session: PrinterSession) => void;
  readonly forgotten: (uuid: string) => Promise<void>;
}

export type Reply = Readonly<Record<string, unknown>>;

const JOB_LIMIT = 50;

type ActionOf<A extends PrinterActionInput['action']> = Extract<PrinterActionInput, { action: A }>;
type JobAction = ActionOf<'print' | 'test_page' | 'cancel' | 'cancel_all' | 'hold' | 'release'>;
type ControlAction = ActionOf<'identify' | 'pause' | 'resume' | 'open_page'>;
type OwnedAction = ActionOf<
  'trust_certificate' | 'credentials' | 'clear_history' | 'forget' | 'configure'
>;

const JOB_ACTIONS = ['print', 'test_page', 'cancel', 'cancel_all', 'hold', 'release'] as const;
const CONTROL_ACTIONS = ['identify', 'pause', 'resume', 'open_page'] as const;

function isJobAction(input: PrinterActionInput): input is JobAction {
  return JOB_ACTIONS.some((name) => name === input.action);
}

function isControlAction(input: PrinterActionInput): input is ControlAction {
  return CONTROL_ACTIONS.some((name) => name === input.action);
}

type Reader = (
  service: PrinterService,
  input: PrinterReadInput,
  session: PrinterSession,
  caller: ToolCaller,
) => Reply;

export class PrinterService {
  constructor(private readonly deps: ServiceDeps) {}

  read(raw: unknown, caller: ToolCaller): Reply {
    const input = PRINTER_READ_INPUT.parse(raw);
    if (input.view === 'candidates') return this.candidates();
    return READERS[input.view](this, input, this.deps.registry.resolve(input.printer), caller);
  }

  get clock(): HomeClock {
    return this.deps.clock;
  }

  candidates(): Reply {
    const known = new Set(this.deps.registry.list().map((session) => session.record.uuid));
    const candidates = (this.deps.discovery()?.candidates() ?? []).map((candidate: Candidate) => ({
      uri: candidate.uri,
      name: candidate.name,
      model: candidate.model,
      location: candidate.location,
      secure: candidate.secure,
      authentication: candidate.authentication,
      known: candidate.uuid !== null && known.has(candidate.uuid),
    }));
    return PRINTER_CANDIDATES_VIEW.parse({
      searching: this.deps.discovery() !== null,
      candidates,
      printers: this.deps.registry.list().map(refOf),
    });
  }

  settings(session: PrinterSession, caller: ToolCaller): PrinterSettingsView {
    requireOwner(caller, 'see the connection settings');
    const { record } = session;
    return PRINTER_SETTINGS_VIEW.parse({
      printer: refOf(session),
      uri: record.uri,
      secure: record.uri.startsWith('ipps:'),
      fingerprint: record.pin,
      pushing: session.pushing,
      idleSeconds: record.settings.idleSeconds,
      activeSeconds: record.settings.activeSeconds,
      leaseSeconds: record.settings.leaseSeconds,
      lowThresholds: record.settings.lowThresholds,
      prices: record.settings.prices,
      currency: record.settings.currency,
      weeklyBudget: record.settings.weeklyBudget,
      monthlyCap: record.settings.monthlyCap,
      printLessTarget: record.settings.printLessTarget,
      notify: record.settings.notify,
      hasCredentials: record.user !== null,
      needsAuth: record.needsAuth,
      certificateChange: record.certificateChange,
    });
  }

  async act(raw: unknown, caller: ToolCaller): Promise<Reply> {
    const input = PRINTER_ACTION_INPUT.parse(raw);
    if (input.action === 'add') {
      requireOwner(caller, 'add a printer');
      return this.#add(input);
    }
    if (input.action === 'rescan') {
      requireOwner(caller, 'search for printers');
      this.deps.discovery()?.rescan();
      return { rescanning: true };
    }
    const session = this.deps.registry.resolve(input.printer);
    if (isJobAction(input)) return this.#jobs(input, session, caller);
    if (isControlAction(input)) return this.#control(input, session, caller);
    return this.#owned(input, session, caller);
  }

  async #jobs(input: JobAction, session: PrinterSession, caller: ToolCaller): Promise<Reply> {
    const { actions } = this.deps;
    switch (input.action) {
      case 'print':
        return { ...(await actions.print(session, caller, input)), printer: refOf(session) };
      case 'test_page':
        return { ...(await actions.testPage(session, caller)), printer: refOf(session) };
      case 'cancel':
        await actions.cancel(session, caller, input.job);
        return { canceled: input.job };
      case 'cancel_all':
        await actions.cancelAll(session, caller);
        return { canceled: 'all' };
      case 'hold':
        await actions.hold(session, caller, input.job, false);
        return { held: input.job };
      case 'release':
        await actions.hold(session, caller, input.job, true);
        return { released: input.job };
    }
  }

  async #control(
    input: ControlAction,
    session: PrinterSession,
    caller: ToolCaller,
  ): Promise<Reply> {
    const { actions } = this.deps;
    switch (input.action) {
      case 'identify':
        await actions.identify(session, caller, input.how);
        return { identifying: session.name };
      case 'pause':
        await actions.pauseResume(session, caller, true);
        return { queue: 'paused' };
      case 'resume':
        await actions.pauseResume(session, caller, false);
        return { queue: 'running' };
      case 'open_page':
        return this.#openPage(session);
    }
  }

  #openPage(session: PrinterSession): Reply {
    const url = adminUrlOf(session.record, session.description.identity.moreInfo);
    if (url === null)
      throw new PrinterError('not_authorized', `${session.name} has no web page of its own.`);
    return { url };
  }

  async #owned(input: OwnedAction, session: PrinterSession, caller: ToolCaller): Promise<Reply> {
    if (input.action === 'configure') return this.#configure(input, session, caller);
    requireOwner(caller, `${input.action.replaceAll('_', ' ')} on a printer`);
    switch (input.action) {
      case 'trust_certificate':
        return this.#trust(session, input.fingerprint);
      case 'credentials':
        await this.#credentials(session, input.user, input.password);
        return { signedIn: true };
      case 'clear_history':
        session.ledger.clear();
        session.refresh();
        return { cleared: true };
      case 'forget':
        await this.#forget(session);
        return { forgotten: session.name };
    }
  }

  #configure(
    input: Extract<PrinterActionInput, { action: 'configure' }>,
    session: PrinterSession,
    caller: ToolCaller,
  ): Reply {
    if (input.settings !== undefined) {
      requireOwner(caller, 'change printer settings');
      session.update({ settings: mergeSettings(session.record.settings, input.settings) });
    }
    if (input.prefs !== undefined) {
      const current = prefsOf(session.record, caller.profileId);
      session.update({
        prefs: { ...session.record.prefs, [caller.profileId]: mergePrefs(current, input.prefs) },
      });
    }
    session.refresh();
    return { configured: true };
  }

  async #trust(session: PrinterSession, fingerprint: string): Promise<Reply> {
    const change = session.record.certificateChange;
    if (change === null)
      throw new PrinterError(
        'certificate_changed',
        `${session.name} has no new certificate waiting for approval.`,
      );
    if (change.presented.toUpperCase() !== fingerprint.toUpperCase()) {
      throw new PrinterError(
        'certificate_changed',
        'That is not the certificate the printer presents now.',
        { presented: change.presented },
      );
    }
    const before = session.record.pin;
    session.update({ pin: change.presented, certificateChange: null });
    session.reopenClient();
    const described = await session.client.describe();
    if (
      described.description.identity.uuid !== null &&
      described.description.identity.uuid !== session.record.uuid
    ) {
      session.update({ pin: before, certificateChange: change });
      session.reopenClient();
      throw new PrinterError(
        'certificate_changed',
        'The device behind this address is a different printer; add it separately.',
      );
    }
    session.refresh();
    return { trusted: true, previous: change.previous, presented: change.presented };
  }

  async #credentials(session: PrinterSession, user: string, password: string): Promise<void> {
    await this.deps.host.secrets.set(passwordSecretName(session.record.uuid), password);
    session.update({ user, needsAuth: false });
    session.reopenClient();
    session.refresh();
  }

  async #forget(session: PrinterSession): Promise<void> {
    const { uuid } = session.record;
    session.stop();
    this.deps.registry.remove(uuid);
    const records = this.deps.host.records;
    records(PRINTERS).remove(uuid);
    records(SNAPSHOTS).remove(uuid);
    for (const name of [
      daysCollection,
      eventsCollection,
      jobsCollection,
      marksCollection,
      spansCollection,
      supplyDaysCollection,
    ]) {
      for (const entry of records(name(uuid)).list()) records(name(uuid)).remove(entry.key);
    }
    await this.deps.host.secrets.remove(passwordSecretName(uuid));
    await this.deps.forgotten(uuid);
  }

  async #add(input: Extract<PrinterActionInput, { action: 'add' }>): Promise<Reply> {
    const credentials =
      input.user !== undefined && input.password !== undefined
        ? { user: input.user, password: input.password }
        : null;
    const result = await pair(
      { uri: input.uri, credentials, fingerprint: input.fingerprint ?? null },
      this.deps.pairing,
    );
    if (result.kind === 'trust') {
      return { status: 'confirm_certificate', ...result.certificate, uri: result.address.uri };
    }
    const existing = this.deps.registry.get(result.uuid);
    if (existing !== null) return { status: 'already_added', printer: refOf(existing) };
    const record = await this.#recordOf(input, result, credentials);
    const session = new PrinterSession(this.deps.host, record, result.described, true);
    this.deps.registry.add(session);
    this.deps.host.records(SNAPSHOTS).put(record.uuid, { raw: result.described.raw });
    this.deps.announce(session);
    session.start();
    return { status: 'added', printer: refOf(session) };
  }

  #adminUrlOf(uuid: string): string | null {
    const found = this.deps.discovery()?.candidates() ?? [];
    return found.find((candidate) => candidate.uuid === uuid)?.adminUrl ?? null;
  }

  async #recordOf(
    input: Extract<PrinterActionInput, { action: 'add' }>,
    result: Extract<Awaited<ReturnType<typeof pair>>, { kind: 'paired' }>,
    credentials: { user: string; password: string } | null,
  ): Promise<PrinterRecord> {
    const { identity } = result.described.description;
    const now = this.deps.clock.now();
    if (credentials !== null)
      await this.deps.host.secrets.set(passwordSecretName(result.uuid), credentials.password);
    return {
      uuid: result.uuid,
      uri: result.address.uri,
      name: identity.name ?? identity.makeAndModel ?? 'Printer',
      customName: input.name ?? null,
      room: input.room ?? null,
      pin: result.pin,
      adminUrl: this.#adminUrlOf(result.uuid),
      user: credentials?.user ?? null,
      slotKeys: [],
      disabledOps: [],
      firstDay: dayKeyOf(now, this.deps.clock.timeZone()),
      lastSeen: now.toISOString(),
      lastUpTime: result.described.description.status.upTime,
      epoch: 0,
      counters: null,
      configChange: result.described.description.status.configChangeTime,
      markerChange: result.described.description.status.markerChangeTime,
      subscription: null,
      watch: emptyWatch(),
      settings: defaultSettings(),
      prefs: {},
      needsAuth: false,
      certificateChange: null,
    };
  }
}

const READERS: Readonly<Record<PrinterReadInput['view'], Reader>> = {
  overview: (_service, _input, session, caller) => overviewView(session, caller),
  supplies: (service, input, session) =>
    suppliesView(session, input.period ?? 'month', service.clock.now()),
  trays: (_service, _input, session) => traysView(session),
  queue: (_service, _input, session, caller) => queueView(session, caller),
  jobs: (_service, input, session, caller) =>
    jobsView(session, caller, {
      state: input.state,
      from: input.from,
      to: input.to,
      person: input.person,
      limit: input.limit ?? JOB_LIMIT,
    }),
  stats: (service, input, session, caller) =>
    statsView(session, caller, input, service.clock.now()),
  options: (_service, _input, session, caller) => optionsView(session, caller),
  candidates: (service) => service.candidates(),
  settings: (service, _input, session, caller) => service.settings(session, caller),
};
