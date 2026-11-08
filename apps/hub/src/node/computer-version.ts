import { z } from 'zod';

declare const SMARTEVERYTHING_COMPUTER_VERSION: string;

export const COMPUTER_VERSION = z.string().min(1).parse(SMARTEVERYTHING_COMPUTER_VERSION);
