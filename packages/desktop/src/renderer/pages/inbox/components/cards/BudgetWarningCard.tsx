import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Progress } from '@arco-design/web-react';
import { Attention } from '@icon-park/react';
import { BaseInboxCard } from './BaseInboxCard';
import type { ActionInboxCardDto } from '@/common/types/inbox';

export interface BudgetWarningCardProps {
  card: ActionInboxCardDto;
  onResolve: (id: string, action: string, payload?: unknown) => void;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const BudgetWarningCard: React.FC<BudgetWarningCardProps> = ({
  card,
  onResolve,
  isSelected,
  onSelect,
}) => {
  const { t } = useTranslation();
  const isResolved = card.status === 'resolved';

  const details = card.details || {};
  const spent = details.spent_usd ?? 4.0;
  const limit = details.budget_limit_usd ?? 5.0;
  const percentage = details.percentage ?? Math.min(100, Math.round((spent / (limit || 1)) * 100));
  const remaining = Math.max(0, limit - spent);

  const actions = (
    <Button
      size='small'
      type='secondary'
      disabled={isResolved}
      onClick={() => onResolve(card.id, 'approve')}
    >
      {t('team.actionInbox.budgetWarning.reviewBtn', 'Acknowledge & Keep Cap')}
    </Button>
  );

  return (
    <BaseInboxCard
      card={card}
      categoryLabel={t('team.actionInbox.budgetWarning.title', 'Dual Wallet Budget Alert')}
      categoryColor={percentage >= 100 ? 'red' : 'orange'}
      priority={percentage >= 100 ? 'P0' : 'P1'}
      actions={actions}
      isSelected={isSelected}
      onSelect={onSelect}
    >
      <div className='flex flex-col gap-8px p-10px rd-8px bg-fill-2 text-12px'>
        <div className='flex items-center justify-between text-11px'>
          <span className='flex items-center gap-4px font-medium text-t-primary'>
            <Attention theme='filled' size='14' className={percentage >= 100 ? 'text-red-500' : 'text-orange-500'} />
            {t('team.actionInbox.budgetWarning.spentLabel', 'Spent: ${{spent}} / ${{limit}}', {
              spent: spent.toFixed(2),
              limit: limit.toFixed(2),
            })}
          </span>
          <span className='text-t-secondary font-mono'>
            {t('team.actionInbox.budgetWarning.remainingLabel', 'Remaining: ${{remaining}}', {
              remaining: remaining.toFixed(2),
            })}
          </span>
        </div>

        <Progress
          percent={percentage}
          status={percentage >= 100 ? 'error' : 'warning'}
          animation
        />
      </div>
    </BaseInboxCard>
  );
};
