import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';

import SiderInboxEntry from '@/renderer/components/layout/Sider/SiderNav/SiderInboxEntry';
import ActionInboxPage from '@/renderer/pages/inbox';
import { WorktreeMergeCard } from '@/renderer/pages/inbox/components/cards/WorktreeMergeCard';
import { MultipleChoiceCard } from '@/renderer/pages/inbox/components/cards/MultipleChoiceCard';
import { MaxHopsCard } from '@/renderer/pages/inbox/components/cards/MaxHopsCard';
import { BudgetWarningCard } from '@/renderer/pages/inbox/components/cards/BudgetWarningCard';
import { useActionInbox } from '@/renderer/pages/inbox/hooks/useActionInbox';
import { useInboxPendingCount } from '@/renderer/hooks/inbox/useInboxPendingCount';
import { HoistedPreviewPanel } from '@/renderer/pages/shared-room/components/HoistedPreviewPanel';
import { GitDiffViewer } from '@/renderer/pages/shared-room/components/GitDiffViewer';
import { TwoLaneProfiler } from '@/renderer/pages/shared-room/components/TwoLaneProfiler';
import type { ActionInboxCardDto } from '@/common/types/inbox';

// Mock Arco Message
vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  };
});

// Mock i18n
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

// Mock Diff2Html
vi.mock('@renderer/components/media/Diff2Html', () => ({
  default: ({ diff, title }: { diff: string; title: string }) => (
    <div data-testid='mock-diff2html'>
      <div data-testid='diff-title'>{title}</div>
      <pre data-testid='diff-code'>{diff}</pre>
    </div>
  ),
}));

// Event handler registry for WebSocket sync simulation
let itemAddedListeners: Array<(event: any) => void> = [];
let itemResolvedListeners: Array<(event: any) => void> = [];

const mockInboxListInvoke = vi.fn();
const mockInboxResolveInvoke = vi.fn();
const mockWorktreesGetDiffInvoke = vi.fn();
const mockWorktreesMergeInvoke = vi.fn();
const mockWalletsSummaryInvoke = vi.fn();

vi.mock('@/common/adapter/ipcBridge', () => ({
  inbox: {
    list: {
      invoke: (...args: any[]) => mockInboxListInvoke(...args),
    },
    resolve: {
      invoke: (...args: any[]) => mockInboxResolveInvoke(...args),
    },
    itemAdded: {
      on: (cb: (event: any) => void) => {
        itemAddedListeners.push(cb);
        return () => {
          itemAddedListeners = itemAddedListeners.filter((h) => h !== cb);
        };
      },
    },
    itemResolved: {
      on: (cb: (event: any) => void) => {
        itemResolvedListeners.push(cb);
        return () => {
          itemResolvedListeners = itemResolvedListeners.filter((h) => h !== cb);
        };
      },
    },
  },
  worktrees: {
    getDiff: {
      invoke: (...args: any[]) => mockWorktreesGetDiffInvoke(...args),
    },
    merge: {
      invoke: (...args: any[]) => mockWorktreesMergeInvoke(...args),
    },
  },
  wallets: {
    summary: {
      invoke: (...args: any[]) => mockWalletsSummaryInvoke(...args),
    },
    spendUpdated: {
      on: vi.fn(() => () => {}),
    },
  },
}));

// Mock useSWR with key routing to simulate production reactivity
let currentInboxData: { items: ActionInboxCardDto[]; pending_count: number } = {
  items: [],
  pending_count: 0,
};
const mockInboxMutate = vi.fn((updater?: any) => {
  if (typeof updater === 'function') {
    currentInboxData = updater(currentInboxData);
  } else if (updater !== undefined) {
    currentInboxData = updater;
  }
  return Promise.resolve(currentInboxData);
});

const useSWRMock = vi.fn();
vi.mock('swr', () => ({
  default: (...args: unknown[]) => useSWRMock(...args),
}));

describe('Adversarial Stress Test: Milestone 4 Frontend Hybrid Command Hub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    itemAddedListeners = [];
    itemResolvedListeners = [];

    currentInboxData = {
      items: [],
      pending_count: 0,
    };

    useSWRMock.mockImplementation((key: string | null) => {
      if (key === '/api/inbox') {
        return {
          data: currentInboxData,
          isLoading: false,
          error: null,
          mutate: mockInboxMutate,
        };
      }
      if (key && typeof key === 'string' && key.startsWith('/api/worktrees/')) {
        return {
          data: {
            lease_id: 'wt-auth-fix-1',
            branch_name: 'wt/auth-fix',
            base_branch: 'main',
            files_changed: 6,
            additions: 142,
            deletions: 37,
            patch: 'diff --git sample',
          },
          isLoading: false,
          error: null,
          mutate: vi.fn(),
        };
      }
      if (key === '/api/wallets/summary') {
        return {
          data: {
            api_key_budget_limit_usd: 5.0,
            api_key_spent_usd: 1.45,
            cli_subscription_runs: 42,
            api_key_runs: 10,
            soft_warning: false,
            hard_blocked: false,
          },
          isLoading: false,
          error: null,
          mutate: vi.fn(),
        };
      }
      return { data: undefined, isLoading: false, error: null, mutate: vi.fn() };
    });

    mockInboxResolveInvoke.mockResolvedValue({
      success: true,
      resolved_at: Date.now(),
    });
    mockWorktreesMergeInvoke.mockResolvedValue({
      success: true,
      commit_hash: 'c0ffee1234',
    });
  });

  describe('Suite 1: Action Inbox Triage & Sider Badge Stress-Testing', () => {
    const makeCard = (
      id: string,
      category: string,
      status: 'pending' | 'resolved',
      resolvedBy?: 'desktop' | 'telegram',
      extraDetails?: Record<string, any>
    ): ActionInboxCardDto => ({
      id,
      category,
      title: `Title for ${id}`,
      summary: `Summary for ${id}`,
      details: extraDetails || {},
      status,
      target_type: 'worktree',
      target_id: 'wt-target-1',
      resolved_by: resolvedBy,
      resolved_at: status === 'resolved' ? Date.now() : undefined,
      created_at: Date.now() - 10000,
      updated_at: Date.now(),
    });

    it('empirically validates opacity 0.48, disabled actions, and resolved labels across ALL 4 card types', () => {
      // 1. WorktreeMergeCard
      const wtResolved = makeCard('wt-1', 'worktree_merge', 'resolved', 'desktop', {
        branch: 'wt/feature-x',
        additions: 10,
        deletions: 5,
      });
      const { unmount: unmount1 } = render(<WorktreeMergeCard card={wtResolved} onResolve={vi.fn()} />);
      const wtEl = screen.getByTestId('inbox-card-wt-1');
      expect(wtEl).toHaveStyle({ opacity: 0.48 });
      expect(screen.getByText('✓ Resolved')).toBeInTheDocument();
      expect(screen.getByText('✓ Approve & Merge').closest('button')).toBeDisabled();
      expect(screen.getByText('Reject / Discard').closest('button')).toBeDisabled();
      unmount1();

      // 2. MultipleChoiceCard
      const mcResolved = makeCard('mc-1', 'multiple_choice', 'resolved', 'telegram', {
        options: ['Choice 1', 'Choice 2'],
        recommended_index: 0,
      });
      const { unmount: unmount2 } = render(<MultipleChoiceCard card={mcResolved} onResolve={vi.fn()} />);
      const mcEl = screen.getByTestId('inbox-card-mc-1');
      expect(mcEl).toHaveStyle({ opacity: 0.48 });
      expect(screen.getByText('✓ Resolved via Telegram')).toBeInTheDocument();
      expect(screen.getByText('Confirm Choice').closest('button')).toBeDisabled();
      unmount2();

      // 3. MaxHopsCard
      const hopsResolved = makeCard('hops-1', 'max_hops', 'resolved', 'desktop', {
        current_hops: 20,
        max_hops: 20,
      });
      const { unmount: unmount3 } = render(<MaxHopsCard card={hopsResolved} onResolve={vi.fn()} />);
      const hopsEl = screen.getByTestId('inbox-card-hops-1');
      expect(hopsEl).toHaveStyle({ opacity: 0.48 });
      expect(screen.getByText('Stop Agent').closest('button')).toBeDisabled();
      expect(screen.getByText('+ Extend 5 Hops').closest('button')).toBeDisabled();
      unmount3();

      // 4. BudgetWarningCard
      const budgetResolved = makeCard('budget-1', 'budget_warning', 'resolved', 'desktop', {
        spent_usd: 5.5,
        budget_limit_usd: 5.0,
        percentage: 110,
      });
      const { unmount: unmount4 } = render(<BudgetWarningCard card={budgetResolved} onResolve={vi.fn()} />);
      const budgetEl = screen.getByTestId('inbox-card-budget-1');
      expect(budgetEl).toHaveStyle({ opacity: 0.48 });
      expect(screen.getByText('Acknowledge & Keep Cap').closest('button')).toBeDisabled();
      unmount4();
    });

    it('enforces anti-double-click guard during concurrent resolution requests on the same card in useActionInbox', async () => {
      mockInboxResolveInvoke.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { success: true, resolved_at: Date.now() };
      });

      currentInboxData = {
        items: [makeCard('card-x', 'worktree_merge', 'pending')],
        pending_count: 1,
      };

      const { result } = renderHook(() => useActionInbox());

      // Trigger 3 simultaneous resolveCard calls for the same card
      await Promise.all([
        result.current.resolveCard('card-x', 'approve'),
        result.current.resolveCard('card-x', 'approve'),
        result.current.resolveCard('card-x', 'approve'),
      ]);

      // Anti-double-click guard ensured exactly 1 backend call occurred during the concurrent burst
      expect(mockInboxResolveInvoke).toHaveBeenCalledTimes(1);

      // Once resolved and lock cleared, subsequent call can proceed
      await result.current.resolveCard('card-x', 'approve');
      expect(mockInboxResolveInvoke).toHaveBeenCalledTimes(2);
    });

    it('allows concurrent resolutions on different card IDs independently in useActionInbox', async () => {
      currentInboxData = {
        items: [
          makeCard('card-1', 'worktree_merge', 'pending'),
          makeCard('card-2', 'budget_warning', 'pending'),
        ],
        pending_count: 2,
      };

      const { result } = renderHook(() => useActionInbox());

      await act(async () => {
        await Promise.all([
          result.current.resolveCard('card-1', 'approve'),
          result.current.resolveCard('card-2', 'reject'),
        ]);
      });

      expect(mockInboxResolveInvoke).toHaveBeenCalledTimes(2);
      expect(mockInboxResolveInvoke).toHaveBeenCalledWith({ id: 'card-1', action: 'approve', payload: undefined });
      expect(mockInboxResolveInvoke).toHaveBeenCalledWith({ id: 'card-2', action: 'reject', payload: undefined });
    });

    it('recovers cleanly when backend resolve throws without locking future attempts', async () => {
      mockInboxResolveInvoke.mockRejectedValueOnce(new Error('Network timeout'));

      currentInboxData = {
        items: [makeCard('card-err', 'worktree_merge', 'pending')],
        pending_count: 1,
      };

      const { result } = renderHook(() => useActionInbox());

      // Attempt resolve which fails
      await act(async () => {
        await result.current.resolveCard('card-err', 'approve');
      });

      // Lock should have been cleared in finally block even on error
      mockInboxResolveInvoke.mockResolvedValueOnce({ success: true, resolved_at: Date.now() });
      await act(async () => {
        await result.current.resolveCard('card-err', 'approve');
      });

      expect(mockInboxResolveInvoke).toHaveBeenCalledTimes(2);
    });

    it('renders SiderInboxEntry badge boundary numbers correctly (0, 1, 99, 100+)', () => {
      // 0 count -> no badge rendered
      const { rerender } = render(
        <SiderInboxEntry
          isMobile={false}
          isActive={false}
          collapsed={false}
          count={0}
          siderTooltipProps={{}}
          onClick={vi.fn()}
        />
      );
      expect(screen.queryByTestId('inbox-pending-badge-expanded')).not.toBeInTheDocument();

      // 1 count -> badge shows 1
      rerender(
        <SiderInboxEntry
          isMobile={false}
          isActive={false}
          collapsed={false}
          count={1}
          siderTooltipProps={{}}
          onClick={vi.fn()}
        />
      );
      expect(screen.getByTestId('inbox-pending-badge-expanded')).toHaveTextContent('1');

      // 99 count -> badge shows 99
      rerender(
        <SiderInboxEntry
          isMobile={false}
          isActive={false}
          collapsed={false}
          count={99}
          siderTooltipProps={{}}
          onClick={vi.fn()}
        />
      );
      expect(screen.getByTestId('inbox-pending-badge-expanded')).toHaveTextContent('99');

      // 100 count -> badge shows 99+
      rerender(
        <SiderInboxEntry
          isMobile={false}
          isActive={false}
          collapsed={false}
          count={100}
          siderTooltipProps={{}}
          onClick={vi.fn()}
        />
      );
      expect(screen.getByTestId('inbox-pending-badge-expanded')).toHaveTextContent('99+');

      // Collapsed mode with 150 count -> collapsed badge shows 99+
      rerender(
        <SiderInboxEntry
          isMobile={false}
          isActive={false}
          collapsed={true}
          count={150}
          siderTooltipProps={{}}
          onClick={vi.fn()}
        />
      );
      expect(screen.getByTestId('inbox-pending-badge-collapsed')).toHaveTextContent('99+');
    });

    it('decrements live Sider badge count and marks cards resolved on WebSocket inbox:item_resolved', async () => {
      currentInboxData = {
        items: [
          makeCard('c-1', 'worktree_merge', 'pending'),
          makeCard('c-2', 'multiple_choice', 'pending'),
          makeCard('c-3', 'max_hops', 'pending'),
        ],
        pending_count: 3,
      };

      const { result: countResult } = renderHook(() => useInboxPendingCount());
      const { result: inboxResult } = renderHook(() => useActionInbox());

      expect(countResult.current).toBe(3);
      expect(inboxResult.current.pendingCount).toBe(3);

      // Simulate Telegram inline button press resolution event arriving via WebSocket
      act(() => {
        itemResolvedListeners.forEach((fn) =>
          fn({ id: 'c-1', resolved_by: 'telegram' })
        );
      });

      expect(mockInboxMutate).toHaveBeenCalled();
      expect(currentInboxData.pending_count).toBe(2);
      const card1 = currentInboxData.items.find((c) => c.id === 'c-1');
      expect(card1?.status).toBe('resolved');
      expect(card1?.resolved_by).toBe('telegram');

      // Second resolution event arrives from desktop
      act(() => {
        itemResolvedListeners.forEach((fn) =>
          fn({ id: 'c-2', resolved_by: 'desktop' })
        );
      });

      expect(currentInboxData.pending_count).toBe(1);
      const card2 = currentInboxData.items.find((c) => c.id === 'c-2');
      expect(card2?.status).toBe('resolved');
      expect(card2?.resolved_by).toBe('desktop');
    });

    it('segregates pending and resolved cards correctly when toggling filter tabs in ActionInboxPage', () => {
      currentInboxData = {
        items: [
          makeCard('p-1', 'worktree_merge', 'pending'),
          makeCard('p-2', 'budget_warning', 'pending'),
          makeCard('r-1', 'multiple_choice', 'resolved', 'desktop'),
        ],
        pending_count: 2,
      };

      render(<ActionInboxPage />);

      // Verify header and filter tab counters
      expect(screen.getByTestId('inbox-tab-pending')).toHaveTextContent(/Pending \(2\)/);
      expect(screen.getByTestId('inbox-tab-resolved')).toHaveTextContent(/Resolved \(1\)/);

      // In default Pending tab: p-1 and p-2 must be visible, r-1 must NOT be visible
      expect(screen.getByTestId('inbox-card-p-1')).toBeInTheDocument();
      expect(screen.getByTestId('inbox-card-p-2')).toBeInTheDocument();
      expect(screen.queryByTestId('inbox-card-r-1')).not.toBeInTheDocument();

      // Switch to Resolved tab
      fireEvent.click(screen.getByTestId('inbox-tab-resolved'));

      // In Resolved tab: r-1 must be visible with opacity 0.48, p-1 & p-2 must NOT be visible
      expect(screen.getByTestId('inbox-card-r-1')).toBeInTheDocument();
      expect(screen.getByTestId('inbox-card-r-1')).toHaveStyle({ opacity: 0.48 });
      expect(screen.queryByTestId('inbox-card-p-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('inbox-card-p-2')).not.toBeInTheDocument();

      // Switch back to Pending tab
      fireEvent.click(screen.getByTestId('inbox-tab-pending'));
      expect(screen.getByTestId('inbox-card-p-1')).toBeInTheDocument();
      expect(screen.queryByTestId('inbox-card-r-1')).not.toBeInTheDocument();
    });

    it('renders empty placeholder when no cards match the selected filter tab', () => {
      currentInboxData = {
        items: [makeCard('p-1', 'worktree_merge', 'pending')],
        pending_count: 1,
      };

      render(<ActionInboxPage />);
      expect(screen.getByTestId('inbox-card-p-1')).toBeInTheDocument();

      // Switch to Resolved tab (which has 0 items)
      fireEvent.click(screen.getByTestId('inbox-tab-resolved'));

      expect(screen.getByText('No resolved decisions yet')).toBeInTheDocument();
      expect(screen.queryByTestId('inbox-card-p-1')).not.toBeInTheDocument();
    });

    it('opens the 380px HoistedPreviewPanel on the right side when clicking an Action Inbox card', () => {
      currentInboxData = {
        items: [
          makeCard('p-wt-1', 'worktree_merge', 'pending', undefined, {
            lease_id: 'wt-auth-fix-1',
            room_name: 'auth-fix',
          }),
        ],
        pending_count: 1,
      };

      render(<ActionInboxPage />);
      expect(screen.queryByTestId('hoisted-preview-panel')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('inbox-card-p-wt-1'));
      const panel = screen.getByTestId('hoisted-preview-panel');
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveStyle({ width: '380px' });

      fireEvent.click(screen.getByLabelText('Close preview panel'));
      expect(screen.queryByTestId('hoisted-preview-panel')).not.toBeInTheDocument();
    });
  });

  describe('Suite 2: Hoisted 380px Preview & Profiler Stress-Testing', () => {
    it('verifies 380px width constraint, Goal Ancestry hierarchy, and clean toggle close', () => {
      const handleClose = vi.fn();
      const ancestry = ['Project Aion', 'Milestone 4', 'Command Hub', 'Hoisted Preview'];

      const { rerender } = render(
        <HoistedPreviewPanel
          open={true}
          onClose={handleClose}
          goalAncestry={ancestry}
        />
      );

      const panel = screen.getByTestId('hoisted-preview-panel');
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveStyle({ width: '380px', minWidth: '380px', maxWidth: '380px' });

      // Verify breadcrumbs and separator hierarchy
      expect(screen.getByText('Project Aion')).toBeInTheDocument();
      expect(screen.getByText('Milestone 4')).toBeInTheDocument();
      expect(screen.getByText('Command Hub')).toBeInTheDocument();
      expect(screen.getByText('Hoisted Preview')).toBeInTheDocument();

      // Close button
      const closeBtn = screen.getByLabelText('Close preview panel');
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);

      // When open=false, component renders nothing
      rerender(
        <HoistedPreviewPanel
          open={false}
          onClose={handleClose}
          goalAncestry={ancestry}
        />
      );
      expect(screen.queryByTestId('hoisted-preview-panel')).not.toBeInTheDocument();
    });

    it('switches between all 3 subtabs (Diff, Profiler, Xem thử) seamlessly without state corruption', () => {
      const sampleTask = {
        id: 'task-auth',
        room_id: 'room-1',
        from_team_id: null,
        to_team_id: 'team-fe',
        title: 'Auth Flow Verification',
        description: 'Verify JWT and token refresh flow',
        status: 'in_progress' as const,
        blocked_by: [],
        artifacts: [
          { staged_path: '/tmp/arch.png', file_name: 'arch.png', size_bytes: 2048, is_image: true },
          { staged_path: '/tmp/notes.txt', file_name: 'notes.txt', size_bytes: 512, is_image: false },
        ],
        created_at: 1000,
        updated_at: 2000,
      };

      render(
        <HoistedPreviewPanel
          open={true}
          onClose={vi.fn()}
          task={sampleTask}
        />
      );

      // Default subtab is Diff
      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument();
      expect(screen.queryByTestId('two-lane-profiler')).not.toBeInTheDocument();

      // Switch to Profiler subtab
      fireEvent.click(screen.getByTestId('subtab-profiler'));
      expect(screen.getByTestId('two-lane-profiler')).toBeInTheDocument();
      expect(screen.queryByTestId('git-diff-viewer')).not.toBeInTheDocument();

      // Switch to Xem thử (Artifacts) subtab
      fireEvent.click(screen.getByTestId('subtab-preview'));
      expect(screen.getByText('Auth Flow Verification')).toBeInTheDocument();
      expect(screen.getByText('Verify JWT and token refresh flow')).toBeInTheDocument();
      expect(screen.getByText('📄 arch.png')).toBeInTheDocument();
      expect(screen.getByText('📄 notes.txt')).toBeInTheDocument();
      expect(screen.queryByTestId('two-lane-profiler')).not.toBeInTheDocument();

      // Switch back to Diff subtab
      fireEvent.click(screen.getByTestId('subtab-diff'));
      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument();
    });

    it('renders diff stats, worktree isolation notice, and handles one-click squash merge with idempotency', async () => {
      const handleMergeSuccess = vi.fn();
      render(
        <GitDiffViewer
          worktreeLeaseId='wt-lease-99'
          branchName='wt/auth-fix'
          baseBranch='main'
          onMergeSuccess={handleMergeSuccess}
        />
      );

      // Verify diff stats and isolation text
      expect(screen.getAllByText(/wt\/auth-fix/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/main/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('+142')).toBeInTheDocument();
      expect(screen.getByText('-37')).toBeInTheDocument();
      expect(screen.getByText(/6 files changed/)).toBeInTheDocument();
      expect(
        screen.getByText(/Changes do not touch \.git\/index\.lock of the main workspace\./)
      ).toBeInTheDocument();

      const mergeBtn = screen.getByTestId('squash-merge-btn');
      expect(mergeBtn).not.toBeDisabled();

      // Click squash merge CTA
      fireEvent.click(mergeBtn);

      await waitFor(() => {
        expect(mockWorktreesMergeInvoke).toHaveBeenCalledWith({ id: 'wt-lease-99' });
        expect(handleMergeSuccess).toHaveBeenCalledTimes(1);
      });

      // Verify transition to merged state
      expect(screen.getByText('✓ Branch already merged into main')).toBeInTheDocument();
      expect(mergeBtn.closest('button')).toBeDisabled();

      // Idempotency: further clicks do not trigger merge invoke again
      fireEvent.click(mergeBtn);
      expect(mockWorktreesMergeInvoke).toHaveBeenCalledTimes(1);
    });

    it('renders 2-lane profiler tracks and dual wallet summary cards with accurate latency percentages and budget statuses', () => {
      // 1. Normal profiler with 26s model (54%) and 22.2s tool (46%)
      const { unmount } = render(
        <TwoLaneProfiler
          modelTimeSec={26.0}
          toolTimeSec={22.2}
          totalTimeSec={48.2}
          showWalletCards={true}
        />
      );

      expect(screen.getByTestId('profiler-model-lane')).toHaveStyle({ width: '54%' });
      expect(screen.getByTestId('profiler-tool-lane')).toHaveStyle({ width: '46%' });
      expect(screen.getByText('Total Turnaround: 48.2s')).toBeInTheDocument();

      // Dual Wallet cards
      expect(screen.getByTestId('wallet-cli-card')).toBeInTheDocument();
      expect(screen.getByText('$0.00')).toBeInTheDocument();
      expect(screen.getByText(/Claude Max \/ Codex CLI/)).toBeInTheDocument();
      expect(screen.getByTestId('wallet-api-card')).toBeInTheDocument();
      expect(screen.getByText('$1.45 / $5.00')).toBeInTheDocument();

      unmount();

      // 2. Boundary: Zero tool time (100% Model Lane)
      const { unmount: unmount2 } = render(
        <TwoLaneProfiler
          modelTimeSec={30.0}
          toolTimeSec={0.0}
          totalTimeSec={30.0}
          showWalletCards={false}
        />
      );
      expect(screen.getByTestId('profiler-model-lane')).toHaveStyle({ width: '100%' });
      expect(screen.getByTestId('profiler-tool-lane')).toHaveStyle({ width: '0%' });
      expect(screen.queryByTestId('wallet-cli-card')).not.toBeInTheDocument();
      unmount2();

      // 3. Boundary: Zero total time should safely fallback without NaN or dividing by zero
      const { unmount: unmount3 } = render(
        <TwoLaneProfiler
          modelTimeSec={0.0}
          toolTimeSec={0.0}
          totalTimeSec={0.0}
          showWalletCards={false}
        />
      );
      expect(screen.getByTestId('profiler-model-lane')).toHaveStyle({ width: '0%' });
      expect(screen.getByTestId('profiler-tool-lane')).toHaveStyle({ width: '100%' });
      unmount3();
    });
  });
});
