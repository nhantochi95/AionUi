/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CdnGenericProvider } from './cdnGenericProvider';
import type { CdnGenericProviderConfiguration } from './cdnGenericProvider';

export const CDN_UPDATE_BASE_URL = 'https://static.aionui.com/releases';
export const UPSTREAM_CDN_HOST = 'static.aionui.com';
export const UPSTREAM_GITHUB_REPO = 'iOfficeAI/AionUi';

export const RAKAZO_UPDATE_BASE_URL_ENV = 'RAKAZO_UPDATE_BASE_URL';
export const RAKAZO_GITHUB_REPO_ENV = 'RAKAZO_GITHUB_REPO';

const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type CdnFeedOptions = CdnGenericProviderConfiguration & {
  updateProvider: typeof CdnGenericProvider;
};

export interface UpdateSourcePolicyOverrides {
  /** Explicit CDN base URL override (e.g. for unit tests or custom feeds). */
  cdnBaseUrl?: string;
  /** Explicit GitHub owner/repo override (e.g. for unit tests or custom release repo). */
  githubRepo?: string;
  /** Optional environment map override (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
}

export interface UpdateSourcePolicy {
  /** True when either autoUpdateEnabled or manualUpdateEnabled is true. */
  enabled: boolean;
  /** True when electron-updater CDN feed is configured. */
  autoUpdateEnabled: boolean;
  /** True when manual release check/download is configured. */
  manualUpdateEnabled: boolean;
  /** Effective HTTPS CDN base URL (without trailing slash), or null when disabled. */
  cdnBaseUrl: string | null;
  /** Lowercase hostname of cdnBaseUrl, or null when disabled. */
  cdnHost: string | null;
  /** Effective GitHub `owner/repo`, or null when disabled. */
  githubRepo: string | null;
  /** True only when upstream static.aionui.com / iOfficeAI/AionUi was explicitly injected via code overrides. */
  allowUpstream: boolean;
}

export function isUpstreamUpdateHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  return lower === UPSTREAM_CDN_HOST || lower === 'aionui.com' || lower.endsWith('.aionui.com');
}

export function isUpstreamGitHubRepo(repo: string): boolean {
  return repo.trim().replace(/^\/+|\/+$/g, '').toLowerCase() === UPSTREAM_GITHUB_REPO.toLowerCase();
}

export function isUpstreamReleaseUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (isUpstreamUpdateHost(host)) {
    return true;
  }

  const pathLower = parsed.pathname.toLowerCase();
  if (host === 'github.com' && (pathLower === '/iofficeai/aionui' || pathLower.startsWith('/iofficeai/aionui/'))) {
    return true;
  }
  if (
    host === 'api.github.com' &&
    (pathLower === '/repos/iofficeai/aionui' || pathLower.startsWith('/repos/iofficeai/aionui/'))
  ) {
    return true;
  }

  return false;
}

function normalizeHttpsBaseUrl(
  raw: string | undefined,
  allowUpstream: boolean
): { baseUrl: string; host: string } | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!allowUpstream && isUpstreamUpdateHost(host)) {
    return null;
  }

  const baseUrl = parsed.toString().replace(/\/+$/, '');
  return { baseUrl, host };
}

function normalizeGitHubRepo(raw: string | undefined, allowUpstream: boolean): string | null {
  const cleaned = raw?.trim().replace(/^\/+|\/+$/g, '');
  if (!cleaned || !GITHUB_REPO_PATTERN.test(cleaned)) {
    return null;
  }

  if (!allowUpstream && isUpstreamGitHubRepo(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Resolve the Rakazo fork update source policy.
 *
 * By default (when `RAKAZO_UPDATE_BASE_URL` and `RAKAZO_GITHUB_REPO` are unset and
 * no programmatic test overrides are supplied), all upstream `static.aionui.com`
 * and `iOfficeAI/AionUi` update pathways are disabled (`enabled: false`).
 */
export function resolveUpdateSourcePolicy(overrides?: UpdateSourcePolicyOverrides): UpdateSourcePolicy {
  const env = overrides?.env ?? process.env;
  const hasExplicitCdnOverride = typeof overrides?.cdnBaseUrl === 'string' && overrides.cdnBaseUrl.trim().length > 0;
  const hasExplicitRepoOverride = typeof overrides?.githubRepo === 'string' && overrides.githubRepo.trim().length > 0;

  const rawCdn = hasExplicitCdnOverride ? overrides?.cdnBaseUrl : env[RAKAZO_UPDATE_BASE_URL_ENV];
  const rawRepo = hasExplicitRepoOverride ? overrides?.githubRepo : env[RAKAZO_GITHUB_REPO_ENV];

  const cdnInfo = normalizeHttpsBaseUrl(rawCdn, hasExplicitCdnOverride);
  const githubRepo = normalizeGitHubRepo(rawRepo, hasExplicitRepoOverride);

  const allowUpstream = Boolean(
    (hasExplicitCdnOverride && cdnInfo && isUpstreamUpdateHost(cdnInfo.host)) ||
      (hasExplicitRepoOverride && githubRepo && isUpstreamGitHubRepo(githubRepo))
  );

  const autoUpdateEnabled = cdnInfo !== null;
  const manualUpdateEnabled = cdnInfo !== null || githubRepo !== null;

  return {
    enabled: autoUpdateEnabled || manualUpdateEnabled,
    autoUpdateEnabled,
    manualUpdateEnabled,
    cdnBaseUrl: cdnInfo?.baseUrl ?? null,
    cdnHost: cdnInfo?.host ?? null,
    githubRepo,
    allowUpstream,
  };
}

export function buildCdnFeedOptions(baseUrl: string = CDN_UPDATE_BASE_URL): CdnFeedOptions {
  return {
    provider: 'custom',
    url: baseUrl,
    updateProvider: CdnGenericProvider,
  };
}
