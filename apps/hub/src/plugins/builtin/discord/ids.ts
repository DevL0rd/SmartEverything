import { z } from 'zod';

export const SNOWFLAKE = z.string().regex(/^\d{17,20}$/);

export const SNOWFLAKE_PATTERN = '\\d{17,20}';

export const USER_MENTION = /<@!?(\d{17,20})>/g;
