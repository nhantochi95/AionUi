import React from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';

export type InboxFilterTab = 'pending' | 'resolved';

export interface ActionInboxFilterTabsProps {
  activeTab: InboxFilterTab;
  onTabChange: (tab: InboxFilterTab) => void;
  pendingCount: number;
  resolvedCount: number;
}

export const ActionInboxFilterTabs: React.FC<ActionInboxFilterTabsProps> = ({
  activeTab,
  onTabChange,
  pendingCount,
  resolvedCount,
}) => {
  const { t } = useTranslation();

  return (
    <div className='inline-flex bg-fill-2 p-3px rd-10px border border-solid border-arco-2 gap-2px self-start'>
      <button
        type='button'
        data-testid='inbox-tab-pending'
        onClick={() => onTabChange('pending')}
        className={classNames(
          'px-14px py-5px rd-8px text-12px font-600 transition-all border-0 cursor-pointer flex items-center gap-6px',
          activeTab === 'pending'
            ? 'bg-bg-1 text-primary-6 shadow-sm'
            : 'bg-transparent text-t-secondary hover:text-t-primary'
        )}
      >
        <span>
          {t('team.actionInbox.tabPending', 'Pending ({{count}})', { count: pendingCount })}
        </span>
      </button>
      <button
        type='button'
        data-testid='inbox-tab-resolved'
        onClick={() => onTabChange('resolved')}
        className={classNames(
          'px-14px py-5px rd-8px text-12px font-600 transition-all border-0 cursor-pointer flex items-center gap-6px',
          activeTab === 'resolved'
            ? 'bg-bg-1 text-primary-6 shadow-sm'
            : 'bg-transparent text-t-secondary hover:text-t-primary'
        )}
      >
        <span>
          {t('team.actionInbox.tabResolved', 'Resolved')} ({resolvedCount})
        </span>
      </button>
    </div>
  );
};
