import { z } from 'zod';
import {
  AI_HARNESS_CONFIGURATION_REPORT,
  AI_HARNESS_CONFIGURATION_STORED_REPORT,
  HARNESS_DESIRED_CONFIGURATION,
  harnessTargetKey,
  type AiHarnessConfigurationReport,
  type AiHarnessConfigurationStoredReport,
  type AiHarnessHost,
  type HarnessDesiredConfiguration,
  type HarnessDesiredEntry,
  type HarnessPluginReadiness,
} from '@smarteverything/domain';
import { found, type StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';

const CONFIGURATION_REVISION = z.strictObject({ revision: z.string().min(1) });
const CONFIGURATION_ROW = z.strictObject({
  configuration: SQL_JSON.pipe(HARNESS_DESIRED_CONFIGURATION),
});
const REPORT_ROW = z.strictObject({
  report: SQL_JSON.pipe(AI_HARNESS_CONFIGURATION_REPORT),
  received_at: z.iso.datetime({ offset: true }),
});
export type HarnessConfigurationReportAuthority = Pick<
  AiHarnessHost,
  'target' | 'runtime_instance' | 'connection_generation' | 'online'
>;

export class HarnessConfigurationStorageError extends Error {
  override readonly name = 'HarnessConfigurationStorageError';
  constructor(
    readonly revision: string,
    readonly code: 'host-mismatch' | 'invalid-report',
    readonly reason: string,
  ) {
    super(`Harness configuration ${revision}: ${reason}.`);
  }
}

export class HarnessConfigurationRepository {
  constructor(private readonly context: StoreContext) {}

  currentRevision(): string {
    return found(
      this.context.sql.get(
        CONFIGURATION_REVISION,
        'select revision from harness_configuration_current where singleton=1',
      ),
      'central harness configuration',
      'current',
    ).revision;
  }

  desired(): HarnessDesiredConfiguration {
    return found(
      this.context.sql.get(
        CONFIGURATION_ROW,
        'select configuration from harness_configuration_revisions join harness_configuration_current using(revision) where singleton=1',
      ),
      'central harness configuration',
      'current',
    ).configuration;
  }

  record(input: HarnessDesiredConfiguration): HarnessDesiredConfiguration {
    const desired = HARNESS_DESIRED_CONFIGURATION.parse(input);
    return this.context.write(() => {
      if (this.revision(desired.revision) === undefined)
        this.context.sql.run(
          'retain desired harness revision',
          'insert into harness_configuration_revisions(revision,configuration,created_at) values($revision,$configuration,$now)',
          { revision: desired.revision, configuration: jsonText(desired), now: this.context.now() },
        );
      this.context.sql.run(
        'point the central harness configuration at a revision',
        'update harness_configuration_current set revision=$revision where singleton=1',
        { revision: desired.revision },
      );
      return desired;
    });
  }

  report(
    input: unknown,
    authority: HarnessConfigurationReportAuthority,
  ): AiHarnessConfigurationStoredReport {
    const report = AI_HARNESS_CONFIGURATION_REPORT.parse(input);
    requireReportAuthority(report, authority);
    return this.context.write(() => {
      const desired = this.revision(report.revision);
      if (desired === undefined)
        throw new HarnessConfigurationStorageError(
          report.revision,
          'invalid-report',
          'reported revision is unknown',
        );
      if (
        report.pending_revision !== undefined &&
        this.revision(report.pending_revision) === undefined
      )
        throw new HarnessConfigurationStorageError(
          report.pending_revision,
          'invalid-report',
          'pending revision is unknown',
        );
      requireReportedEntries(desired, report);
      const received_at = this.context.now();
      this.context.sql.run(
        'retain authenticated host harness readiness',
        'insert into harness_configuration_reports(target_key,report,received_at) values($target,$report,$now) on conflict(target_key) do update set report=excluded.report,received_at=excluded.received_at',
        { target: harnessTargetKey(report.target), report: jsonText(report), now: received_at },
      );
      return AI_HARNESS_CONFIGURATION_STORED_REPORT.parse({ ...report, received_at });
    });
  }

  reports(): AiHarnessConfigurationStoredReport[] {
    return this.context.sql
      .all(
        REPORT_ROW,
        'select report,received_at from harness_configuration_reports order by target_key',
      )
      .map((row) =>
        AI_HARNESS_CONFIGURATION_STORED_REPORT.parse({
          ...row.report,
          received_at: row.received_at,
        }),
      );
  }

  readRevision(revision: string): HarnessDesiredConfiguration | undefined {
    return this.revision(revision);
  }

  private revision(revision: string): HarnessDesiredConfiguration | undefined {
    return this.context.sql.get(
      CONFIGURATION_ROW,
      'select configuration from harness_configuration_revisions where revision=$revision',
      { revision },
    )?.configuration;
  }
}

function requireReportAuthority(
  report: AiHarnessConfigurationReport,
  host: HarnessConfigurationReportAuthority,
): void {
  if (
    !host.online ||
    harnessTargetKey(host.target) !== harnessTargetKey(report.target) ||
    host.runtime_instance !== report.runtime_instance ||
    host.connection_generation !== report.connection_generation
  )
    throw new HarnessConfigurationStorageError(
      report.revision,
      'host-mismatch',
      'report must match the online authenticated host runtime and connection generation',
    );
}

function requireReportedEntries(
  desired: HarnessDesiredConfiguration,
  report: AiHarnessConfigurationReport,
): void {
  if (desired.entries.length !== report.readiness.length)
    throw new HarnessConfigurationStorageError(
      report.revision,
      'invalid-report',
      'report must cover every desired entry exactly once',
    );
  for (const entry of desired.entries) {
    const readiness = report.readiness.find((item) => item.id === entry.id);
    if (readiness?.package !== entry.package || readiness.requestedVersion !== entry.version)
      throw new HarnessConfigurationStorageError(
        report.revision,
        'invalid-report',
        `report identity differs from desired entry ${entry.id}`,
      );
    requireEntryReadiness(report.revision, entry, readiness);
  }
}

function requireEntryReadiness(
  revision: string,
  entry: HarnessDesiredEntry,
  readiness: HarnessPluginReadiness,
): void {
  const invalidDisabled = (readiness.state === 'disabled') !== !entry.enabled;
  const invalidReason =
    readiness.state === 'ready' || readiness.state === 'disabled'
      ? readiness.reason !== null
      : readiness.reason === null;
  const invalidReady = readiness.state === 'ready' && readiness.installedVersion !== entry.version;
  if (invalidDisabled || invalidReason || invalidReady)
    throw new HarnessConfigurationStorageError(
      revision,
      'invalid-report',
      `entry ${entry.id} readiness lacks matching verified installation identity or a truthful state reason`,
    );
}
