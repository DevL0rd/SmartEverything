import { PLANNER_EDIT } from './planner-edits';
import { PLANNER_READ } from './planner-reads';
import { selectedTool } from './selected-tool';
import type { Tool } from './registry';

export const PLANNER_TOOLS: readonly Tool[] = [PLANNER_READ, PLANNER_EDIT].map(selectedTool);
