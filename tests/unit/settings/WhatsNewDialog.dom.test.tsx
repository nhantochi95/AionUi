/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts.defaultValue === 'string') {
        return opts.defaultValue;
      }
      return key;
    },
  }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

import WhatsNewDialog, {
  WHATS_NEW_FORCE_AUTO_OPEN_KEY,
  WHATS_NEW_SEEN_VERSION_KEY,
  openWhatsNewDialog,
} from '@/renderer/components/settings/WhatsNewDialog';
import WhatsNewCapsule from '@/renderer/components/layout/Titlebar/WhatsNewCapsule';

describe('WhatsNewDialog & WhatsNewCapsule', () => {
  beforeEach(() => {
    window.localStorage.clear();
    (globalThis as Record<string, unknown>).__APP_VERSION__ = '2.3.0';
  });

  it('auto-opens once on first launch when unseen and marks version seen on Got it', async () => {
    window.localStorage.setItem(WHATS_NEW_FORCE_AUTO_OPEN_KEY, '1');
    render(<WhatsNewDialog />);

    expect(await screen.findByTestId('whats-new-dialog-header')).toBeTruthy();
    expect(window.localStorage.getItem(WHATS_NEW_SEEN_VERSION_KEY)).toBe('2.3.0');

    fireEvent.click(screen.getByTestId('whats-new-got-it-btn'));
    expect(window.localStorage.getItem(WHATS_NEW_SEEN_VERSION_KEY)).toBe('2.3.0');
  });

  it('opens on demand when clicking Titlebar WhatsNewCapsule or calling openWhatsNewDialog', async () => {
    window.localStorage.setItem(WHATS_NEW_SEEN_VERSION_KEY, '2.3.0');
    render(
      <>
        <WhatsNewCapsule />
        <WhatsNewDialog />
      </>
    );

    expect(screen.queryByTestId('whats-new-dialog-header')).toBeNull();
    const capsule = screen.getByTestId('titlebar-whats-new-capsule');
    expect(capsule.textContent).toContain('v2.3.0');

    await act(async () => {
      fireEvent.click(capsule);
    });

    expect(await screen.findByTestId('whats-new-dialog-header')).toBeTruthy();

    // Also callable programmatically
    await act(async () => {
      openWhatsNewDialog();
    });
    expect(screen.getByTestId('whats-new-dialog-body')).toBeTruthy();
  });
});
