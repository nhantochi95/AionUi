import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tag } from '@arco-design/web-react';
import { Inbox } from '@icon-park/react';

export interface ActionInboxHeaderProps {
  pendingCount: number;
}

export const ActionInboxHeader: React.FC<ActionInboxHeaderProps> = ({ pendingCount }) => {
  const { t } = useTranslation();

  return (
    <div className='flex items-center justify-between pb-16px border-b border-solid border-arco-2 gap-16px flex-wrap'>
      <div className='flex items-center gap-12px'>
        <div className='size-36px rd-10px bg-[rgb(var(--primary-1))] text-[rgb(var(--primary-6))] flex items-center justify-center shrink-0'>
          <Inbox theme='outline' size='22' />
        </div>
        <div className='flex flex-col'>
          <div className='flex items-center gap-8px'>
            <h1 className='text-18px font-bold text-t-primary m-0 leading-tight'>
              {t('team.actionInbox.title', 'Action Inbox')}
            </h1>
            <span
              data-testid='inbox-header-badge'
              className='px-8px py-2px rd-full text-11px font-bold bg-[rgb(var(--primary-6))] text-white'
            >
              {pendingCount}
            </span>
          </div>
          <span className='text-12px text-t-secondary mt-2px'>
            {t(
              'team.actionInbox.subtitle',
              'Unified triage inbox for actions that need your decision or approval.'
            )}
          </span>
        </div>
      </div>

      <div className='flex items-center gap-8px'>
        <Tag color='green' size='small' className='font-mono'>
          🌿 Isolated Worktrees: Active
        </Tag>
        <Tag color='blue' size='small' className='font-mono'>
          ⚡ Telegram 2-Way Sync
        </Tag>
      </div>
    </div>
  );
};
