/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  WHATS_NEW_SEEN_CHANGED_EVENT,
  hasSeenCurrentWhatsNew,
  openWhatsNewDialog,
} from '@/renderer/components/settings/WhatsNewDialog';

declare const __APP_VERSION__: string;

const WhatsNewCapsule: React.FC = () => {
  const { t } = useTranslation();
  const version = typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim() ? __APP_VERSION__.trim() : '2.3.1';
  const [unseen, setUnseen] = useState<boolean>(() => !hasSeenCurrentWhatsNew());

  useEffect(() => {
    const sync = () => setUnseen(!hasSeenCurrentWhatsNew());
    window.addEventListener(WHATS_NEW_SEEN_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(WHATS_NEW_SEEN_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const label = t('update.whatsNew.capsule', { version, defaultValue: `v${version}` });
  const tooltip = t('update.whatsNew.capsuleTooltip', {
    version,
    defaultValue: `What's new in v${version}`,
  });

  return (
    <button
      type='button'
      data-testid='titlebar-whats-new-capsule'
      className='app-titlebar__whats-new-capsule'
      onClick={openWhatsNewDialog}
      aria-label={tooltip}
      title={tooltip}
    >
      {unseen && <span className='app-titlebar__whats-new-capsule-dot' aria-hidden='true' />}
      <span>{label}</span>
    </button>
  );
};

export default WhatsNewCapsule;
