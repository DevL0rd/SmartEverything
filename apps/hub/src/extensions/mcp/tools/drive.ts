import { DRIVE_EDIT } from './drive-edits';
import { DRIVE_READ } from './drive-reads';
import { selectedTool } from './selected-tool';
import type { Tool } from './registry';

export const DRIVE_TOOLS: readonly Tool[] = [DRIVE_READ, DRIVE_EDIT].map(selectedTool);
