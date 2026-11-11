import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Empty, Tag } from '@arco-design/web-react';
import { CheckOne, CloseOne, Exchange } from '@icon-park/react';
import { WorktreeMergeCard } from './cards/WorktreeMergeCard';
import { MultipleChoiceCard } from './cards/MultipleChoiceCard';
import { MaxHopsCard } from './cards/MaxHopsCard';
import { BudgetWarningCard } from './cards/BudgetWarningCard';
import { BaseInboxCard } from './cards/BaseInboxCard';
import type { ActionInboxCardDto } from '@/common/types/inbox';

export interface ActionInboxCardStackProps {
  items: ActionInboxCardDto[];
  onResolve: (id: string, action: string, payload?: unknown) => void;
  selectedCardId?: string;
  onSelectCard?: (id: string) => void;
  isResolvedTab?: boolean;
}

export const ActionInboxCardStack: React.FC<ActionInboxCardStackProps> = ({
  items,
  onResolve,
  selectedCardId,
  onSelectCard,
  isResolvedTab = false,
}) => {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <div className='flex items-center justify-center p-48px'>
        <Empty
          description={
            isResolvedTab
              ? t('team.actionInbox.emptyResolved', 'No resolved decisions yet')
              : t('team.actionInbox.emptyPending', 'No pending decisions')
          }
        />
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-12px'>
      {items.map((card) => {
        const isSelected = card.id === selectedCardId;
        const handleSelect = () => onSelectCard?.(card.id);
        const isResolved = card.status === 'resolved';

        switch (card.category) {
          case 'worktree_merge':
            return (
              <WorktreeMergeCard
                key={card.id}
                card={card}
                onResolve={onResolve}
                isSelected={isSelected}
                onSelect={handleSelect}
              />
            );
          case 'multiple_choice':
            return (
              <MultipleChoiceCard
                key={card.id}
                card={card}
                onResolve={onResolve}
                isSelected={isSelected}
                onSelect={handleSelect}
              />
            );
          case 'max_hops':
          case 'max_hops_unlock':
            return (
              <MaxHopsCard
                key={card.id}
                card={card}
                onResolve={onResolve}
                isSelected={isSelected}
                onSelect={handleSelect}
              />
            );
          case 'budget_warning':
            return (
              <BudgetWarningCard
                key={card.id}
                card={card}
                onResolve={onResolve}
                isSelected={isSelected}
                onSelect={handleSelect}
              />
            );
          case 'approve_done': {
            const details = card.details || {};
            const teamName = details.team_name || details.to_team_name || '';
            const taskTitle = details.task_title || details.title || card.title;
            return (
              <BaseInboxCard
                key={card.id}
                card={card}
                categoryLabel={t(
                  'team.actionInbox.approveDone.title',
                  'Task Approval (Human Only)'
                )}
                categoryColor='green'
                priority='P1'
                isSelected={isSelected}
                onSelect={handleSelect}
                actions={
                  <>
                    <Button
                      size='small'
                      type='secondary'
                      status='danger'
                      disabled={isResolved}
                      onClick={() => onResolve(card.id, 'reject')}
                      icon={<CloseOne />}
                    >
                      {t('team.actionInbox.approveDone.rejectBtn', 'Request Changes')}
                    </Button>
                    <Button
                      size='small'
                      type='primary'
                      status='success'
                      data-testid={`inbox-approve-done-${card.id}`}
                      disabled={isResolved}
                      onClick={() => onResolve(card.id, 'approve')}
                      icon={<CheckOne />}
                    >
                      {t('team.actionInbox.approveDone.approveBtn', 'Approve Done')}
                    </Button>
                  </>
                }
              >
                <div className='flex flex-col gap-6px p-10px rd-8px bg-fill-2 text-12px'>
                  <div className='flex items-center justify-between gap-6px flex-wrap'>
                    <span className='font-600 text-t-primary'>{taskTitle}</span>
                    {teamName && (
                      <Tag color='arcoblue' size='small'>
                        @{teamName}
                      </Tag>
                    )}
                  </div>
                  {details.result_summary && (
                    <div className='text-11px text-t-secondary leading-normal'>
                      {details.result_summary}
                    </div>
                  )}
                </div>
              </BaseInboxCard>
            );
          }
          case 'quota_fallback': {
            const details = card.details || {};
            const failedModel = details.failed_model || details.previous_model || 'API Model';
            const fallbackModel = details.fallback_model || '$0 CLI';
            return (
              <BaseInboxCard
                key={card.id}
                card={card}
                categoryLabel={t(
                  'team.actionInbox.quotaFallback.title',
                  'Quota Exhaustion Fallback'
                )}
                categoryColor='orange'
                priority='P0'
                isSelected={isSelected}
                onSelect={handleSelect}
                actions={
                  <>
                    <Button
                      size='small'
                      type='secondary'
                      disabled={isResolved}
                      onClick={() => onResolve(card.id, 'reject')}
                    >
                      {t('team.actionInbox.quotaFallback.keepPausedBtn', 'Keep Paused')}
                    </Button>
                    <Button
                      size='small'
                      type='primary'
                      data-testid={`inbox-quota-fallback-${card.id}`}
                      disabled={isResolved}
                      onClick={() =>
                        onResolve(card.id, 'approve', details.fallback_target)
                      }
                      icon={<Exchange />}
                    >
                      {t(
                        'team.actionInbox.quotaFallback.switchBtn',
                        'Switch to $0 CLI & Retry'
                      )}
                    </Button>
                  </>
                }
              >
                <div className='flex items-center justify-between gap-8px p-10px rd-8px bg-fill-2 text-12px flex-wrap'>
                  <span className='font-mono text-11px text-t-secondary'>
                    {failedModel} → <strong className='text-emerald-600'>{fallbackModel}</strong>
                  </span>
                  <Tag color='green' size='small'>
                    {t('team.modelHub.cliBadge', '$0 CLI')}
                  </Tag>
                </div>
              </BaseInboxCard>
            );
          }
          default:
            return (
              <BaseInboxCard
                key={card.id}
                card={card}
                isSelected={isSelected}
                onSelect={handleSelect}
              >
                <div className='text-12px text-t-secondary'>
                  {JSON.stringify(card.details)}
                </div>
              </BaseInboxCard>
            );
        }
      })}
    </div>
  );
};
