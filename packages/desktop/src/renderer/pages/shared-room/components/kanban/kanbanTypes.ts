import type { ISharedRoomTask } from '@/common/types/sharedRoom';

export type KanbanColumnKey = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';

export interface KanbanColumnDef {
  key: KanbanColumnKey;
  titleKey: string;
  defaultTitle: string;
  isHumanOnly?: boolean;
}

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { key: 'backlog', titleKey: 'team.sharedRoom.kanban.backlog', defaultTitle: 'Backlog' },
  { key: 'todo', titleKey: 'team.sharedRoom.kanban.todo', defaultTitle: 'To Do' },
  { key: 'in_progress', titleKey: 'team.sharedRoom.kanban.inProgress', defaultTitle: 'In Progress' },
  { key: 'in_review', titleKey: 'team.sharedRoom.kanban.inReview', defaultTitle: 'In Review' },
  { key: 'done', titleKey: 'team.sharedRoom.kanban.done', defaultTitle: 'Done', isHumanOnly: true },
];

export function normalizeTaskStatus(status?: string): KanbanColumnKey {
  if (!status) return 'todo';
  const s = status.trim().toLowerCase();
  switch (s) {
    case 'backlog':
      return 'backlog';
    case 'todo':
    case 'pending':
      return 'todo';
    case 'in_progress':
    case 'executing':
      return 'in_progress';
    case 'in_review':
    case 'review':
      return 'in_review';
    case 'done':
    case 'completed':
      return 'done';
    default:
      return 'todo';
  }
}

export type KanbanTask = ISharedRoomTask & {
  branch?: string;
  priority?: 'P0' | 'P1' | 'P2';
  subtasks_done?: number;
  subtasks_total?: number;
};
