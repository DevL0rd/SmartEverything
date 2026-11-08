import type { Entry } from '../program/lookup';
import type { Finding, KindAvailability, LintKind, LintRule } from './lint-types';
import { finding } from './lint-types';
import { entriesOf } from './shapes';

interface Unavailable {
  readonly entry: Entry;
  readonly kind: LintKind;
  readonly availability: KindAvailability;
}

function retiredFinding({ entry, kind, availability }: Unavailable): Finding {
  const { replacedBy } = availability;
  const instead = replacedBy === undefined ? '' : ` Use ${replacedBy} instead.`;
  return finding(
    'plugin_kind_retired',
    { nodeId: entry.node.id, key: entry.node.key },
    `${entry.node.key} uses ${kind.name}, which ${availability.plugin} no longer provides.${instead}`,
    {
      received: kind.id,
      ...(replacedBy === undefined ? {} : { expected: replacedBy }),
      fix: {
        summary:
          replacedBy === undefined
            ? 'replace this step or remove it'
            : `replace this step with ${replacedBy}`,
      },
    },
  );
}

function offFinding({ entry, kind, availability }: Unavailable): Finding {
  return finding(
    'plugin_off',
    { nodeId: entry.node.id, key: entry.node.key },
    `${availability.plugin} is switched off, so ${entry.node.key} (${kind.name}) fails with Unreachable until it is switched on.`,
    {
      received: kind.id,
      fix: { summary: `switch ${availability.plugin} on, or handle the failure with If it fails` },
    },
  );
}

function unavailable(entry: Entry, lookup: (id: string) => LintKind | undefined): Unavailable[] {
  if (entry.node.enabled === false) return [];
  const kind = lookup(entry.node.kind);
  const availability = kind?.availability;
  if (kind === undefined || availability === undefined) return [];
  return [{ entry, kind, availability }];
}

export const pluginKindRule: LintRule = ({ index, ctx }) =>
  entriesOf(index)
    .flatMap((entry) => unavailable(entry, ctx.kinds))
    .flatMap((found): Finding[] => {
      if (found.availability.status === 'retired') return [retiredFinding(found)];
      return found.availability.status === 'off' ? [offFinding(found)] : [];
    });
