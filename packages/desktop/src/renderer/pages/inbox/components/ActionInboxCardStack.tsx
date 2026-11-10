import React from 'react';
import { useTranslation } from 'react-i18next';
import { Empty } from '@arco-design/web-react';
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
