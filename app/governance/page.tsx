"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Navbar } from "../components/navbar";
import { GridBackground } from "../components/grid-background";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCluster } from "@/app/components/cluster-context";
import { useSolanaClient } from "@/app/lib/solana-client-context";
import {
  useDaoConfig,
  useGovernanceTokenState,
  useMintInfo,
  useProposals,
  useCampaigns,
  useMilestones,
  useVoteRecords,
  useVoteRecord,
  useFydaoTx,
  useFydaoWallet,
  useTokenBalance,
  useAccountBalance,
} from "@/app/lib/hooks/use-fydao";
import {
  approveCampaignActions,
  cancelProposalActions,
  castVoteActions,
  emergencyWithdrawActions,
  queueProposalActions,
  releaseMilestoneActions,
  transferAuthorityActions,
  unlockVotesActions,
} from "@/app/lib/fydao/actions";
import {
  formatCompact,
  formatDate,
  formatDuration,
  formatRelative,
  truncate,
} from "@/app/lib/fydao/format";
import { rawToDecimal } from "@/app/lib/fydao/amount";
import { ACTION_LABELS, VOTE_SUPPORT_LABELS } from "@/app/lib/fydao/constants";
import type { Address } from "@solana/kit";
import type { Proposal } from "@/app/generated/fydao/accounts";
import { ProposalStateBadge } from "../components/fydao/status-badge";
import { CreateProposalDialog } from "../components/fydao/create-proposal-dialog";
import { ConnectGate } from "../components/fydao/shared";
import {
  Vote,
  PlusCircle,
  Clock,
  CheckCircle2,
  Lock,
  Unlock,
  Play,
  ExternalLink,
  Users,
  Timer,
} from "lucide-react";

const FINAL_STATES = new Set([2, 3, 6, 7]); // Canceled, Defeated, Expired, Executed

export default function GovernanceHubPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <GovernanceHubContent />
      </main>
    </div>
  );
}

function GovernanceHubContent() {
  const { getExplorerUrl } = useCluster();
  const { address, signer } = useFydaoWallet();
  const { data: daoConfig, isLoading: configLoading } = useDaoConfig();
  const { data: govTokenState } = useGovernanceTokenState();
  const { data: proposals, isLoading: proposalsLoading } = useProposals();
  const { data: campaigns } = useCampaigns();
  const { data: milestones } = useMilestones();
  const { data: allVoteRecords } = useVoteRecords();

  const govMintAddress = daoConfig?.governanceMint;
  const { data: govMintInfo } = useMintInfo(govMintAddress);
  const { data: treasuryBalance } = useAccountBalance(daoConfig?.treasury);

  const { data: voterGovBalance } = useTokenBalance(
    (address as Address) ?? null,
    govMintAddress ?? null
  );

  const [activeTab, setActiveTab] = useState<string>("active");
  const [createOpen, setCreateOpen] = useState(false);

  // User vote records
  const myVoteRecords = useMemo(() => {
    if (!address || !allVoteRecords) return [];
    return allVoteRecords.filter((v) => v.account.voter === address);
  }, [address, allVoteRecords]);

  const myLockedVotesCount = myVoteRecords.filter((v) => !v.account.unlocked).length;

  if (configLoading && daoConfig === undefined) {
    return (
      <div className="h-96 rounded-3xl animate-pulse bg-muted/20 border border-border/40" />
    );
  }

  if (!daoConfig) {
    return (
      <Card className="p-12 text-center border-dashed border-border/80">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Vote className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-bold">DAO Not Initialized on this Cluster</h2>
        <p className="mt-2 text-xs text-muted-foreground max-w-md mx-auto">
          The Arthasetu DAO governance program needs to be bootstrapped by the genesis authority.
        </p>
      </Card>
    );
  }

  const govDecimals = govMintInfo?.data.decimals ?? 6;
  const totalMinted = govTokenState?.totalMinted ?? 0n;
  const maxSupply = daoConfig.maxGovernanceSupply;

  const sortedProposals = (proposals ?? [])
    .slice()
    .sort((a, b) => Number(b.account.proposalId - a.account.proposalId));

  const activeProposals = sortedProposals.filter((p) => p.account.state === 1 || p.account.state === 0);
  const queuedProposals = sortedProposals.filter((p) => p.account.state === 5);

  return (
    <div className="space-y-8">
      {/* Governance Hero & Protocol Stats */}
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-card via-card to-primary/5 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Vote className="h-4 w-4" /> On-Chain Decentralized Governance
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Arthasetu DAO Governor
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
              Proposals carry typed actions executed atomically by permissionless triggers after timelocks. Voters lock governance tokens during votes to prevent buy-vote-dump attacks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              onClick={() => setCreateOpen(true)}
              className="gap-2 bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
            >
              <PlusCircle className="h-4 w-4" /> New Proposal
            </Button>
          </div>
        </div>

        {/* Global Protocol Stats Bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-6 pt-6 border-t border-border/40">
          <div>
            <span className="text-xs text-muted-foreground">DAO Treasury</span>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {treasuryBalance ? `${formatCompact(treasuryBalance.amount, treasuryBalance.decimals)} USDC` : "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Quorum Parameter</span>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {(daoConfig.quorumBps / 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Timelock Delay</span>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {formatDuration(daoConfig.timelockDelay)}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Voting Period</span>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {formatDuration(daoConfig.votingPeriod)}
            </p>
          </div>
        </div>
      </div>

      {/* Voter Status & Quick Escrow Banner */}
      {address && (
        <Card className="border-border/80 bg-muted/20 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
                <Lock className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Connected Voter Power</p>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold tabular-nums">
                    {voterGovBalance ? `${formatCompact(voterGovBalance.amount, govDecimals)} Tokens` : "0 Tokens"}
                  </span>
                  {myLockedVotesCount > 0 && (
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px]">
                      {myLockedVotesCount} Active Vote Escrow Locks
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {myLockedVotesCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("voter")}
                  className="text-xs h-8 gap-1.5"
                >
                  <Unlock className="h-3.5 w-3.5" /> Manage &amp; Unlock Votes ({myLockedVotesCount})
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Proposal Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="active" className="text-xs">
            Active Voting ({activeProposals.length})
          </TabsTrigger>
          <TabsTrigger value="queued" className="text-xs">
            Timelock Queue ({queuedProposals.length})
          </TabsTrigger>
          <TabsTrigger value="all" className="text-xs">
            All Proposals ({sortedProposals.length})
          </TabsTrigger>
          <TabsTrigger value="voter" className="text-xs">
            My Vote Locks ({myVoteRecords.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Active Voting */}
        <TabsContent value="active" className="space-y-4">
          {activeProposals.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-border/80">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold">No Active Proposals in Voting</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                All current proposals have concluded voting or been executed. Create a new proposal to trigger campaign approvals or milestone releases.
              </p>
              <div className="mt-6">
                <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                  <PlusCircle className="h-4 w-4" /> Create Proposal
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {activeProposals.map((p) => (
                <EnhancedProposalCard
                  key={p.address}
                  proposal={p}
                  daoConfig={daoConfig}
                  campaigns={campaigns ?? []}
                  milestones={milestones ?? []}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Timelock Queue */}
        <TabsContent value="queued" className="space-y-4">
          {queuedProposals.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-border/80">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold">Timelock Queue is Empty</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                Passed proposals enter the timelock delay before they become permissionlessly executable.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {queuedProposals.map((p) => (
                <EnhancedProposalCard
                  key={p.address}
                  proposal={p}
                  daoConfig={daoConfig}
                  campaigns={campaigns ?? []}
                  milestones={milestones ?? []}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: All Proposals */}
        <TabsContent value="all" className="space-y-4">
          {sortedProposals.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-border/80">
              <p className="text-sm text-muted-foreground">No proposals created yet.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {sortedProposals.map((p) => (
                <EnhancedProposalCard
                  key={p.address}
                  proposal={p}
                  daoConfig={daoConfig}
                  campaigns={campaigns ?? []}
                  milestones={milestones ?? []}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 4: Voter Portfolio & Escrow Unlocker */}
        <TabsContent value="voter" className="space-y-4">
          <VoterEscrowManager
            daoConfig={daoConfig}
            proposals={sortedProposals}
            myVoteRecords={myVoteRecords}
          />
        </TabsContent>
      </Tabs>

      {/* New Proposal Dialog */}
      {createOpen && (
        <CreateProposalDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          campaigns={campaigns ?? []}
          milestones={milestones ?? []}
        />
      )}
    </div>
  );
}

function EnhancedProposalCard({
  proposal,
  daoConfig,
  campaigns,
  milestones,
}: {
  proposal: { address: string; account: Proposal };
  daoConfig: any;
  campaigns: Array<{ address: string; account: any }>;
  milestones: Array<{ address: string; account: any }>;
}) {
  const { getExplorerUrl } = useCluster();
  const client = useSolanaClient();
  const { address, signer } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();

  const { data: voteRecord } = useVoteRecord(
    proposal.address as Proposal["proposer"],
    (address as Address) ?? null
  );

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const p = proposal.account;
  const act = p.action;
  const state = p.state;

  // Dynamically activate if Pending (0) and voteStart has been reached
  const isVotingActive =
    (state === 1 || (state === 0 && now >= Number(p.voteStart))) &&
    now < Number(p.voteEnd);
  const effectiveState =
    state === 0 && now >= Number(p.voteStart) && now < Number(p.voteEnd)
      ? 1
      : state;

  const snapshotSupply = p.totalVotesAtCreation;
  const quorumThreshold = snapshotSupply > 0n ? (snapshotSupply * BigInt(daoConfig.quorumBps)) / 10000n : 0n;
  const isQuorumReached = p.forVotes >= quorumThreshold;

  const isAuthority = address === daoConfig?.authority;
  const isProposer = address === p.proposer;

  const canVote = signer && isVotingActive && voteRecord === null;
  const canQueue =
    signer &&
    now >= Number(p.voteEnd) &&
    (state === 4 || state === 1 || state === 0);
  const isExecutable =
    state === 5 &&
    p.eta > 0n &&
    now >= Number(p.eta) &&
    now <= Number(p.eta) + 14 * 86400 &&
    !p.executed;

  const canExecute = signer && isExecutable;
  const canCancel =
    signer &&
    (state === 0 || state === 1 || state === 4 || state === 5) &&
    (isProposer || isAuthority);
  const canUnlock = signer && voteRecord && !voteRecord.unlocked && FINAL_STATES.has(state);

  // Time calculations
  const timeUntilVotingEnds = p.voteEnd > 0n ? Number(p.voteEnd) - now : 0;
  const timeUntilTimelockElapses = p.eta > 0n ? Number(p.eta) - now : 0;
  const timeUntilExpiration = p.eta > 0n ? Number(p.eta) + 14 * 86400 - now : 0;

  const vote = async (support: number) => {
    if (!signer || !daoConfig) return;
    await run(`Casting Vote (${VOTE_SUPPORT_LABELS[support]})`, () =>
      castVoteActions({
        rpc: client.rpc,
        voter: signer,
        governanceMint: daoConfig.governanceMint,
        proposal: proposal.address as Proposal["proposer"],
        support,
      })
    );
  };

  const queue = async () => {
    if (!signer) return;
    await run("Queuing Proposal for Timelock", () =>
      queueProposalActions({
        authority: signer,
        proposal: proposal.address as Proposal["proposer"],
      })
    );
  };

  const execute = async () => {
    if (!signer || !daoConfig) return;
    switch (act.__kind) {
      case "ApproveCampaign":
        await run("Executing Campaign Approval", () =>
          approveCampaignActions({
            proposal: proposal.address as Proposal["proposer"],
            campaign: act.campaign,
          })
        );
        break;
      case "ReleaseMilestone": {
        const ms = milestones.find(
          (m) => m.account.campaign === act.campaign && m.account.milestoneId === act.milestoneId
        );
        const camp = campaigns.find((c) => c.address === act.campaign);
        if (!ms || !camp) throw new Error("Milestone or Campaign account not found");
        await run("Executing Milestone Release", () =>
          releaseMilestoneActions({
            proposal: proposal.address as Proposal["proposer"],
            campaign: act.campaign,
            campaignCreator: camp.account.creator,
            stablecoinMint: daoConfig.stablecoinMint,
            milestone: ms.address as Address,
            milestoneId: act.milestoneId,
          })
        );
        break;
      }
      case "EmergencyWithdraw":
        await run("Executing Emergency Withdrawal", () =>
          emergencyWithdrawActions({
            proposal: proposal.address as Proposal["proposer"],
            campaign: act.campaign,
            treasury: daoConfig.treasury,
            stablecoinMint: daoConfig.stablecoinMint,
            amount: act.amount,
          })
        );
        break;
      case "TransferAuthority":
        await run("Executing Authority Transfer", () =>
          transferAuthorityActions({
            proposal: proposal.address as Proposal["proposer"],
          })
        );
        break;
    }
  };

  const cancel = async () => {
    if (!signer) return;
    await run("Canceling Proposal", () =>
      cancelProposalActions({
        authority: signer,
        proposal: proposal.address as Proposal["proposer"],
      })
    );
  };

  const unlock = async () => {
    if (!signer || !daoConfig) return;
    await run("Unlocking Governance Tokens", () =>
      unlockVotesActions({
        rpc: client.rpc,
        voter: signer,
        governanceMint: daoConfig.governanceMint,
        proposal: proposal.address as Proposal["proposer"],
      })
    );
  };

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="p-5 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/governance/proposals/${p.proposalId.toString()}`} className="hover:underline">
                <CardTitle className="text-base font-bold hover:text-primary transition-colors cursor-pointer">
                  Proposal #{p.proposalId.toString()}
                </CardTitle>
              </Link>
              <ProposalStateBadge state={effectiveState} />
              {p.executed && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">Executed</Badge>}
              <Badge variant="secondary" className="text-[10px] font-mono capitalize">
                {ACTION_LABELS[act.__kind] || act.__kind}
              </Badge>
            </div>
            <p className="text-sm font-semibold text-foreground">{p.description}</p>
            <p className="text-xs text-muted-foreground">
              Proposed by{" "}
              <a
                href={getExplorerUrl(`/address/${p.proposer}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono font-medium text-foreground underline hover:text-primary"
              >
                {truncate(p.proposer)}
              </a>
              {isProposer && <span className="ml-1 text-primary font-bold">(You)</span>}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 space-y-4 text-xs">
        {/* Action Detail Banner */}
        <div className="rounded-xl bg-muted/30 border border-border/60 p-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase">Target On-Chain Action:</span>
            <p className="font-medium text-foreground text-xs mt-0.5">
              {act.__kind === "ApproveCampaign" && `Approve Campaign ${truncate(act.campaign)} for public donations`}
              {act.__kind === "ReleaseMilestone" && `Release milestone #${act.milestoneId.toString()} for Campaign ${truncate(act.campaign)}`}
              {act.__kind === "EmergencyWithdraw" && `Drain ${rawToDecimal(act.amount, 6)} USDC from Campaign ${truncate(act.campaign)} to DAO Treasury`}
              {act.__kind === "TransferAuthority" && `Nominate new protocol authority to ${truncate(act.newAuthority)}`}
            </p>
          </div>

          {act.__kind !== "TransferAuthority" && (
            <Link href={`/campaigns/${act.campaign}`}>
              <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1">
                View Campaign <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          )}
        </div>

        {/* Voting & Quorum Progress */}
        <div className="space-y-2 rounded-xl bg-muted/20 border border-border/60 p-3.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" /> Voting Progress &amp; Quorum
            </span>
            <span className="font-mono text-muted-foreground">
              Quorum: {p.forVotes.toString()} / {quorumThreshold.toString()} votes ({isQuorumReached ? "✓ Reached" : "Needed"})
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2">
              <p className="font-bold text-green-600 dark:text-green-400 text-sm tabular-nums">
                {p.forVotes.toString()}
              </p>
              <p className="text-[10px] text-muted-foreground">For Votes</p>
            </div>
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2">
              <p className="font-bold text-destructive text-sm tabular-nums">
                {p.againstVotes.toString()}
              </p>
              <p className="text-[10px] text-muted-foreground">Against</p>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border/80 p-2">
              <p className="font-bold text-foreground text-sm tabular-nums">
                {p.abstainVotes.toString()}
              </p>
              <p className="text-[10px] text-muted-foreground">Abstain</p>
            </div>
          </div>
        </div>

        {/* Timers and Alerts */}
        {isVotingActive && timeUntilVotingEnds > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 p-2.5 text-primary font-medium">
            <Timer className="h-4 w-4 shrink-0" />
            <span>Voting is Active · Closes in {Math.floor(timeUntilVotingEnds / 86400)}d {Math.floor((timeUntilVotingEnds % 86400) / 3600)}h {Math.floor((timeUntilVotingEnds % 3600) / 60)}m</span>
          </div>
        )}

        {state === 0 && !isVotingActive && Number(p.voteStart) > now && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 border border-border/60 p-2.5 text-muted-foreground font-medium">
            <Clock className="h-4 w-4 shrink-0" />
            <span>Voting starts in {formatRelative(p.voteStart)}</span>
          </div>
        )}

        {state === 5 && timeUntilTimelockElapses > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-amber-600 dark:text-amber-400 font-medium">
            <Clock className="h-4 w-4 shrink-0" />
            <span>Timelock Delay Active · Executable in {Math.floor(timeUntilTimelockElapses / 3600)}h {Math.floor((timeUntilTimelockElapses % 3600) / 60)}m {timeUntilTimelockElapses % 60}s</span>
          </div>
        )}

        {state === 5 && isExecutable && (
          <div className="flex items-center justify-between rounded-lg bg-green-500/10 border border-green-500/30 p-2.5 text-green-600 dark:text-green-400 font-medium">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 shrink-0" />
              <span>Timelock Cleared! Ready for Permissionless Execution ({Math.floor(timeUntilExpiration / 86400)}d window remaining)</span>
            </div>
          </div>
        )}

        {/* Connected Voter Receipt */}
        {voteRecord && (
          <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5 text-[11px]">
            <span>
              Your Cast Vote: <strong>{VOTE_SUPPORT_LABELS[voteRecord.support]}</strong> ({voteRecord.weight.toString()} locked tokens)
            </span>
            <Badge variant="outline" className={voteRecord.unlocked ? "text-muted-foreground" : "text-primary border-primary/30"}>
              {voteRecord.unlocked ? "Tokens Unlocked" : "Tokens Locked in Escrow"}
            </Badge>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-0 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-muted/10">
        <div className="flex flex-wrap gap-2">
          {canVote && (
            <>
              <Button size="sm" onClick={() => vote(1)} disabled={isSending} className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white">
                Vote For
              </Button>
              <Button size="sm" variant="outline" onClick={() => vote(2)} disabled={isSending} className="h-8 text-xs">
                Abstain
              </Button>
              <Button size="sm" variant="destructive" onClick={() => vote(0)} disabled={isSending} className="h-8 text-xs">
                Vote Against
              </Button>
            </>
          )}

          {canQueue && (
            <Button size="sm" variant="secondary" onClick={queue} disabled={isSending} className="h-8 text-xs gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Queue in Timelock
            </Button>
          )}

          {canExecute && (
            <Button size="sm" onClick={execute} disabled={isSending} className="h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white shadow-sm">
              <Play className="h-3.5 w-3.5" /> Execute Action Now
            </Button>
          )}

          {canUnlock && (
            <Button size="sm" variant="outline" onClick={unlock} disabled={isSending} className="h-8 text-xs gap-1.5">
              <Unlock className="h-3.5 w-3.5" /> Unlock My Tokens
            </Button>
          )}

          {canCancel && (
            <Button size="sm" variant="ghost" onClick={cancel} disabled={isSending} className="h-8 text-xs text-destructive hover:bg-destructive/10">
              Cancel
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Link href={`/governance/proposals/${p.proposalId.toString()}`}>
            <Button size="sm" variant="ghost" className="h-8 text-xs gap-1">
              Deep-Dive Details <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
          <div className="text-[11px] text-muted-foreground font-mono">
            Created: {formatRelative(p.createdAt)}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

function VoterEscrowManager({
  daoConfig,
  proposals,
  myVoteRecords,
}: {
  daoConfig: any;
  proposals: Array<{ address: string; account: Proposal }>;
  myVoteRecords: Array<{ address: string; account: any }>;
}) {
  const client = useSolanaClient();
  const { address, signer } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();

  const unlockSingle = async (propAddress: string) => {
    if (!signer || !daoConfig) return;
    await run("Unlocking Governance Tokens", () =>
      unlockVotesActions({
        rpc: client.rpc,
        voter: signer,
        governanceMint: daoConfig.governanceMint,
        proposal: propAddress as Proposal["proposer"],
      })
    );
  };

  return (
    <Card className="border-border/60 p-6 space-y-6">
      <div>
        <h3 className="text-base font-bold flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" /> Voter Token Escrow Portfolio
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          When voting on active proposals, tokens are transferred into per-voter escrows. Once the proposal reaches a terminal state (Executed, Defeated, Expired, or Canceled), you can reclaim your tokens and rent.
        </p>
      </div>

      {myVoteRecords.length === 0 ? (
        <div className="p-8 text-center border rounded-2xl border-dashed border-border/80 text-muted-foreground text-xs">
          You have not cast any votes on active or past proposals yet.
        </div>
      ) : (
        <div className="space-y-3">
          {myVoteRecords.map((vr) => {
            const matchingProposal = proposals.find(
              (p) => p.address === vr.account.proposal
            );
            const propState = matchingProposal?.account.state ?? 0;
            const isTerminal = FINAL_STATES.has(propState);
            const isUnlocked = vr.account.unlocked;

            return (
              <div
                key={vr.address}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 p-4 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">
                      Proposal #{matchingProposal?.account.proposalId.toString() || "?"}
                    </span>
                    {matchingProposal && <ProposalStateBadge state={propState} />}
                    <Badge variant="secondary" className="text-[10px]">
                      Voted {VOTE_SUPPORT_LABELS[vr.account.support]}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground truncate max-w-md">
                    {matchingProposal?.account.description || "Proposal description"}
                  </p>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground">Locked Weight</span>
                    <p className="font-bold tabular-nums">{vr.account.weight.toString()} Tokens</p>
                  </div>

                  {isUnlocked ? (
                    <Badge variant="outline" className="text-muted-foreground border-border/80 text-[10px]">
                      Unlocked ✓
                    </Badge>
                  ) : isTerminal ? (
                    <Button
                      size="sm"
                      onClick={() => unlockSingle(vr.account.proposal)}
                      disabled={isSending || !signer}
                      className="h-8 text-xs gap-1"
                    >
                      <Unlock className="h-3.5 w-3.5" /> Unlock Tokens
                    </Button>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-600 text-[10px]">
                      Locked (Active Vote)
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
