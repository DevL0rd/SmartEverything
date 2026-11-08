import { z } from 'zod';

export const TaskListSchema = z.object({
  id: z.string().min(1),
  etag: z.string().optional(),
  title: z.string(),
  updated: z.string().optional(),
});
export type TaskList = z.infer<typeof TaskListSchema>;

export const TaskListsPageSchema = z.object({
  items: z.array(TaskListSchema).default([]),
  nextPageToken: z.string().optional(),
});
export type TaskListsPage = z.infer<typeof TaskListsPageSchema>;

export const GoogleTaskSchema = z.object({
  id: z.string().min(1),
  etag: z.string().min(1),
  title: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['needsAction', 'completed']),
  due: z.string().optional(),
  completed: z.string().optional(),
  deleted: z.boolean().optional(),
  hidden: z.boolean().optional(),
  parent: z.string().optional(),
  position: z.string().optional(),
  updated: z.string().min(1),
});
export type GoogleTask = z.infer<typeof GoogleTaskSchema>;

export const TasksPageSchema = z.object({
  items: z.array(GoogleTaskSchema).default([]),
  nextPageToken: z.string().optional(),
});
export type TasksPage = z.infer<typeof TasksPageSchema>;
