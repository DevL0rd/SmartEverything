import type { Role } from '@smarteverything/domain';
import { ValueStore } from '../../design/external-store';

export interface Welcome {
  readonly role: Role | null;
}

export const welcome = new ValueStore<Welcome | null>(null);
