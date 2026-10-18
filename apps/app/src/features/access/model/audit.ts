import type { AccessAuditKind, AccessAuditRow } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { Tone } from '../../../components/tone';
import { relative } from '../../../format/time';
import { joinParts } from '../../../format/text';

interface AuditLook {
  readonly title: string;
  readonly icon: IconName;
  readonly tone: Tone;
}

const AUDIT_LOOK: Readonly<Record<AccessAuditKind, AuditLook>> = {
  refused_scope: { title: 'Refused: not allowed', icon: 'shield', tone: 'critical' },
  refused_condition: { title: 'Refused: outside the conditions', icon: 'clock', tone: 'warning' },
  refused_budget: { title: 'Refused: over the budget', icon: 'timer', tone: 'warning' },
  refused_expired: { title: 'Refused: access ended', icon: 'clock', tone: 'critical' },
  role_changed: { title: 'Role changed', icon: 'key', tone: 'primary' },
  scopes_changed: { title: 'Limits changed', icon: 'shield', tone: 'primary' },
  pairing_started: { title: 'Pairing started', icon: 'qr', tone: 'variant' },
  person_revoked: { title: 'Access revoked', icon: 'trash', tone: 'critical' },
};

export interface AuditView {
  readonly id: string;
  readonly look: AuditLook;
  readonly person: string | null;
  readonly device: string | null;
  readonly detail: string;
  readonly when: string;
}

export function auditViews(
  rows: readonly AccessAuditRow[],
  people: ReadonlyMap<string, string>,
  devices: ReadonlyMap<string, string>,
  now: number,
): readonly AuditView[] {
  return rows.map((row) => ({
    id: row.id,
    look: AUDIT_LOOK[row.kind],
    person: row.profile_id === null ? null : (people.get(row.profile_id) ?? null),
    device: row.client_id === null ? null : (devices.get(row.client_id) ?? null),
    detail: row.detail,
    when: relative(row.at, now),
  }));
}

export function auditSubtitle(view: AuditView): string {
  return joinParts([view.person, view.device, view.when]);
}
