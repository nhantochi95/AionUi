import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HoistedPreviewPanel } from '@/renderer/pages/shared-room/components/HoistedPreviewPanel';
import { worktrees } from '@/common/adapter/ipcBridge';

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

vi.mock('@renderer/components/media/Diff2Html', () => ({
  default: ({ diff, title }: { diff: string; title: string }) => (
    <div data-testid='mock-diff2html'>
      <div data-testid='diff-title'>{title}</div>
      <pre data-testid='diff-code'>{diff}</pre>
    </div>
  ),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  worktrees: {
    getDiff: { invoke: vi.fn() },
    merge: { invoke: vi.fn() },
  },
  wallets: {
    summary: {
      invoke: vi.fn().mockResolvedValue({
        cli_subscription_runs: 42,
        api_key_spent_usd: 1.45,
        api_key_budget_limit_usd: 5.0,
      }),
    },
  },
}));

describe('F21: Hoisted 380px Preview & 2-Lane Profiler Panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 380px panel with Goal Ancestry breadcrumbs and 3 subtabs', () => {
    const handleClose = vi.fn();
    render(
      <HoistedPreviewPanel
        open={true}
        onClose={handleClose}
        roomName='auth-fix'
        goalAncestry={['Release v2.4', 'Auth Fix', 'Refresh Token']}
      />
    );

    const panel = screen.getByTestId('hoisted-preview-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveStyle({ width: '380px' });

    // Breadcrumbs
    const ancestryBox = screen.getByTestId('goal-ancestry-box');
    expect(ancestryBox).toBeInTheDocument();
    expect(screen.getByText('Release v2.4')).toBeInTheDocument();
    expect(screen.getByText('Auth Fix')).toBeInTheDocument();
    expect(screen.getByText('Refresh Token')).toBeInTheDocument();

    // Subtabs
    expect(screen.getByTestId('subtab-diff')).toBeInTheDocument();
    expect(screen.getByTestId('subtab-profiler')).toBeInTheDocument();
    expect(screen.getByTestId('subtab-preview')).toBeInTheDocument();
  });

  it('switches to Profiler subtab and renders 2-lane tracks & dual wallet cards', () => {
    render(
      <HoistedPreviewPanel
        open={true}
        onClose={vi.fn()}
        roomName='auth-fix'
      />
    );

    // Click Profiler subtab
    const profilerTab = screen.getByTestId('subtab-profiler');
    fireEvent.click(profilerTab);

    expect(screen.getByTestId('two-lane-profiler')).toBeInTheDocument();
    expect(screen.getByTestId('profiler-model-lane')).toBeInTheDocument();
    expect(screen.getByTestId('profiler-tool-lane')).toBeInTheDocument();

    // Dual wallet cards
    expect(screen.getByTestId('wallet-cli-card')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-api-card')).toBeInTheDocument();
    expect(screen.getByText(/Claude Max \/ Codex CLI/)).toBeInTheDocument();
  });

  it('renders diff viewer in Diff subtab and executes one-click squash merge CTA', async () => {
    const handleMergeSuccess = vi.fn();
    vi.mocked(worktrees.merge.invoke).mockResolvedValue({
      success: true,
      merged_commit: 'abc1234',
    } as any);

    render(
      <HoistedPreviewPanel
        open={true}
        onClose={vi.fn()}
        worktreeLeaseId='wt-auth-fix-1'
        roomName='auth-fix'
        onMergeSuccess={handleMergeSuccess}
      />
    );

    expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('mock-diff2html')).toBeInTheDocument();

    // Squash merge CTA
    const mergeBtn = screen.getByTestId('squash-merge-btn');
    expect(mergeBtn).toBeInTheDocument();

    fireEvent.click(mergeBtn);

    await waitFor(() => {
      expect(worktrees.merge.invoke).toHaveBeenCalledWith({ id: 'wt-auth-fix-1' });
      expect(handleMergeSuccess).toHaveBeenCalledTimes(1);
    });

    // Check button transitions to merged state
    expect(screen.getByText(/Branch already merged into main/)).toBeInTheDocument();
  });

  it('switches to Xem thử subtab and shows task artifacts preview', () => {
    const mockTask = {
      id: 'task-10',
      room_id: 'room-1',
      from_team_id: null,
      to_team_id: 'team-fe',
      title: 'Implement Refresh Token UI',
      description: 'Add token expiration banner and automatic silent refresh',
      status: 'in_progress' as const,
      blocked_by: [],
      artifacts: [{ staged_path: '/path/to/spec.md', file_name: 'spec.md', size_bytes: 1024, is_image: false }],
      created_at: 1000,
      updated_at: 2000,
    };

    render(
      <HoistedPreviewPanel
        open={true}
        onClose={vi.fn()}
        task={mockTask}
        selectedTaskId='task-10'
      />
    );

    fireEvent.click(screen.getByTestId('subtab-preview'));

    expect(screen.getByText('Implement Refresh Token UI')).toBeInTheDocument();
    expect(screen.getByText(/silent refresh/)).toBeInTheDocument();
    expect(screen.getByText('📄 spec.md')).toBeInTheDocument();
  });
});
