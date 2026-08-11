import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useDaoData } from "@/app/lib/hooks/use-fydao";
import {
  formatCompact,
  formatDuration,
  truncate,
} from "@/app/lib/fydao/format";
import { useCluster } from "@/app/components/cluster-context";
import { Stat } from "./shared";

export function DaoOverview() {
  const { getExplorerUrl } = useCluster();
  const {
    daoConfig,
    govTokenState,
    governanceMint,
    treasuryBalance,
    daoConfigLoading,
  } = useDaoData();

  const govDecimals = governanceMint?.data.decimals ?? 6;
  const totalMinted = govTokenState?.totalMinted ?? 0n;
  const maxSupply = daoConfig?.maxGovernanceSupply ?? 0n;
  const supplyPct =
    maxSupply > 0n ? Number((totalMinted * 10000n) / maxSupply) / 100 : 0;

  if (daoConfig === undefined) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-medium">Loading DAO state...</p>
        <p className="mt-1 text-sm text-muted">
          {daoConfigLoading
            ? "Querying the fydao program."
            : "Waiting for on-chain state."}
        </p>
      </Card>
    );
  }

  if (daoConfig === null) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-medium">No DAO deployed on this cluster yet</p>
        <p className="mt-1 text-sm text-muted">
          Run the setup wizard in the Admin tab to deploy the DAO (only the
          genesis authority can do this).
        </p>
      </Card>
    );
  }

  const config = daoConfig;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">DAO Configuration</h2>
          <p className="text-sm text-muted">
            Governance parameters and treasury state.
          </p>
        </div>
        <Badge variant={config.paused ? "destructive" : "secondary"}>
          {config.paused ? "Paused" : "Live"}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Authority"
          value={
            <a
              className="font-mono text-sm underline-offset-2 hover:underline"
              href={getExplorerUrl(`/address/${config.authority}`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {truncate(config.authority)}
            </a>
          }
        />
        <Stat
          label="Pending authority"
          value={
            config.pendingAuthority ===
            "11111111111111111111111111111111" ? (
              "None"
            ) : (
              <a
                className="font-mono text-sm underline-offset-2 hover:underline"
                href={getExplorerUrl(`/address/${config.pendingAuthority}`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {truncate(config.pendingAuthority)}
              </a>
            )
          }
        />
        <Stat
          label="Campaigns"
          value={config.campaignCount.toString()}
        />
        <Stat
          label="Proposals"
          value={config.nextProposalId.toString()}
        />
      </div>

      <Card className="px-4">
        <CardHeader className="px-0">
          <CardTitle className="text-base">Governance token</CardTitle>
        </CardHeader>
        <CardContent className="px-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <a
                className="font-mono text-sm underline-offset-2 hover:underline"
                href={getExplorerUrl(`/address/${config.governanceMint}`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {truncate(config.governanceMint)}
              </a>
              <p className="mt-0.5 text-xs text-muted">
                {govTokenState
                  ? `Minted ${formatCompact(totalMinted, govDecimals)} / ${formatCompact(maxSupply, govDecimals)}`
                  : "Governance token state not initialized"}
              </p>
            </div>
            {govTokenState && (
              <p className="text-sm font-medium tabular-nums">
                {supplyPct.toFixed(1)}% of cap
              </p>
            )}
          </div>
          {govTokenState && (
            <Progress value={Math.min(supplyPct, 100)} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Treasury (stablecoin)"
          value={
            treasuryBalance
              ? `${formatCompact(treasuryBalance.amount, treasuryBalance.decimals)} USDC`
              : "\u2014"
          }
          sub={
            <a
              className="font-mono text-xs underline-offset-2 hover:underline"
              href={getExplorerUrl(`/address/${config.treasury}`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {truncate(config.treasury)}
            </a>
          }
        />
        <Stat
          label="Voting delay"
          value={formatDuration(config.votingDelay)}
        />
        <Stat
          label="Voting period"
          value={formatDuration(config.votingPeriod)}
        />
        <Stat
          label="Quorum"
          value={`${(config.quorumBps / 100).toFixed(1)}%`}
        />
        <Stat
          label="Proposal threshold"
          value={formatCompact(config.proposalThreshold, govDecimals)}
          sub="governance tokens"
        />
        <Stat
          label="Timelock delay"
          value={formatDuration(config.timelockDelay)}
        />
      </div>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted">Stablecoin mint</p>
          <a
            className="font-mono text-xs underline-offset-2 hover:underline"
            href={getExplorerUrl(`/address/${config.stablecoinMint}`)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {truncate(config.stablecoinMint)}
          </a>
        </div>
      </div>
    </div>
  );
}
