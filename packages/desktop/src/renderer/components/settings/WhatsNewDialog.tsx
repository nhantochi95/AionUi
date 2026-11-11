/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@renderer/components/base/AionModal';
import { openExternalUrl } from '@/renderer/utils/platform';
import { Button } from '@arco-design/web-react';
import { Cpu, Github, Lightning, Peoples, Wallet } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

declare const __APP_VERSION__: string;

export const OPEN_WHATS_NEW_DIALOG_EVENT = 'aionui:open-whats-new-dialog';
export const WHATS_NEW_SEEN_CHANGED_EVENT = 'aionui:whats-new-seen-changed';
export const WHATS_NEW_SEEN_VERSION_KEY = 'aionui.whatsNew.seenVersion';
export const WHATS_NEW_FORCE_AUTO_OPEN_KEY = 'aionui.whatsNew.forceAutoOpen';

const CUSTOM_CHANGELOG_URL = 'https://github.com/nhantochi95/AionUi/blob/feat/hybrid-command-hub/CHANGELOG.md';

const getSafeAppVersion = (): string => {
  return typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim() ? __APP_VERSION__.trim() : '2.3.0';
};

export const hasSeenCurrentWhatsNew = (): boolean => {
  try {
    return window.localStorage.getItem(WHATS_NEW_SEEN_VERSION_KEY) === getSafeAppVersion();
  } catch {
    return true;
  }
};

export const markCurrentWhatsNewSeen = (): void => {
  try {
    window.localStorage.setItem(WHATS_NEW_SEEN_VERSION_KEY, getSafeAppVersion());
    window.dispatchEvent(new CustomEvent(WHATS_NEW_SEEN_CHANGED_EVENT));
  } catch {
    // ignore storage errors
  }
};

export const openWhatsNewDialog = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_WHATS_NEW_DIALOG_EVENT));
};

const shouldSkipAutomatedWebdriverAutoOpen = (): boolean => {
  const isE2ETestWindow =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { __aionuiE2ETest?: boolean }).__aionuiE2ETest);
  const isWebdriver = typeof navigator !== 'undefined' && Boolean(navigator.webdriver);
  if (!isE2ETestWindow && !isWebdriver) {
    return false;
  }
  try {
    return window.localStorage.getItem(WHATS_NEW_FORCE_AUTO_OPEN_KEY) !== '1';
  } catch {
    return true;
  }
};

interface ReleaseSection {
  id: 'warmAcp' | 'teamToken' | 'hybridHub' | 'walletI18n';
  icon: React.ReactNode;
  accentClass: string;
}

const RELEASE_SECTIONS: ReleaseSection[] = [
  {
    id: 'warmAcp',
    icon: <Lightning theme='outline' size='16' fill='currentColor' />,
    accentClass: 'text-[rgb(var(--primary-6))] bg-[rgba(var(--primary-6),0.12)]',
  },
  {
    id: 'teamToken',
    icon: <Cpu theme='outline' size='16' fill='currentColor' />,
    accentClass: 'text-[rgb(var(--green-6))] bg-[rgba(var(--green-6),0.12)]',
  },
  {
    id: 'hybridHub',
    icon: <Peoples theme='outline' size='16' fill='currentColor' />,
    accentClass: 'text-[rgb(var(--arcoblue-6))] bg-[rgba(var(--arcoblue-6),0.12)]',
  },
  {
    id: 'walletI18n',
    icon: <Wallet theme='outline' size='16' fill='currentColor' />,
    accentClass: 'text-[rgb(var(--orange-6))] bg-[rgba(var(--orange-6),0.12)]',
  },
];

const WhatsNewDialog: React.FC = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const version = getSafeAppVersion();

  const handleClose = useCallback(() => {
    markCurrentWhatsNewSeen();
    setVisible(false);
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      markCurrentWhatsNewSeen();
      setVisible(true);
    };
    window.addEventListener(OPEN_WHATS_NEW_DIALOG_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_WHATS_NEW_DIALOG_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (shouldSkipAutomatedWebdriverAutoOpen()) return;
    if (hasSeenCurrentWhatsNew()) return;
    markCurrentWhatsNewSeen();
    setVisible(true);
  }, []);

  const handleOpenExternalChangelog = () => {
    void openExternalUrl(CUSTOM_CHANGELOG_URL).catch((error) => {
      console.error('Failed to open external changelog:', error);
    });
  };

  return (
    <AionModal
      variant='standard'
      visible={visible}
      onCancel={handleClose}
      maskClosable
      style={{ width: 660 }}
      contentStyle={{
        background: 'var(--dialog-fill-0, var(--bg-1, #ffffff))',
        maxHeight: '72vh',
      }}
      header={{
        title: (
          <div className='flex items-center gap-10px flex-wrap' data-testid='whats-new-dialog-header'>
            <span className='text-17px font-700 text-t-primary'>
              {t('update.whatsNew.title', {
                version,
                defaultValue: `What's New in AionUi v${version}`,
              })}
            </span>
            <span className='px-8px py-2px rd-999px text-11px font-600 text-[rgb(var(--primary-6))] bg-[rgba(var(--primary-6),0.12)]'>
              v{version}
            </span>
          </div>
        ),
        subtitle: t('update.whatsNew.subtitle', {
          defaultValue: 'Core Engine v0.3.0 · Released 2026-11-11',
        }),
        showClose: true,
      }}
      footer={{
        divider: true,
        render: () => (
          <div className='flex items-center justify-between gap-12px w-full'>
            <Button
              type='text'
              size='small'
              className='!px-8px text-t-secondary hover:text-t-primary inline-flex items-center gap-6px'
              onClick={handleOpenExternalChangelog}
            >
              <Github theme='outline' size='14' fill='currentColor' />
              <span>
                {t('update.whatsNew.viewFullChangelog', {
                  defaultValue: 'Full Changelog on GitHub',
                })}
              </span>
            </Button>
            <Button
              type='primary'
              data-testid='whats-new-got-it-btn'
              className='!rounded-8px !px-24px'
              onClick={handleClose}
            >
              {t('update.whatsNew.gotIt', { defaultValue: 'Got it' })}
            </Button>
          </div>
        ),
      }}
    >
      <div
        className='flex flex-col gap-12px py-4px bg-dialog-fill-0'
        style={{ backgroundColor: 'var(--dialog-fill-0, var(--bg-1, #ffffff))' }}
        data-testid='whats-new-dialog-body'
      >
        {RELEASE_SECTIONS.map((section) => {
          const baseKey = `update.whatsNew.sections.${section.id}`;
          const badge = t(`${baseKey}.badge`);
          const title = t(`${baseKey}.title`);
          const items = [t(`${baseKey}.item1`), t(`${baseKey}.item2`), t(`${baseKey}.item3`)];
          return (
            <div
              key={section.id}
              className='rd-10px p-14px bg-fill-1 border border-solid border-[var(--color-border-2)] flex flex-col gap-8px'
            >
              <div className='flex items-center justify-between gap-8px flex-wrap'>
                <div className='flex items-center gap-8px min-w-0'>
                  <span
                    className={`size-26px rd-7px flex items-center justify-center shrink-0 ${section.accentClass}`}
                  >
                    {section.icon}
                  </span>
                  <span className='text-14px font-600 text-t-primary leading-20px'>{title}</span>
                </div>
                <span
                  className={`px-8px py-2px rd-999px text-11px font-600 shrink-0 ${section.accentClass}`}
                >
                  {badge}
                </span>
              </div>
              <ul className='m-0 ps-34px pe-4px flex flex-col gap-4px list-disc text-12.5px leading-19px text-t-secondary'>
                {items.map((item, idx) => (
                  <li key={idx} className='text-t-secondary'>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </AionModal>
  );
};

export default WhatsNewDialog;
