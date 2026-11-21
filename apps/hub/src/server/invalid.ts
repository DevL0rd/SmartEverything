import { ApiError } from '@smarteverything/domain';
import type { z } from 'zod';
import { issuesOf } from './issues';

export function invalid(what: string, error: z.ZodError): ApiError {
  return invalidDetail(what, issuesOf(error));
}

export function invalidDetail(what: string, detail: string): ApiError {
  return new ApiError('invalid_request', `The ${what} is not valid: ${detail}.`);
}
