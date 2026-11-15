import { z } from 'zod';

export const PLANNER_PUBLIC_TOKEN = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'a 43 character link token');
