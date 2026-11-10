/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import { Inbox } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

export interface SiderInboxEntryProps {
  isMobile: boolean;
  isActive: boolean;
  collapsed: boolean;
  count: number;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
}

const SiderInboxEntry: React.FC<SiderInboxEntryProps> = ({
  isMobile,
  isActive,
  collapsed,
  count,
  siderTooltipProps,
  onClick,
}) => {
  const { t } = useTranslation();

  const title = t('team.actionInbox.title', 'Action Inbox');
  const tooltipContent = count > 0 ? `${title} (${count})` : title;

  if (collapsed) {
    return (
      <Tooltip {...siderTooltipProps} content={tooltipContent} position='right'>
        <div
          data-testid='sider-inbox-entry-collapsed'
          className={classNames(
            'w-full h-34px flex items-center justify-center cursor-pointer transition-colors rd-8px text-t-primary relative',
            isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
          )}
          onClick={onClick}
        >
          <Inbox
            theme='outline'
            size='20'
            fill='currentColor'
            className='block leading-none shrink-0'
            style={{ lineHeight: 0 }}
          />
          {count > 0 && (
            <span
              data-testid='inbox-pending-badge-collapsed'
              className='absolute top-2px end-2px min-w-16px h-16px px-4px rounded-full text-10px font-bold flex items-center justify-center leading-none bg-[rgb(var(--primary-6))] text-white shadow-sm'
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip {...siderTooltipProps} content={tooltipContent} position='right' disabled={!collapsed}>
      <div
        data-testid='sider-inbox-entry'
        className={classNames(
          'box-border group h-34px w-full flex items-center justify-between ps-10px pe-8px rd-0.5rem cursor-pointer shrink-0 transition-all text-t-primary relative',
          isMobile && 'sider-action-btn-mobile',
          isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
        )}
        onClick={onClick}
      >
        <div className='flex items-center gap-8px min-w-0'>
          <span className='size-22px flex items-center justify-center shrink-0 text-t-primary'>
            <Inbox
              theme='outline'
              size='16'
              fill='currentColor'
              className='block leading-none'
              style={{ lineHeight: 0 }}
            />
          </span>
          <span className='collapsed-hidden text-t-primary text-14px font-[500] leading-24px truncate'>
            {title}
          </span>
        </div>
        {count > 0 && (
          <span
            data-testid='inbox-pending-badge-expanded'
            className='collapsed-hidden px-6px py-1px rounded-full text-11px font-bold flex items-center justify-center leading-none bg-[rgb(var(--primary-6))] text-white shrink-0'
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
    </Tooltip>
  );
};

export default SiderInboxEntry;
