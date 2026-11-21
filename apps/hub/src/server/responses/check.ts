import type { EndpointShape } from '@smarteverything/domain';
import { memberEngineProjection } from '../member-engine';

export type ResponseCheck =
  | { readonly valid: true; readonly value: unknown }
  | { readonly valid: false; readonly issueCodes: readonly string[] };

export function checkedResponse(
  endpoint: EndpointShape,
  value: unknown,
  member: boolean,
): ResponseCheck {
  const response = endpoint.response.safeParse(value);
  if (!response.success) {
    return {
      valid: false,
      issueCodes: [...new Set(response.error.issues.map(({ code }) => code))],
    };
  }
  return { valid: true, value: member ? memberEngineProjection(response.data) : response.data };
}
