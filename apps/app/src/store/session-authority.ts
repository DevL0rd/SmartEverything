import type { Session } from './state';

export function sameSessionAuthority(current: Session | null, captured: Session | null): boolean {
  if (current === null || captured === null) return false;
  return (
    current.client.id === captured.client.id &&
    current.client.profile_id === captured.client.profile_id &&
    current.client.role === captured.client.role &&
    current.client.built_in === captured.client.built_in
  );
}
