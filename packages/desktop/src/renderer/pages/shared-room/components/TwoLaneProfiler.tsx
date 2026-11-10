import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Progress, Tag } from '@arco-design/web-react';
import { Lightning, Tool } from '@icon-park/react';
import useSWR from 'swr';
import { wallets } from '@/common/adapter/ipcBridge';

export interface TwoLaneProfilerProps {
  modelTimeSec?: number;
  toolTimeSec?: number;
  totalTimeSec?: number;
  showWalletCards?: boolean;
}

export const TwoLaneProfiler: React.FC<TwoLaneProfilerProps> = ({
  modelTimeSec = 26.0,
  toolTimeSec = 22.2,
  totalTimeSec = 48.2,
  showWalletCards = true,
}) => {
  const { t } = useTranslation();

  const { data: walletData, mutate: mutateWallet } = useSWR(
    '/api/wallets/summary',
    () => wallets.summary.invoke(),
    { revalidateOnFocus: true }
  );

  useEffect(() => {
    const unsub = wallets.spendUpdated?.on(() => {
      void mutateWallet();
    });
    return () => {
      unsub?.();
    };
  }, [mutateWallet]);

  const apiSpent = walletData?.api_key_spent_usd ?? 1.4;
  const apiLimit = walletData?.api_key_budget_limit_usd ?? 5.0;
  const cliRuns = walletData?.cli_subscription_runs ?? 38;
  const apiPercent = Math.min(100, Math.round((apiSpent / (apiLimit || 1)) * 100));

  const total = modelTimeSec + toolTimeSec || 1;
  const modelPct = Math.round((modelTimeSec / total) * 100);
  const toolPct = 100 - modelPct;

  return (
    <div
      data-testid='two-lane-profiler'
      className='flex flex-col gap-16px p-12px text-12px'
    >
      {/* 2-Lane Timeline Tracks */}
      <div className='flex flex-col gap-10px p-12px rd-10px bg-fill-2 border border-solid border-arco-2'>
        <div className='flex items-center justify-between'>
          <span className='font-bold text-t-primary'>
            {t('team.sharedRoom.preview.profiler.timelineTitle', '2-Lane Execution Timeline')}
          </span>
          <Tag color='arcoblue' size='small' className='font-mono font-bold'>
            {t('team.sharedRoom.preview.profiler.totalTurnaround', 'Total Turnaround: {{time}}s', {
              time: totalTimeSec.toFixed(1),
            })}
          </Tag>
        </div>

        {/* Track 1: Model Lane */}
        <div className='flex flex-col gap-4px'>
          <div className='flex items-center justify-between text-11px text-t-secondary'>
            <span className='flex items-center gap-4px font-medium'>
              <Lightning theme='filled' size='12' className='text-purple-500' />
              {t('team.sharedRoom.preview.profiler.modelLane', '🧠 Model Latency')}
            </span>
            <span className='font-mono'>{modelTimeSec.toFixed(1)}s ({modelPct}%)</span>
          </div>
          <div className='h-8px rd-full bg-fill-3 overflow-hidden'>
            <div
              data-testid='profiler-model-lane'
              className='h-full bg-purple-500 rd-full transition-all'
              style={{ width: `${modelPct}%` }}
            />
          </div>
        </div>

        {/* Track 2: Tool / CLI Lane */}
        <div className='flex flex-col gap-4px'>
          <div className='flex items-center justify-between text-11px text-t-secondary'>
            <span className='flex items-center gap-4px font-medium'>
              <Tool theme='outline' size='12' className='text-cyan-600' />
              {t('team.sharedRoom.preview.profiler.toolLane', '🛠️ Tool / CLI Latency')}
            </span>
            <span className='font-mono'>{toolTimeSec.toFixed(1)}s ({toolPct}%)</span>
          </div>
          <div className='h-8px rd-full bg-fill-3 overflow-hidden'>
            <div
              data-testid='profiler-tool-lane'
              className='h-full bg-cyan-500 rd-full transition-all'
              style={{ width: `${toolPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Dual Wallet Overview Cards */}
      {showWalletCards && (
        <div className='flex flex-col gap-10px'>
          <div className='font-bold text-t-primary'>
            {t('team.sharedRoom.preview.profiler.dualWallet', 'Dual Wallet Overview')}
          </div>

          <div className='grid grid-cols-1 gap-8px'>
            {/* Wallet 1: CLI Subscription ($0) */}
            <div
              data-testid='wallet-cli-card'
              className='p-12px rd-10px bg-green-50/50 dark:bg-green-950/20 border border-solid border-green-200 dark:border-green-800 flex flex-col gap-6px'
            >
              <div className='flex items-center justify-between'>
                <span className='font-bold text-green-700 dark:text-green-300 text-12px'>
                  {t('team.sharedRoom.preview.profiler.walletCli', 'Wallet 1: CLI Subscription ($0 OAuth)')}
                </span>
                <Tag color='green' size='small'>
                  $0.00
                </Tag>
              </div>
              <div className='text-11px text-t-secondary'>
                {t('team.sharedRoom.preview.profiler.runsCount', '{{count}} runs', { count: cliRuns })} • Claude Max / Codex CLI
              </div>
            </div>

            {/* Wallet 2: API Key (Pay-per-token) */}
            <div
              data-testid='wallet-api-card'
              className='p-12px rd-10px bg-fill-2 border border-solid border-arco-2 flex flex-col gap-6px'
            >
              <div className='flex items-center justify-between'>
                <span className='font-bold text-t-primary text-12px'>
                  {t('team.sharedRoom.preview.profiler.walletApi', 'Wallet 2: API Key (Pay-per-token)')}
                </span>
                <span className='font-mono text-11px font-bold text-t-primary'>
                  ${apiSpent.toFixed(2)} / ${apiLimit.toFixed(2)}
                </span>
              </div>
              <Progress
                percent={apiPercent}
                status={apiPercent >= 100 ? 'error' : apiPercent >= 80 ? 'warning' : 'normal'}
                size='small'
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
