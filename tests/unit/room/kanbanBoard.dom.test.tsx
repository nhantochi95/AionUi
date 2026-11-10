import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HybridKanbanBoard } from '@/renderer/pages/shared-room/components/kanban/HybridKanbanBoard';
import type { ISharedRoomTask } from '@/common/types/sharedRoom';

let capturedDndProps: { onDragEnd?: (event: any) => void; onDragStart?: (event: any) => void } = {};

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: any) => {
      capturedDndProps.onDragEnd = props.onDragEnd;
      capturedDndProps.onDragStart = props.onDragStart;
      return <actual.DndContext {...props} />;
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string | Record<string, any>, params?: Record<string, any>) => {
      let str = typeof defaultValue === 'string' ? defaultValue : key;
      const values = typeof defaultValue === 'object' ? defaultValue : params;
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          str = str.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        }
      }
      return str;
    },
    i18n: { language: 'en-US' },
  }),
}));

const mockTasks: ISharedRoomTask[] = [
  {
    id: 'task-1',
    room_id: 'room-1',
    from_team_id: null,
    to_team_id: 'team-be',
    to_team_name: 'Backend Lead',
    title: 'Fix token refresh race condition',
    description: 'Ensure concurrent requests do not trigger multiple token refreshes',
    status: 'in_progress',
    blocked_by: [],
    artifacts: [],
    created_at: 1000,
    updated_at: 2000,
  },
  {
    id: 'task-2',
    room_id: 'room-1',
    from_team_id: 'team-be',
    from_team_name: 'Backend Lead',
    to_team_id: 'team-fe',
    to_team_name: 'Frontend Lead',
    title: 'Handle 401 interceptor retry',
    description: 'Retry original request with new token',
    status: 'in_review',
    blocked_by: ['task-1'],
    artifacts: [],
    created_at: 1000,
    updated_at: 2000,
  },
  {
    id: 'task-3',
    room_id: 'room-1',
    from_team_id: null,
    to_team_id: 'team-fe',
    to_team_name: 'Frontend Lead',
    title: 'Setup E2E Auth Mock',
    description: 'Prepare tests for token refresh flow',
    status: 'completed',
    blocked_by: [],
    artifacts: [],
    created_at: 1000,
    updated_at: 2000,
  },
];

describe('F18 & F19: 5-Column Kanban Board with 52px Collapsible Columns & Human Guard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    capturedDndProps = {};
  });

  it('renders all 5 columns with proper task distribution', () => {
    render(<HybridKanbanBoard tasks={mockTasks} />);

    expect(screen.getByTestId('kanban-col-collapsed-backlog')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-col-expanded-todo')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-col-expanded-in_progress')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-col-expanded-in_review')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-col-collapsed-done')).toBeInTheDocument();

    // Verify task-1 in in_progress
    expect(screen.getByTestId('kanban-card-task-1')).toBeInTheDocument();
    expect(screen.getByText('Fix token refresh race condition')).toBeInTheDocument();

    // Verify task-2 in in_review with blocker warning
    expect(screen.getByTestId('kanban-card-task-2')).toBeInTheDocument();
    expect(screen.getByText('Handle 401 interceptor retry')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for 1 prerequisite task/)).toBeInTheDocument();

    // Expand Done column to view completed cards
    fireEvent.click(screen.getByTestId('kanban-col-collapsed-done'));
    expect(screen.getByTestId('kanban-col-expanded-done')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-card-task-3')).toBeInTheDocument();
    expect(screen.getByText('Setup E2E Auth Mock')).toBeInTheDocument();
  });

  it('supports vertical column collapse to exact 52px with vertical text', () => {
    render(<HybridKanbanBoard tasks={mockTasks} />);

    // Backlog starts collapsed (52px strip) by smart default
    const collapsedBacklog = screen.getByTestId('kanban-col-collapsed-backlog');
    expect(collapsedBacklog).toBeInTheDocument();
    expect(collapsedBacklog).toHaveStyle({ width: '52px' });

    // Click collapsed strip to expand it
    fireEvent.click(collapsedBacklog);
    const expandedBacklog = screen.getByTestId('kanban-col-expanded-backlog');
    expect(expandedBacklog).toBeInTheDocument();

    // Now collapse Todo column by clicking its header
    const todoColumnHeader = screen.getByTestId('kanban-col-expanded-todo').querySelector('div');
    expect(todoColumnHeader).toBeInTheDocument();
    fireEvent.click(todoColumnHeader!);

    const collapsedTodo = screen.getByTestId('kanban-col-collapsed-todo');
    expect(collapsedTodo).toBeInTheDocument();
    expect(collapsedTodo).toHaveStyle({ width: '52px' });
  });

  it('triggers onSelectTask when clicking a task card', () => {
    const handleSelectTask = vi.fn();
    render(<HybridKanbanBoard tasks={mockTasks} onSelectTask={handleSelectTask} />);

    const card = screen.getByTestId('kanban-card-task-1');
    fireEvent.click(card);

    expect(handleSelectTask).toHaveBeenCalledTimes(1);
    expect(handleSelectTask).toHaveBeenCalledWith('task-1');
  });

  it('allows human user to move task status to done via drag-and-drop and verifies Human-Only Guard', () => {
    const handleTaskStatusChange = vi.fn();
    const { rerender } = render(
      <HybridKanbanBoard
        tasks={mockTasks}
        onTaskStatusChange={handleTaskStatusChange}
        selectedTaskId='task-1'
        roomId='room-drag-test'
      />
    );

    // Done column shows human-only shield in collapsed state
    const collapsedDone = screen.getByTestId('kanban-col-collapsed-done');
    expect(collapsedDone).toBeInTheDocument();
    expect(collapsedDone).toHaveTextContent('🛡️');

    // Click to expand Done column and verify Human Only badge renders
    fireEvent.click(collapsedDone);
    const expandedDone = screen.getByTestId('kanban-col-expanded-done');
    expect(expandedDone).toBeInTheDocument();
    expect(screen.getByText(/Human Only/i)).toBeInTheDocument();

    // Verify selectedTaskId applies active selection ring to the card
    const selectedCard = screen.getByTestId('kanban-card-task-1');
    expect(selectedCard.className).toContain('ring-2');

    // Simulate drag end: user drags task-2 (in_review) and drops onto done column
    expect(capturedDndProps.onDragEnd).toBeDefined();
    act(() => {
      capturedDndProps.onDragEnd!({
        active: { id: 'task-2' },
        over: { id: 'done' },
      });
    });

    // Verify that HybridKanbanBoard processed drag and invoked onTaskStatusChange
    expect(handleTaskStatusChange).toHaveBeenCalledTimes(1);
    expect(handleTaskStatusChange).toHaveBeenCalledWith('task-2', 'done');

    // Verify onStatusChange alias also supported when moving task status
    const handleStatusChangeAlias = vi.fn();
    rerender(
      <HybridKanbanBoard
        tasks={mockTasks}
        onStatusChange={handleStatusChangeAlias}
        selectedTaskId='task-2'
        roomId='room-alias-test'
      />
    );

    const task2Card = screen.getByTestId('kanban-card-task-2');
    expect(task2Card.className).toContain('ring-2');

    act(() => {
      capturedDndProps.onDragEnd!({
        active: { id: 'task-1' },
        over: { id: 'in_review' },
      });
    });

    expect(handleStatusChangeAlias).toHaveBeenCalledTimes(1);
    expect(handleStatusChangeAlias).toHaveBeenCalledWith('task-1', 'in_review');
  });
});
