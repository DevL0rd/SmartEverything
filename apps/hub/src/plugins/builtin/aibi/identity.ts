import { z } from 'zod';

const CLAIM = z
  .union([z.string(), z.number()])
  .transform((value) => String(value))
  .optional();

const CLAIMS = z.object({
  sub: z.union([z.string(), z.number()]).transform(String),
  ver: CLAIM,
  name: CLAIM,
});

export const ROBOT_IDENTITY = z.strictObject({
  deviceId: z.string().min(1).max(80),
  versionNum: z.string().max(40),
  currentName: z.string().max(80),
  userAgent: z.string().max(200),
});

export type RobotIdentity = z.output<typeof ROBOT_IDENTITY>;

const BEARER = /^Bearer\s+(.+)$/i;
const SEGMENT = 1;
const USER_AGENT_MAX = 200;

function claimsOf(token: string): z.output<typeof CLAIMS> | null {
  const segment = token.split('.')[SEGMENT] ?? '';
  try {
    const parsed = CLAIMS.safeParse(JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      return null;
    }
    throw cause;
  }
}

export function identityOf(headers: Readonly<Record<string, string>>): RobotIdentity | null {
  const token = BEARER.exec(headers['authorization'] ?? '')?.[1];
  const claims = token === undefined ? null : claimsOf(token);
  if (claims === null || claims.sub === '') {
    return null;
  }
  return {
    deviceId: claims.sub.slice(0, 80),
    versionNum: claims.ver ?? '',
    currentName: claims.name ?? '',
    userAgent: (headers['user-agent'] ?? '').slice(0, USER_AGENT_MAX),
  };
}
