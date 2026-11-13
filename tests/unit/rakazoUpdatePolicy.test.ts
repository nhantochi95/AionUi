/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const autoUpdaterMock = vi.hoisted(() => ({
  logger: null as unknown,
  autoDownload: true,
  autoInstallOnAppQuit: true,
  forceDevUpdateConfig: false,
  allowPrerelease: false,
  allowDowngrade: false,
  channel: undefined as string | undefined,
  currentVersion: { version: '2.3.0' },
  setFeedURL: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  checkForUpdatesAndNotify: vi.fn(),
}));

const appMock = vi.hoisted(() => ({
  isPackaged: true,
  getVersion: vi.fn(() => '2.3.0'),
  getPath: vi.fn(() => path.join(tmpdir(), 'rakazo-update-policy-test')),
  exit: vi.fn(),
}));

const logMock = vi.hoisted(() => ({
  transports: { file: { level: 'info' } },
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => {
      const handlerMap = new Map<string, Function>();
      return {
        provider: vi.fn((handler: Function) => {
          handlerMap.set('handler', handler);
          return vi.fn();
        }),
        invoke: vi.fn(),
        _getHandler: () => handlerMap.get('handler'),
      };
    }),
    buildEmitter: vi.fn(() => ({
      emit: vi.fn(),
      on: vi.fn(),
    })),
  },
}));

vi.mock('electron', () => ({
  app: appMock,
  autoUpdater: {
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: autoUpdaterMock,
}));

vi.mock('electron-log', () => ({
  default: logMock,
}));

vi.mock('@process/services/i18n', () => ({
  default: { t: (key: string) => key },
}));

vi.mock('@/process/services/i18n', () => ({
  default: { t: (key: string) => key },
  i18nReady: Promise.resolve(),
}));

describe('Rakazo fork update source policy & lockdown', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.RAKAZO_UPDATE_BASE_URL;
    delete process.env.RAKAZO_GITHUB_REPO;
    delete process.env.AIONUI_GITHUB_REPO;
    logMock.transports.file.level = 'info';
    autoUpdaterMock.autoDownload = true;
    autoUpdaterMock.autoInstallOnAppQuit = true;
    appMock.getVersion.mockReturnValue('2.3.0');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RAKAZO_UPDATE_BASE_URL;
    delete process.env.RAKAZO_GITHUB_REPO;
    delete process.env.AIONUI_GITHUB_REPO;
  });

  it('defaults to disabled across resolveUpdateSourcePolicy and blocks upstream env injection', async () => {
    const { resolveUpdateSourcePolicy } = await import('@process/services/updateFeed');

    expect(resolveUpdateSourcePolicy({ env: {} })).toEqual({
      enabled: false,
      autoUpdateEnabled: false,
      manualUpdateEnabled: false,
      cdnBaseUrl: null,
      cdnHost: null,
      githubRepo: null,
      allowUpstream: false,
    });

    // Even if someone passes upstream static.aionui.com or iOfficeAI/AionUi via env, policy rejects them
    expect(
      resolveUpdateSourcePolicy({
        env: {
          RAKAZO_UPDATE_BASE_URL: 'https://static.aionui.com/releases',
          RAKAZO_GITHUB_REPO: 'iOfficeAI/AionUi',
        },
      }).enabled
    ).toBe(false);

    // Rejects non-HTTPS feeds
    expect(
      resolveUpdateSourcePolicy({
        env: {
          RAKAZO_UPDATE_BASE_URL: 'http://updates.rakazo.example.com/releases',
        },
      }).enabled
    ).toBe(false);
  });

  it('locks down AutoUpdaterService by default with zero network calls and preserves log level', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { AutoUpdaterService } = await import('@process/services/autoUpdaterService');
    const service = new AutoUpdaterService();

    expect(logMock.transports.file.level).toBe('info');
    expect(autoUpdaterMock.setFeedURL).not.toHaveBeenCalled();
    expect(autoUpdaterMock.autoDownload).toBe(false);
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(false);

    const statuses: Array<{ status: string }> = [];
    service.initialize((s) => statuses.push(s));

    await expect(service.restoreDownloadedUpdateIfAvailable()).resolves.toEqual({
      success: true,
      data: { ready: false },
    });
    await expect(service.checkForUpdates()).resolves.toEqual({ success: true });
    await expect(service.checkForUpdatesAndNotify()).resolves.toBeUndefined();
    await expect(service.downloadUpdate()).resolves.toEqual({
      success: false,
      error: 'Auto-update feed is disabled',
    });

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
    expect(autoUpdaterMock.checkForUpdatesAndNotify).not.toHaveBeenCalled();
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(statuses.map((s) => s.status)).toEqual(['not-available', 'not-available']);
  });

  it('locks down ipcBridge.update.check (exact UpdateCheckResult wire contract) and rejects upstream downloads', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { initUpdateBridge } = await import('@process/bridge/updateBridge');
    const { ipcBridge } = await import('@/common');
    initUpdateBridge();

    const checkHandler = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)?.[0];
    const downloadHandler = vi.mocked(ipcBridge.update.download.provider).mock.calls.at(-1)?.[0];
    expect(checkHandler).toBeTypeOf('function');
    expect(downloadHandler).toBeTypeOf('function');

    const checkResult = await checkHandler!({ repo: 'iOfficeAI/AionUi', includePrerelease: true });
    expect(checkResult).toEqual({
      success: true,
      data: {
        currentVersion: '2.3.0',
        updateAvailable: false,
      },
    });
    expect('hasUpdate' in (checkResult.data ?? {})).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    for (const blockedUrl of [
      'https://static.aionui.com/releases/2.3.1/AionUi-2.3.1-win-x64.exe',
      'https://github.com/iOfficeAI/AionUi/releases/download/v2.3.1/AionUi-2.3.1-win-x64.exe',
      'https://api.github.com/repos/iOfficeAI/AionUi/releases/assets/999',
    ]) {
      const dlResult = await downloadHandler!({
        url: blockedUrl,
        file_name: 'AionUi-2.3.1-win-x64.exe',
      });
      expect(dlResult.success).toBe(false);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('supports explicit RAKAZO_UPDATE_BASE_URL and RAKAZO_GITHUB_REPO opt-in while still blocking upstream URLs', async () => {
    process.env.RAKAZO_UPDATE_BASE_URL = 'https://updates.rakazo.dev/releases/';
    process.env.RAKAZO_GITHUB_REPO = 'nhantochi95/Rakazo';

    const cdnManifest = [
      'version: 2.4.0',
      'files:',
      '  - url: Rakazo-2.4.0-win-x64.exe',
      '    size: 1024',
      "releaseDate: '2026-11-12T18:00:00.000Z'",
      '',
    ].join('\n');

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://updates.rakazo.dev/releases/latest')) {
        return new Response(cdnManifest, { status: 200 });
      }
      if (url === 'https://api.github.com/repos/nhantochi95/Rakazo/releases') {
        return new Response(
          JSON.stringify([
            {
              tag_name: 'v2.4.0',
              name: 'Rakazo v2.4.0',
              body: 'Fork security update',
              html_url: 'https://github.com/nhantochi95/Rakazo/releases/tag/v2.4.0',
              prerelease: false,
              draft: false,
              assets: [],
            },
          ]),
          { status: 200 }
        );
      }
      if (url.startsWith('https://updates.rakazo.dev/releases/2.4.0/')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '3' },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    fs.mkdirSync(path.join(tmpdir(), 'rakazo-update-policy-test'), { recursive: true });

    const { AutoUpdaterService } = await import('@process/services/autoUpdaterService');
    const { initUpdateBridge } = await import('@process/bridge/updateBridge');
    const { ipcBridge } = await import('@/common');

    const service = new AutoUpdaterService();
    expect(service.updatePolicy).toMatchObject({
      enabled: true,
      autoUpdateEnabled: true,
      manualUpdateEnabled: true,
      cdnBaseUrl: 'https://updates.rakazo.dev/releases',
      cdnHost: 'updates.rakazo.dev',
      githubRepo: 'nhantochi95/Rakazo',
      allowUpstream: false,
    });
    expect(logMock.transports.file.level).toBe('info');
    expect(autoUpdaterMock.setFeedURL).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'custom',
        url: 'https://updates.rakazo.dev/releases',
      })
    );

    initUpdateBridge();
    const checkHandler = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)?.[0]!;
    const downloadHandler = vi.mocked(ipcBridge.update.download.provider).mock.calls.at(-1)?.[0]!;

    const checkRes = await checkHandler({});
    expect(checkRes.success).toBe(true);
    expect(checkRes.data?.updateAvailable).toBe(true);
    expect(checkRes.data?.latest?.version).toBe('2.4.0');
    expect(checkRes.data?.latest?.body).toBe('Fork security update');
    expect(checkRes.data?.latest?.assets[0]).toMatchObject({
      url: 'https://updates.rakazo.dev/releases/2.4.0/Rakazo-2.4.0-win-x64.exe',
      fallbackUrl: 'https://github.com/nhantochi95/Rakazo/releases/download/v2.4.0/Rakazo-2.4.0-win-x64.exe',
    });

    // Upstream iOfficeAI / static.aionui.com must STILL be rejected even when custom Rakazo feed is enabled!
    const upstreamAttempt = await downloadHandler({
      url: 'https://github.com/iOfficeAI/AionUi/releases/download/v2.4.0/AionUi-2.4.0-win-x64.exe',
      file_name: 'AionUi-2.4.0-win-x64.exe',
    });
    expect(upstreamAttempt.success).toBe(false);

    // Custom Rakazo feed asset succeeds
    const validAttempt = await downloadHandler({
      downloadId: 'rakazo-dl-1',
      url: 'https://updates.rakazo.dev/releases/2.4.0/Rakazo-2.4.0-win-x64.exe',
      file_name: 'Rakazo-2.4.0-win-x64.exe',
    });
    expect(validAttempt.success).toBe(true);
  });

  it('supports GitHub-only manual check when RAKAZO_GITHUB_REPO is set without RAKAZO_UPDATE_BASE_URL', async () => {
    process.env.RAKAZO_GITHUB_REPO = 'nhantochi95/Rakazo';

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://api.github.com/repos/nhantochi95/Rakazo/releases') {
        return new Response(
          JSON.stringify([
            {
              tag_name: 'v2.4.1',
              name: 'Rakazo v2.4.1',
              body: 'GitHub direct release',
              html_url: 'https://github.com/nhantochi95/Rakazo/releases/tag/v2.4.1',
              prerelease: false,
              draft: false,
              assets: [
                {
                  name: 'Rakazo-2.4.1-win-x64.exe',
                  browser_download_url:
                    'https://github.com/nhantochi95/Rakazo/releases/download/v2.4.1/Rakazo-2.4.1-win-x64.exe',
                  size: 2048,
                },
              ],
            },
          ]),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { initUpdateBridge } = await import('@process/bridge/updateBridge');
    const { ipcBridge } = await import('@/common');
    initUpdateBridge();

    const checkHandler = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1)?.[0]!;
    const res = await checkHandler({});

    expect(res.success).toBe(true);
    expect(res.data?.updateAvailable).toBe(true);
    expect(res.data?.latest?.version).toBe('2.4.1');
    expect(res.data?.latest?.assets[0]?.url).toBe(
      'https://github.com/nhantochi95/Rakazo/releases/download/v2.4.1/Rakazo-2.4.1-win-x64.exe'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
