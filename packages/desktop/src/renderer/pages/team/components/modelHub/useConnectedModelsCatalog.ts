/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import useSWR from 'swr';
import type {
  ConnectedApiProviderDto,
  ConnectedCliEngineDto,
  ConnectedModelsCatalogDto,
  ModelTargetSpec,
} from '@/common/types/team/teamHubTypes';
import { useModelProviderList } from '@renderer/hooks/agent/useModelProviderList';
import { getTeamHubBridge } from './bridgeSafe';

export interface ConnectedModelFlatItem {
  key: string;
  groupKind: 'cli_subscription' | 'api_key';
  sourceTitle: string;
  backend: string;
  providerId?: string;
  assistantId: string;
  modelId: string;
  modelLabel: string;
  supportsNativeCompact: boolean;
  walletType: 'cli_subscription' | 'api_key';
  target: ModelTargetSpec;
}

export interface ConnectedModelGroup {
  groupId: string;
  title: string;
  walletType: 'cli_subscription' | 'api_key';
  supportsNativeCompact?: boolean;
  items: ConnectedModelFlatItem[];
}

export const CONNECTED_MODELS_SWR_KEY = '/api/team-hub/connected-models';

function fallbackDefaultModelId(backend: string): string {
  if (backend === 'antigravity') return '';
  if (backend === 'gemini' || backend === 'gemini-cli') return 'auto';
  return 'default';
}

export function useConnectedModelsCatalog(enabled = true) {
  const { providers: fallbackProviders, getAvailableModels } = useModelProviderList();

  const {
    data: remoteCatalog,
    isLoading,
    mutate,
  } = useSWR<ConnectedModelsCatalogDto | undefined>(
    enabled ? CONNECTED_MODELS_SWR_KEY : null,
    async () => {
      const hub = getTeamHubBridge();
      if (!hub?.connectedModels?.invoke) return undefined;
      try {
        return await hub.connectedModels.invoke();
      } catch {
        return undefined;
      }
    },
    { revalidateOnFocus: false }
  );

  const catalog = useMemo<ConnectedModelsCatalogDto>(() => {
    const cliAgents: ConnectedCliEngineDto[] = remoteCatalog?.cli_agents ?? [];
    let apiProviders: ConnectedApiProviderDto[] = remoteCatalog?.api_providers ?? [];

    if (apiProviders.length === 0 && fallbackProviders.length > 0) {
      apiProviders = fallbackProviders.map((provider) => ({
        engine_kind: 'api_provider' as const,
        backend: 'aionrs' as const,
        provider_id: provider.id,
        provider_name: provider.name,
        platform: provider.platform,
        assistant_id: 'bare:aionrs',
        wallet_type: 'api_key' as const,
        models: getAvailableModels(provider).map((modelId) => ({
          id: modelId,
          label: modelId,
        })),
      }));
    }

    return {
      cli_agents: cliAgents,
      api_providers: apiProviders,
    };
  }, [fallbackProviders, getAvailableModels, remoteCatalog]);

  const { cliSubscriptionGroups, paidApiGroups, allItems } = useMemo(() => {
    const cliGroups: ConnectedModelGroup[] = [];
    const apiGroups: ConnectedModelGroup[] = [];
    const flat: ConnectedModelFlatItem[] = [];

    for (const cli of catalog.cli_agents) {
      const rawModels =
        cli.models.length > 0
          ? cli.models
          : [{ id: fallbackDefaultModelId(cli.backend), label: 'Default' }];

      const items: ConnectedModelFlatItem[] = rawModels.map((m) => {
        const displayModel = m.label || m.id || 'Default';
        const target: ModelTargetSpec = {
          backend: cli.backend,
          model_id: m.id,
          label: `${cli.name} · ${displayModel}`,
          wallet_type: cli.wallet_type,
        };
        const item: ConnectedModelFlatItem = {
          key: `cli:${cli.backend}:${cli.agent_id}:${m.id || '__default__'}`,
          groupKind: cli.wallet_type,
          sourceTitle: cli.name,
          backend: cli.backend,
          assistantId: cli.assistant_id,
          modelId: m.id,
          modelLabel: displayModel,
          supportsNativeCompact: cli.supports_native_compact,
          walletType: cli.wallet_type,
          target,
        };
        flat.push(item);
        return item;
      });

      const group: ConnectedModelGroup = {
        groupId: `cli:${cli.backend}:${cli.agent_id}`,
        title: cli.name,
        walletType: cli.wallet_type,
        supportsNativeCompact: cli.supports_native_compact,
        items,
      };
      if (cli.wallet_type === 'cli_subscription') {
        cliGroups.push(group);
      } else {
        apiGroups.push(group);
      }
    }

    for (const provider of catalog.api_providers) {
      if (provider.models.length === 0) continue;
      const items: ConnectedModelFlatItem[] = provider.models.map((m) => {
        const displayModel = m.label || m.id;
        const target: ModelTargetSpec = {
          backend: 'aionrs',
          provider_id: provider.provider_id,
          model_id: m.id,
          label: `${provider.provider_name} · ${displayModel}`,
          wallet_type: 'api_key',
        };
        const item: ConnectedModelFlatItem = {
          key: `api:${provider.provider_id}:${m.id}`,
          groupKind: 'api_key',
          sourceTitle: provider.provider_name,
          backend: 'aionrs',
          providerId: provider.provider_id,
          assistantId: provider.assistant_id || 'bare:aionrs',
          modelId: m.id,
          modelLabel: displayModel,
          supportsNativeCompact: false,
          walletType: 'api_key',
          target,
        };
        flat.push(item);
        return item;
      });

      apiGroups.push({
        groupId: `api:${provider.provider_id}`,
        title: provider.provider_name,
        walletType: 'api_key',
        supportsNativeCompact: false,
        items,
      });
    }

    return {
      cliSubscriptionGroups: cliGroups,
      paidApiGroups: apiGroups,
      allItems: flat,
    };
  }, [catalog]);

  return {
    catalog,
    cliAgents: catalog.cli_agents,
    apiProviders: catalog.api_providers,
    cliSubscriptionGroups,
    paidApiGroups,
    allItems,
    isLoading,
    mutate,
  };
}
