import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SiderInboxEntry from '@/renderer/components/layout/Sider/SiderNav/SiderInboxEntry';
import { WorktreeMergeCard } from '@/renderer/pages/inbox/components/cards/WorktreeMergeCard';
import { MultipleChoiceCard } from '@/renderer/pages/inbox/components/cards/MultipleChoiceCard';
import { MaxHopsCard } from '@/renderer/pages/inbox/components/cards/MaxHopsCard';
import { BudgetWarningCard } from '@/renderer/pages/inbox/components/cards/BudgetWarningCard';
import type { ActionInboxCardDto } from '@/common/types/inbox';

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

describe('F22: Action Inbox Triage Interface & Sider Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SiderInboxEntry Navigation & Badge', () => {
    it('renders sider entry with badge count when expanded', () => {
      const handleClick = vi.fn();
      render(
        <SiderInboxEntry
          isMobile={false}
          isActive={false}
          collapsed={false}
          count={4}
          siderTooltipProps={{}}
          onClick={handleClick}
        />
      );

      const entry = screen.getByTestId('sider-inbox-entry');
      expect(entry).toBeInTheDocument();
      const badge = screen.getByTestId('inbox-pending-badge-expanded');
      expect(badge).toHaveTextContent('4');

      fireEvent.click(entry);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('renders sider entry with badge count when collapsed', () => {
      const handleClick = vi.fn();
      render(
        <SiderInboxEntry
          isMobile={false}
          isActive={true}
          collapsed={true}
          count={7}
          siderTooltipProps={{}}
          onClick={handleClick}
        />
      );

      const entry = screen.getByTestId('sider-inbox-entry-collapsed');
      expect(entry).toBeInTheDocument();
      const badge = screen.getByTestId('inbox-pending-badge-collapsed');
      expect(badge).toHaveTextContent('7');
    });

    it('hides badge when pending count is 0', () => {
      render(
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
    });
  });

  describe('WorktreeMergeCard Resolution & Visual State', () => {
    const mockCard: ActionInboxCardDto = {
      id: 'inbox_card_wt_1',
      category: 'worktree_merge',
      title: 'Merge wt/auth-fix into main',
      summary: 'Auth fixes ready for review',
      details: {
        branch: 'wt/auth-fix',
        base_branch: 'main',
        files_changed: 6,
        additions: 142,
        deletions: 37,
        checks_passed: true,
      },
      status: 'pending',
      target_type: 'worktree',
      target_id: 'wt-auth-fix-1',
      created_at: Date.now() - 60000,
      updated_at: Date.now(),
    };

    it('renders pending state with approve & reject buttons', () => {
      const handleResolve = vi.fn();
      render(<WorktreeMergeCard card={mockCard} onResolve={handleResolve} />);

      const cardEl = screen.getByTestId('inbox-card-inbox_card_wt_1');
      expect(cardEl).toBeInTheDocument();
      expect(cardEl).toHaveStyle({ opacity: 1 });
      expect(screen.getByText('wt/auth-fix')).toBeInTheDocument();
      expect(screen.getByText('+142')).toBeInTheDocument();
      expect(screen.getByText('-37')).toBeInTheDocument();

      const approveBtn = screen.getByText('Approve & Merge');
      expect(approveBtn).not.toBeDisabled();
      fireEvent.click(approveBtn);
      expect(handleResolve).toHaveBeenCalledWith('inbox_card_wt_1', 'approve');
    });

    it('transitions to resolved state with opacity 0.48 and disabled actions', () => {
      const resolvedCard: ActionInboxCardDto = {
        ...mockCard,
        status: 'resolved',
        resolved_by: 'desktop',
        resolved_at: Date.now(),
      };

      render(<WorktreeMergeCard card={resolvedCard} onResolve={vi.fn()} />);

      const cardEl = screen.getByTestId('inbox-card-inbox_card_wt_1');
      expect(cardEl).toHaveStyle({ opacity: 0.48 });
      expect(screen.getByText('✓ Resolved')).toBeInTheDocument();
      const approveBtn = screen.getByText('Approve & Merge').closest('button');
      expect(approveBtn).toBeDisabled();
    });

    it('displays resolved via Telegram label when resolved_by is telegram', () => {
      const tgResolvedCard: ActionInboxCardDto = {
        ...mockCard,
        status: 'resolved',
        resolved_by: 'telegram',
        resolved_at: Date.now(),
      };

      render(<WorktreeMergeCard card={tgResolvedCard} onResolve={vi.fn()} />);
      expect(screen.getByText('✓ Resolved via Telegram')).toBeInTheDocument();
    });
  });

  describe('MultipleChoiceCard Resolution', () => {
    const choiceCard: ActionInboxCardDto = {
      id: 'inbox_card_choice_1',
      category: 'multiple_choice',
      title: 'Database Migration Strategy',
      summary: 'Choose rollback strategy for schema migration',
      details: {
        options: ['Option A: Immediate Rollback', 'Option B: Shadow Table', 'Option C: Manual Patch'],
        recommended_index: 1,
      },
      status: 'pending',
      target_type: 'team',
      target_id: 'backend-team',
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    it('allows option selection and resolves with selected option payload', () => {
      const handleResolve = vi.fn();
      render(<MultipleChoiceCard card={choiceCard} onResolve={handleResolve} />);

      expect(screen.getByText('Option B: Shadow Table')).toBeInTheDocument();
      expect(screen.getByText('Recommended')).toBeInTheDocument();

      const confirmBtn = screen.getByText('Confirm Choice').closest('button');
      expect(confirmBtn).not.toBeDisabled();

      fireEvent.click(confirmBtn!);
      expect(handleResolve).toHaveBeenCalledWith('inbox_card_choice_1', 'choice', {
        selected_index: 1,
        selected_option: 'Option B: Shadow Table',
      });
    });
  });

  describe('MaxHopsCard Loop Guard', () => {
    const hopsCard: ActionInboxCardDto = {
      id: 'inbox_card_hops_1',
      category: 'max_hops',
      title: 'Loop Limit Reached in #auth-fix',
      summary: 'Leaders have exchanged 18 consecutive rounds',
      details: {
        current_hops: 18,
        max_hops: 20,
      },
      status: 'pending',
      target_type: 'room',
      target_id: 'auth-fix',
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    it('renders current/max hops and unlocks +5 hops on approve', () => {
      const handleResolve = vi.fn();
      render(<MaxHopsCard card={hopsCard} onResolve={handleResolve} />);

      expect(screen.getByText('18 / 20 hops')).toBeInTheDocument();
      expect(screen.getByText('Telegram Synced')).toBeInTheDocument();

      const unlockBtn = screen.getByText('+ Extend 5 Hops').closest('button');
      fireEvent.click(unlockBtn!);
      expect(handleResolve).toHaveBeenCalledWith('inbox_card_hops_1', 'approve', { grant_hops: 5 });
    });
  });

  describe('BudgetWarningCard Dual Wallet Alert', () => {
    const budgetCard: ActionInboxCardDto = {
      id: 'inbox_card_budget_1',
      category: 'budget_warning',
      title: '80% Budget Cap Warning',
      summary: 'API spend has reached 80% of limit',
      details: {
        spent_usd: 4.0,
        budget_limit_usd: 5.0,
        percentage: 80,
      },
      status: 'pending',
      target_type: 'wallet',
      target_id: 'wallet-api-1',
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    it('renders spend metrics and review button', () => {
      const handleResolve = vi.fn();
      render(<BudgetWarningCard card={budgetCard} onResolve={handleResolve} />);

      expect(screen.getByText('Spent: $4.00 / $5.00')).toBeInTheDocument();
      expect(screen.getByText('Remaining: $1.00')).toBeInTheDocument();

      const reviewBtn = screen.getByText('Acknowledge & Keep Cap').closest('button');
      fireEvent.click(reviewBtn!);
      expect(handleResolve).toHaveBeenCalledWith('inbox_card_budget_1', 'approve');
    });
  });
});
