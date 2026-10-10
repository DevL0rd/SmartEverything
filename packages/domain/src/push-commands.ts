import { z } from 'zod';

export const PUSH_COMMANDS = ['phone_action', 'ai_ring', 'ai_ring_cancel'] as const;

export type PushCommand = (typeof PUSH_COMMANDS)[number];

export const PUSH_COMMAND = z.enum(PUSH_COMMANDS);

export const PUSH_COMMAND_KEY = 'command';

export const PUSH_PAYLOAD_KEY = 'payload';
