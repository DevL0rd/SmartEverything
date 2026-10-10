import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RawRoute } from '../../../server/http-server';
import { BodyFormatError, replyJson, type Headers } from '../respond';

export class OAuthError extends Error {
  override readonly name = 'OAuthError';

  constructor(
    readonly status: number,
    readonly error: string,
    description: string,
    readonly headers: Headers = {},
  ) {
    super(description);
  }
}

export function invalidRequest(description: string): OAuthError {
  return new OAuthError(400, 'invalid_request', description);
}

type Handle = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

export function oauthEndpoint(malformed: string, handle: Handle): RawRoute['handle'] {
  return async (request, response) => {
    try {
      await handle(request, response);
    } catch (cause) {
      if (cause instanceof OAuthError) {
        replyJson(
          response,
          cause.status,
          { error: cause.error, error_description: cause.message },
          cause.headers,
        );
        return;
      }
      if (cause instanceof BodyFormatError || cause instanceof SyntaxError) {
        replyJson(response, 400, { error: malformed, error_description: cause.message });
        return;
      }
      throw cause;
    }
  };
}
