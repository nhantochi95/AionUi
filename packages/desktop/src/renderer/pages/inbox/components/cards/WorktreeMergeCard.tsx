import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tag } from '@arco-design/web-react';
import { CheckOne, CloseOne } from '@icon-park/react';
import { BaseInboxCard } from './BaseInboxCard';
import type { ActionInboxCardDto } from '@/common/types/inbox';

export interface WorktreeMergeCardProps {
  card: ActionInboxCardDto;
  onResolve: (id: string, action: string, payload?: unknown) => void;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const WorktreeMergeCard: React.FC<WorktreeMergeCardProps> = ({
  card,
  onResolve,
  isSelected,
  onSelect,
}) => {
  const { t } = useTranslation();
  const isResolved = card.status === 'resolved';

  const details = card.details || {};
  const branch = details.branch || details.branch_name || 'wt/feature';
  const baseBranch = details.base_branch || 'main';
  const filesChanged = details.files_changed ?? 1;
  const additions = details.additions ?? 18;
  const deletions = details.deletions ?? 6;
  const checksPassed = details.checks_passed ?? true;

  const actions = (
    <>
      <Button
        size='small'
        type='secondary'
        status='danger'
        disabled={isResolved}
        onClick={() => onResolve(card.id, 'reject')}
        icon={<CloseOne />}
      >
        {t('team.actionInbox.worktreeMerge.rejectBtn', 'Reject / Discard')}
      </Button>
      <Button
        size='small'
        type='primary'
        disabled={isResolved}
        onClick={() => onResolve(card.id, 'approve')}
        icon={<CheckOne />}
      >
        {t('team.actionInbox.worktreeMerge.approveBtn', 'Approve & Merge')}
      </Button>
    </>
  );

  return (
    <BaseInboxCard
      card={card}
      categoryLabel={t('team.actionInbox.worktreeMerge.title', 'Git Worktree Merge Review')}
      categoryColor='arcoblue'
      priority='P0'
      actions={actions}
      isSelected={isSelected}
      onSelect={onSelect}
    >
      <div className='flex flex-col gap-8px p-10px rd-8px bg-fill-2 text-12px'>
        {/* Branch Flow & Checks */}
        <div className='flex items-center justify-between gap-6px flex-wrap'>
          <div className='flex items-center gap-4px font-mono text-12px'>
            <Tag color='blue' size='small'>{branch}</Tag>
            <span className='text-t-tertiary'>→</span>
            <Tag color='gray' size='small'>{baseBranch}</Tag>
          </div>
          {checksPassed && (
            <Tag color='green' size='small' className='flex items-center gap-2px'>
              <CheckOne theme='outline' size='12' />
              <span>{t('team.actionInbox.checksPassed', 'Checks Passed')}</span>
            </Tag>
          )}
        </div>

        {/* Diff Stats */}
        <div className='flex items-center gap-8px text-11px text-t-secondary'>
          <span>
            {t('team.actionInbox.filesChanged', '{{count}} files changed', { count: filesChanged })}
          </span>
          <span className='text-green-600 font-bold'>+{additions}</span>
          <span className='text-red-500 font-bold'>-{deletions}</span>
        </div>
      </div>
    </BaseInboxCard>
  );
};
