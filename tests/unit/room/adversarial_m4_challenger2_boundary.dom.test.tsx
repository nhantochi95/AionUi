import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
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

let mockWalletData = {
  cli_subscription_runs: 45,
  api_key_spent_usd: 1.4,
  api_key_budget_limit_usd: 5.0,
};

vi.mock('@/common/adapter/ipcBridge', () => ({
  wallets: {
    summary: {
      invoke: vi.fn(() => Promise.resolve(mockWalletData)),
    },
  },
}));

function renderProfilerWithFreshSWR(ui: React.ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {ui}
    </SWRConfig>
  );
}

describe('Milestone 4 Empirical Challenge: Boundary Behaviors', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    capturedDndProps = {};
    mockWalletData = {
      cli_subscription_runs: 45,
      api_key_spent_usd: 1.4,
      api_key_budget_limit_usd: 5.0,
    };
  });

  describe('Suite 1: Boundary Behaviors of HybridKanbanBoard (Empty vs Large Tasks)', () => {
    it('handles empty tasks list gracefully with smart collapse and interactive empty placeholders', () => {
      render(<HybridKanbanBoard tasks={[]} roomId='empty-board-test' />);

      // Backlog and Done are collapsed to 52px by default
      const collapsedBacklog = screen.getByTestId('kanban-col-collapsed-backlog');
      const collapsedDone = screen.getByTestId('kanban-col-collapsed-done');
      expect(collapsedBacklog).toBeInTheDocument();
      expect(collapsedBacklog).toHaveStyle({ width: '52px' });
      expect(screen.getByTestId('kanban-collapsed-badge-backlog')).toHaveTextContent('0');

      expect(collapsedDone).toBeInTheDocument();
      expect(collapsedDone).toHaveStyle({ width: '52px' });
      expect(screen.getByTestId('kanban-collapsed-badge-done')).toHaveTextContent('0');

      // Todo, In Progress, In Review are expanded
      expect(screen.getByTestId('kanban-col-expanded-todo')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-col-expanded-in_progress')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-col-expanded-in_review')).toBeInTheDocument();

      // Header counts show 0
      expect(screen.getByTestId('kanban-count-todo')).toHaveTextContent('0');
      expect(screen.getByTestId('kanban-count-in_progress')).toHaveTextContent('0');
      expect(screen.getByTestId('kanban-count-in_review')).toHaveTextContent('0');

      // Empty hints render in expanded columns
      const emptyHints = screen.getAllByText('Empty — click header to collapse');
      expect(emptyHints.length).toBe(3);

      // Clicking empty placeholder collapses that column to 52px
      fireEvent.click(emptyHints[0]); // Todo column empty placeholder
      const collapsedTodo = screen.getByTestId('kanban-col-collapsed-todo');
      expect(collapsedTodo).toBeInTheDocument();
      expect(collapsedTodo).toHaveStyle({ width: '52px' });
      expect(screen.getByTestId('kanban-collapsed-badge-todo')).toHaveTextContent('0');

      // Re-expanding by clicking collapsed strip
      fireEvent.click(collapsedTodo);
      expect(screen.getByTestId('kanban-col-expanded-todo')).toBeInTheDocument();

      // Drag end with null target on empty board does not throw
      expect(capturedDndProps.onDragEnd).toBeDefined();
      expect(() => {
        act(() => {
          capturedDndProps.onDragEnd!({
            active: { id: 'non-existent' },
            over: null,
          });
        });
      }).not.toThrow();
    });

    it('handles large task list (500 tasks) with accurate distribution, active selection, and drag callback', () => {
      const largeTasks: ISharedRoomTask[] = [];
      const statuses = ['backlog', 'todo', 'in_progress', 'in_review', 'completed'] as const;

      for (let i = 0; i < 500; i++) {
        const colStatus = statuses[i % 5];
        largeTasks.push({
          id: `task-${i}`,
          room_id: 'large-room',
          from_team_id: null,
          to_team_id: 'team-fe',
          to_team_name: 'Frontend Team',
          title: `Task #${i} - Large Scale Stress Test`,
          description: `Description for stress testing task ${i}`,
          status: colStatus,
          blocked_by: i > 0 && i % 10 === 0 ? [`task-${i - 1}`] : [],
          artifacts: [],
          created_at: 1000 + i,
          updated_at: 2000 + i,
        });
      }

      const handleTaskStatusChange = vi.fn();
      const startTime = performance.now();

      render(
        <HybridKanbanBoard
          tasks={largeTasks}
          onTaskStatusChange={handleTaskStatusChange}
          selectedTaskId='task-498' // in_review column
          roomId='large-room-test'
        />
      );

      const renderDuration = performance.now() - startTime;
      // Rendering 500 tasks in virtual DOM should complete quickly (< 2000ms)
      expect(renderDuration).toBeLessThan(2000);

      // Collapsed columns: Backlog (100) and Done (100)
      expect(screen.getByTestId('kanban-collapsed-badge-backlog')).toHaveTextContent('100');
      expect(screen.getByTestId('kanban-collapsed-badge-done')).toHaveTextContent('100');

      // Expanded columns: Todo (100), In Progress (100), In Review (100)
      expect(screen.getByTestId('kanban-count-todo')).toHaveTextContent('100');
      expect(screen.getByTestId('kanban-count-in_progress')).toHaveTextContent('100');
      expect(screen.getByTestId('kanban-count-in_review')).toHaveTextContent('100');

      // Selected card styling
      const selectedCard = screen.getByTestId('kanban-card-task-498');
      expect(selectedCard).toBeInTheDocument();
      expect(selectedCard.className).toContain('ring-2');

      // Drag-and-drop moving task-498 to done
      act(() => {
        capturedDndProps.onDragEnd!({
          active: { id: 'task-498' },
          over: { id: 'done' },
        });
      });

      expect(handleTaskStatusChange).toHaveBeenCalledTimes(1);
      expect(handleTaskStatusChange).toHaveBeenCalledWith('task-498', 'done');
    });
  });

  describe('Suite 2: Boundary Behaviors of BudgetWarningCard (80% Soft vs 100% Hard Limit)', () => {
    const makeBudgetCard = (spent: number, limit: number, percentage?: number): ActionInboxCardDto => ({
      id: 'budget-card-test',
      category: 'budget_warning',
      title: 'Budget Alert',
      summary: 'API budget consumption threshold reached',
      details: {
        spent_usd: spent,
        budget_limit_usd: limit,
        ...(percentage !== undefined ? { percentage } : {}),
      },
      status: 'pending',
      target_type: 'worktree',
      target_id: 'wt-budget',
      created_at: 1000,
      updated_at: 2000,
    });

    it('maps 79% and 80% soft warnings to orange Tag, P1 priority, text-orange-500 icon, and warning progress status', () => {
      // 1. At 79% ($3.95 / $5.00)
      const { unmount: unmount79 } = render(
        <BudgetWarningCard card={makeBudgetCard(3.95, 5.0, 79)} onResolve={vi.fn()} />
      );
      expect(screen.getByText('P1')).toBeInTheDocument();
      expect(screen.getByText('Spent: $3.95 / $5.00')).toBeInTheDocument();
      expect(screen.getByText('Remaining: $1.05')).toBeInTheDocument();

      const progressContainer79 = document.querySelector('.arco-progress');
      expect(progressContainer79).toBeInTheDocument();
      expect(progressContainer79?.className).toContain('arco-progress-is-warning');
      expect(progressContainer79?.className).not.toContain('arco-progress-is-error');

      const icon79 = document.querySelector('.text-orange-500');
      expect(icon79).toBeInTheDocument();
      unmount79();

      // 2. At exactly 80% soft warning ($4.00 / $5.00)
      const { unmount: unmount80 } = render(
        <BudgetWarningCard card={makeBudgetCard(4.0, 5.0)} onResolve={vi.fn()} />
      );
      expect(screen.getByText('P1')).toBeInTheDocument();
      expect(screen.getByText('Spent: $4.00 / $5.00')).toBeInTheDocument();
      expect(screen.getByText('Remaining: $1.00')).toBeInTheDocument();

      const progressContainer80 = document.querySelector('.arco-progress');
      expect(progressContainer80?.className).toContain('arco-progress-is-warning');
      expect(progressContainer80?.className).not.toContain('arco-progress-is-error');
      unmount80();
    });

    it('maps 99% boundary to orange Tag, P1 priority, and warning progress status', () => {
      const { unmount } = render(
        <BudgetWarningCard card={makeBudgetCard(4.95, 5.0, 99)} onResolve={vi.fn()} />
      );
      expect(screen.getByText('P1')).toBeInTheDocument();
      expect(screen.getByText('Spent: $4.95 / $5.00')).toBeInTheDocument();
      expect(screen.getByText('Remaining: $0.05')).toBeInTheDocument();

      const progressContainer = document.querySelector('.arco-progress');
      expect(progressContainer?.className).toContain('arco-progress-is-warning');
      expect(progressContainer?.className).not.toContain('arco-progress-is-error');
      unmount();
    });

    it('maps 100% hard limit to red Tag, P0 priority, text-red-500 icon, and error progress status', () => {
      const { unmount } = render(
        <BudgetWarningCard card={makeBudgetCard(5.0, 5.0)} onResolve={vi.fn()} />
      );
      expect(screen.getByText('P0')).toBeInTheDocument();
      expect(screen.getByText('Spent: $5.00 / $5.00')).toBeInTheDocument();
      expect(screen.getByText('Remaining: $0.00')).toBeInTheDocument();

      const progressContainer = document.querySelector('.arco-progress');
      expect(progressContainer?.className).toContain('arco-progress-is-error');
      expect(progressContainer?.className).not.toContain('arco-progress-is-warning');

      const redIcon = document.querySelector('.text-red-500');
      expect(redIcon).toBeInTheDocument();
      unmount();
    });

    it('handles over-budget scenario (150%, $7.50 / $5.00) without negative remaining and keeps P0 / error status', () => {
      const { unmount } = render(
        <BudgetWarningCard card={makeBudgetCard(7.5, 5.0, 150)} onResolve={vi.fn()} />
      );
      expect(screen.getByText('P0')).toBeInTheDocument();
      expect(screen.getByText('Spent: $7.50 / $5.00')).toBeInTheDocument();
      // Remaining must be clamped to 0.00, not -$2.50
      expect(screen.getByText('Remaining: $0.00')).toBeInTheDocument();

      const progressContainer = document.querySelector('.arco-progress');
      expect(progressContainer?.className).toContain('arco-progress-is-error');
      unmount();
    });

    it('handles zero budget limit edge case ($0 / $0) without NaN or division by zero crash', () => {
      const { unmount } = render(
        <BudgetWarningCard card={makeBudgetCard(0.0, 0.0)} onResolve={vi.fn()} />
      );
      expect(screen.getByText('Spent: $0.00 / $0.00')).toBeInTheDocument();
      expect(screen.getByText('Remaining: $0.00')).toBeInTheDocument();
      expect(document.querySelector('.arco-progress')).toBeInTheDocument();
      unmount();
    });
  });

  describe('Suite 3: 2-Lane Profiler Progress Bar Rendering & Error Status', () => {
    it('renders normal progress status when API key budget is below 80%', async () => {
      mockWalletData = {
        cli_subscription_runs: 50,
        api_key_spent_usd: 1.5,
        api_key_budget_limit_usd: 5.0, // 30%
      };

      const { unmount } = renderProfilerWithFreshSWR(
        <TwoLaneProfiler modelTimeSec={20} toolTimeSec={20} totalTimeSec={40} showWalletCards={true} />
      );

      await waitFor(() => {
        expect(screen.getByText('$1.50 / $5.00')).toBeInTheDocument();
      });

      const walletCard = screen.getByTestId('wallet-api-card');
      const progress = walletCard.querySelector('.arco-progress');
      expect(progress).toBeInTheDocument();
      expect(progress?.className).not.toContain('arco-progress-is-error');
      expect(progress?.className).not.toContain('arco-progress-is-warning');
      unmount();
    });

    it('renders warning progress status when API key budget hits 80%', async () => {
      mockWalletData = {
        cli_subscription_runs: 50,
        api_key_spent_usd: 4.0,
        api_key_budget_limit_usd: 5.0, // 80%
      };

      const { unmount } = renderProfilerWithFreshSWR(
        <TwoLaneProfiler modelTimeSec={20} toolTimeSec={20} totalTimeSec={40} showWalletCards={true} />
      );

      await waitFor(() => {
        expect(screen.getByText('$4.00 / $5.00')).toBeInTheDocument();
      });

      const walletCard = screen.getByTestId('wallet-api-card');
      const progress = walletCard.querySelector('.arco-progress');
      expect(progress?.className).toContain('arco-progress-is-warning');
      expect(progress?.className).not.toContain('arco-progress-is-error');
      unmount();
    });

    it('renders error progress status when API key budget reaches 100% hard limit', async () => {
      mockWalletData = {
        cli_subscription_runs: 50,
        api_key_spent_usd: 5.0,
        api_key_budget_limit_usd: 5.0, // 100%
      };

      const { unmount } = renderProfilerWithFreshSWR(
        <TwoLaneProfiler modelTimeSec={20} toolTimeSec={20} totalTimeSec={40} showWalletCards={true} />
      );

      await waitFor(() => {
        expect(screen.getByText('$5.00 / $5.00')).toBeInTheDocument();
      });

      const walletCard = screen.getByTestId('wallet-api-card');
      const progress = walletCard.querySelector('.arco-progress');
      expect(progress?.className).toContain('arco-progress-is-error');
      expect(progress?.className).not.toContain('arco-progress-is-warning');
      unmount();
    });

    it('renders error progress status and caps percentage at 100% when spent exceeds limit', async () => {
      mockWalletData = {
        cli_subscription_runs: 50,
        api_key_spent_usd: 7.25,
        api_key_budget_limit_usd: 5.0, // 145%
      };

      const { unmount } = renderProfilerWithFreshSWR(
        <TwoLaneProfiler modelTimeSec={20} toolTimeSec={20} totalTimeSec={40} showWalletCards={true} />
      );

      await waitFor(() => {
        expect(screen.getByText('$7.25 / $5.00')).toBeInTheDocument();
      });

      const walletCard = screen.getByTestId('wallet-api-card');
      const progress = walletCard.querySelector('.arco-progress');
      expect(progress?.className).toContain('arco-progress-is-error');
      unmount();
    });

    it('handles zero total turnaround time boundary in 2-Lane timeline without NaN', () => {
      renderProfilerWithFreshSWR(
        <TwoLaneProfiler modelTimeSec={0} toolTimeSec={0} totalTimeSec={0} showWalletCards={false} />
      );

      const modelLane = screen.getByTestId('profiler-model-lane');
      const toolLane = screen.getByTestId('profiler-tool-lane');

      expect(modelLane).toHaveStyle({ width: '0%' });
      expect(toolLane).toHaveStyle({ width: '100%' });

      // Ensure no "NaN" text exists anywhere
      expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    });
  });
});
