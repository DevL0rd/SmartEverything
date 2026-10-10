import { z } from 'zod';
import manifest from '../package.json' with { type: 'json' };

export const HUB_VERSION = z.object({ version: z.string().min(1) }).parse(manifest).version;
