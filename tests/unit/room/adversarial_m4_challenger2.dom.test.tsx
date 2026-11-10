import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HybridKanbanBoard } from '@/renderer/pages/shared-room/components/kanban/HybridKanbanBoard';
import { BudgetWarningCard } from '@/renderer/pages/inbox/components/cards/BudgetWarningCard';
import { TwoLaneProfiler } from '@/renderer/pages/shared-room/components/TwoLaneProfiler';
import type { ISharedRoomTask } from '@/common/types/sharedRoom';
import type { ActionInboxCardDto } from '@/common/types/inbox';

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

describe('Empirical Adversarial Challenge 2: Deep Boundary & Stress Verification', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    capturedDndProps = {};
  });

  describe('HybridKanbanBoard Boundary Stress Tests', () => {
    it('handles empty task list gracefully with 0 counts and empty hints in all columns', () => {
      render(<HybridKanbanBoard tasks={[]} roomId='empty-room' />);

      // Columns exist
      expect(screen.getByTestId('kanban-col-collapsed-backlog')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-col-expanded-todo')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-col-expanded-in_progress')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-col-expanded-in_review')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-col-collapsed-done')).toBeInTheDocument();

      // Counts are 0
      expect(screen.getByTestId('kanban-collapsed-badge-backlog')).toHaveTextContent('0');
      expect(screen.getByTestId('kanban-count-todo')).toHaveTextContent('0');
      expect(screen.getByTestId('kanban-count-in_progress')).toHaveTextContent('0');
      expect(screen.getByTestId('kanban-count-in_review')).toHaveTextContent('0');
      expect(screen.getByTestId('kanban-collapsed-badge-done')).toHaveTextContent('0');

      // Expand backlog to check empty hint
      fireEvent.click(screen.getByTestId('kanban-col-collapsed-backlog'));
      expect(screen.getByTestId('kanban-col-expanded-backlog')).toHaveTextContent('Empty — click header to collapse');
    });

    it('handles 100 tasks under heavy load with unknown statuses safely fallbacking to todo', () => {
      const heavyTasks: ISharedRoomTask[] = Array.from({ length: 100 }, (_, i) => ({
        id: `stress-task-${i}`,
        room_id: 'heavy-room',
        from_team_id: null,
        to_team_id: 'team-stress',
        to_team_name: 'Stress Agent',
        title: `Stress Task #${i}`,
        description: `Description for stress task #${i}`,
        status: i % 5 === 0 ? 'backlog' : i % 5 === 1 ? 'unknown_custom_status' : i % 5 === 2 ? 'executing' : i % 5 === 3 ? 'review' : 'completed',
        blocked_by: i % 10 === 0 ? ['stress-task-0'] : [],
        artifacts: [],
        created_at: 1000 + i,
        updated_at: 2000 + i,
      }));

      render(<HybridKanbanBoard tasks={heavyTasks} roomId='heavy-room' />);

      // 20 backlog (collapsed)
      expect(screen.getByTestId('kanban-collapsed-badge-backlog')).toHaveTextContent('20');
      // 20 unknown_custom_status mapped to todo
      expect(screen.getByTestId('kanban-count-todo')).toHaveTextContent('20');
      // 20 executing mapped to in_progress
      expect(screen.getByTestId('kanban-count-in_progress')).toHaveTextContent('20');
      // 20 review mapped to in_review
      expect(screen.getByTestId('kanban-count-in_review')).toHaveTextContent('20');
      // 20 completed mapped to done (collapsed)
      expect(screen.getByTestId('kanban-collapsed-badge-done')).toHaveTextContent('20');
    });

    it('drag and drop idempotency: dropping on current column does NOT trigger callback', () => {
      const handleTaskStatusChange = vi.fn();
      const singleTask: ISharedRoomTask = {
        id: 'task-same-col',
        room_id: 'r1',
        from_team_id: null,
        to_team_id: 'team-fe',
        to_team_name: 'Frontend',
        title: 'Same Col Test',
        description: 'Test',
        status: 'todo',
        blocked_by: [],
        artifacts: [],
        created_at: 1000,
        updated_at: 2000,
      };

      render(
        <HybridKanbanBoard
          tasks={[singleTask]}
          onTaskStatusChange={handleTaskStatusChange}
          roomId='same-col-room'
        />
      );

      // Drop on 'todo' (same column)
      act(() => {
        capturedDndProps.onDragEnd!({
          active: { id: 'task-same-col' },
          over: { id: 'todo' },
        });
      });

      expect(handleTaskStatusChange).not.toHaveBeenCalled();
    });

    it('drag and drop onto another task card correctly routes to target card column', () => {
      const handleTaskStatusChange = vi.fn();
      const tasks: ISharedRoomTask[] = [
        {
          id: 'card-source',
          room_id: 'r1',
          from_team_id: null,
          to_team_id: 'team-fe',
          to_team_name: 'Frontend',
          title: 'Source Card',
          description: 'Source',
          status: 'todo',
          blocked_by: [],
          artifacts: [],
          created_at: 1000,
          updated_at: 2000,
        },
        {
          id: 'card-target',
          room_id: 'r1',
          from_team_id: null,
          to_team_id: 'team-fe',
          to_team_name: 'Frontend',
          title: 'Target Card',
          description: 'Target',
          status: 'in_progress',
          blocked_by: [],
          artifacts: [],
          created_at: 1000,
          updated_at: 2000,
        },
      ];

      render(
        <HybridKanbanBoard
          tasks={tasks}
          onTaskStatusChange={handleTaskStatusChange}
          roomId='target-card-room'
        />
      );

      // Drop card-source on card-target
      act(() => {
        capturedDndProps.onDragEnd!({
          active: { id: 'card-source' },
          over: { id: 'card-target' },
        });
      });

      expect(handleTaskStatusChange).toHaveBeenCalledTimes(1);
      expect(handleTaskStatusChange).toHaveBeenCalledWith('card-source', 'in_progress');
    });

    it('drag and drop with invalid/null over is a safe no-op', () => {
      const handleTaskStatusChange = vi.fn();
      const task: ISharedRoomTask = {
        id: 'card-noop',
        room_id: 'r1',
        from_team_id: null,
        to_team_id: 'team-fe',
        to_team_name: 'Frontend',
        title: 'Noop Card',
        description: 'Test',
        status: 'todo',
        blocked_by: [],
        artifacts: [],
        created_at: 1000,
        updated_at: 2000,
      };

      render(
        <HybridKanbanBoard
          tasks={[task]}
          onTaskStatusChange={handleTaskStatusChange}
          roomId='noop-room'
        />
      );

      // Over is null
      act(() => {
        capturedDndProps.onDragEnd!({
          active: { id: 'card-noop' },
          over: null,
        });
      });
      expect(handleTaskStatusChange).not.toHaveBeenCalled();

      // Over is non-existent ID
      act(() => {
        capturedDndProps.onDragEnd!({
          active: { id: 'card-noop' },
          over: { id: 'ghost-target' },
        });
      });
      expect(handleTaskStatusChange).not.toHaveBeenCalled();
    });

    it('all columns can be collapsed into 52px vertical strips and persisted', () => {
      render(<HybridKanbanBoard tasks={[]} roomId='persist-room' />);

      // Collapse todo, in_progress, in_review
      const todoHeader = screen.getByTestId('kanban-col-expanded-todo').querySelector('div');
      fireEvent.click(todoHeader!);

      const inProgHeader = screen.getByTestId('kanban-col-expanded-in_progress').querySelector('div');
      fireEvent.click(inProgHeader!);

      const inRevHeader = screen.getByTestId('kanban-col-expanded-in_review').querySelector('div');
      fireEvent.click(inRevHeader!);

      // All 5 columns are now collapsed
      const cols = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
      for (const col of cols) {
        const el = screen.getByTestId(`kanban-col-collapsed-${col}`);
        expect(el).toBeInTheDocument();
        expect(el).toHaveStyle({ width: '52px' });
      }

      // Check localStorage persistence
      const saved = JSON.parse(localStorage.getItem('aionui:kanban:collapsed:persist-room') || '{}');
      expect(saved).toEqual({
        backlog: true,
        todo: true,
        in_progress: true,
        in_review: true,
        done: true,
      });
    });
  });

  describe('BudgetWarningCard Boundary & Progress Status Verification', () => {
    it('sets warning status at 80% and error status at >= 100%', () => {
      const card80: ActionInboxCardDto = {
        id: 'inbox-budget-80',
        category: 'budget_warning',
        title: 'Soft budget warning',
        description: 'Spent 80% of budget',
        status: 'pending',
        created_at: 1000,
        updated_at: 1000,
        details: {
          spent_usd: 4.0,
          budget_limit_usd: 5.0,
          percentage: 80,
        },
      };

      const handleResolve = vi.fn();
      const { rerender } = render(
        <BudgetWarningCard card={card80} onResolve={handleResolve} />
      );

      // 80% warning
      expect(screen.getByText('P1')).toBeInTheDocument();
      expect(screen.getByText('Spent: $4.00 / $5.00')).toBeInTheDocument();
      expect(screen.getByText('Remaining: $1.00')).toBeInTheDocument();

      // Click action button
      const ackBtn = screen.getByRole('button', { name: 'Acknowledge & Keep Cap' });
      fireEvent.click(ackBtn);
      expect(handleResolve).toHaveBeenCalledWith('inbox-budget-80', 'approve');

      // Rerender with 100% hard cutoff
      const card100: ActionInboxCardDto = {
        ...card80,
        id: 'inbox-budget-100',
        details: {
          spent_usd: 5.0,
          budget_limit_usd: 5.0,
          percentage: 100,
        },
      };

      rerender(<BudgetWarningCard card={card100} onResolve={handleResolve} />);
      expect(screen.getByText('P0')).toBeInTheDocument();
      expect(screen.getByText('Spent: $5.00 / $5.00')).toBeInTheDocument();
      expect(screen.getByText('Remaining: $0.00')).toBeInTheDocument();
    });

    it('handles undefined card details with robust defaults', () => {
      const cardBare: ActionInboxCardDto = {
        id: 'inbox-budget-bare',
        category: 'budget_warning',
        title: 'Bare budget warning',
        description: 'No details',
        status: 'pending',
        created_at: 1000,
        updated_at: 1000,
      };

      const handleResolve = vi.fn();
      render(<BudgetWarningCard card={cardBare} onResolve={handleResolve} />);

      // Defaults: 4.0 spent, 5.0 limit, 80%
      expect(screen.getByText('Spent: $4.00 / $5.00')).toBeInTheDocument();
      expect(screen.getByText('Remaining: $1.00')).toBeInTheDocument();
    });

    it('disables acknowledge button when card status is resolved', () => {
      const cardResolved: ActionInboxCardDto = {
        id: 'inbox-budget-res',
        category: 'budget_warning',
        title: 'Resolved budget warning',
        description: 'Already resolved',
        status: 'resolved',
        created_at: 1000,
        updated_at: 2000,
      };

      render(<BudgetWarningCard card={cardResolved} onResolve={vi.fn()} />);
      const btn = screen.getByRole('button', { name: 'Acknowledge & Keep Cap' });
      expect(btn).toBeDisabled();
    });
  });

  describe('TwoLaneProfiler Boundary Verification', () => {
    it('handles 0 model time and 0 tool time without NaN or divide by zero', () => {
      render(
        <TwoLaneProfiler
          modelTimeSec={0}
          toolTimeSec={0}
          totalTimeSec={0}
          showWalletCards={true}
        />
      );

      expect(screen.getByTestId('two-lane-profiler')).toBeInTheDocument();
      expect(screen.getByText('Total Turnaround: 0.0s')).toBeInTheDocument();
      expect(screen.getByTestId('profiler-model-lane')).toHaveStyle({ width: '0%' });
      expect(screen.getByTestId('profiler-tool-lane')).toHaveStyle({ width: '100%' });
    });
  });
});
