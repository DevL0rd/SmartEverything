import { createHash } from 'node:crypto';
import { deepFreeze } from '@deepseek-ai/dsh-util-values';
import { HARNESS_DESIRED_CONFIGURATION } from '@smarteverything/domain';
import type { HarnessDesiredConfiguration } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';

const MAX_REMEMBERED_REVISIONS = 10_000;

export class HarnessConfigurationRevisions {
  private readonly identities = new Map<string, string>();

  accept(input: HarnessDesiredConfiguration): HarnessDesiredConfiguration {
    const desired = deepFreeze(HARNESS_DESIRED_CONFIGURATION.parse(input));
    const fingerprint = createHash('sha256').update(JSON.stringify(desired)).digest('hex');
    const previous = this.identities.get(desired.revision);
    if (previous !== undefined && previous !== fingerprint)
      throw new HarnessRuntimeError(
        'operation_failed',
        `Configuration revision ${desired.revision} changed content.`,
      );
    if (previous === undefined && this.identities.size >= MAX_REMEMBERED_REVISIONS)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Configuration revision history limit reached; reopen the runtime.',
      );
    this.identities.set(desired.revision, fingerprint);
    return desired;
  }
}
