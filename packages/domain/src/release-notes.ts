import { z } from 'zod';

export const RELEASE_NOTES_MAX_LENGTH = 8_000;

export const RELEASE_NOTES = z.string().trim().min(1).max(RELEASE_NOTES_MAX_LENGTH);
