"use client";

import { use, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Navbar } from "../../../components/navbar";
import { GridBackground } from "../../../components/grid-background";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useCluster } from "@/app/components/cluster-context";
import { useSolanaClient } from "@/app/lib/solana-client-context";
import {
  useDaoConfig,
  useProposals,
  useCampaigns,
  useMilestones,
  useVoteRecords,
  useVoteRecord,
  useFydaoTx,
  useFydaoWallet,
  useTokenBalance,
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
import { ProposalStateBadge } from "../../../components/fydao/status-badge";
import {
  Vote,
  Clock,
  CheckCircle2,
  Lock,
  Unlock,
  Play,
  ExternalLink,
  Users,
  Timer,
  ArrowLeft,
  Share2,
  AlertTriangle,
  Layers,
  Shield,
  Check,
} from "lucide-react";
import { toast } from "sonner";

const FINAL_STATES = new Set([2, 3, 6, 7]); // Canceled, Defeated, Expired, Executed

export default function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const proposalIdentifier = resolvedParams.id;

  const { getExplorerUrl } = useCluster();
  const client = useSolanaClient();
  const { address, signer } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();
  const { data: daoConfig, isLoading: configLoading } = useDaoConfig();
  const { data: proposals, isLoading: proposalsLoading } = useProposals();
  const { data: campaigns } = useCampaigns();
  const { data: milestones } = useMilestones();
  const { data: allVoteRecords } = useVoteRecords();

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Find matching proposal
  const proposal = (proposals ?? []).find(
    (p) =>
      p.account.proposalId.toString() === proposalIdentifier ||
      p.address === proposalIdentifier
  );

  const { data: userVoteRecord } = useVoteRecord(
    (proposal?.address as Proposal["proposer"]) ?? null,
    (address as Address) ?? null
  );

  const { data: voterGovBalance } = useTokenBalance(
    (address as Address) ?? null,
    daoConfig?.governanceMint ?? null
  );

  const copyShareLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Proposal link copied to clipboard!");
    }
  };

  if ((proposalsLoading || configLoading) && !proposal) {
    return (
      <div className="relative min-h-screen bg-background text-foreground">
        <GridBackground />
        <Navbar />
        <main className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="h-96 rounded-3xl animate-pulse bg-muted/20 border border-border/40" />
        </main>
      </div>
    );
  }

  if (!proposal || !daoConfig) {
    return (
      <div className="relative min-h-screen bg-background text-foreground">
        <GridBackground />
        <Navbar />
        <main className="relative z-10 mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <Card className="p-12 border-dashed border-border/80">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <AlertTriangle className="h-7 w-7 text-amber-500" />
            </div>
            <h1 className="mt-4 text-2xl font-bold">Proposal Not Found</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              Could not find proposal <span className="font-mono font-semibold">{proposalIdentifier}</span> on this cluster.
            </p>
            <div className="mt-6">
              <Link href="/governance">
                <Button variant="secondary">Back to Governance Hub</Button>
              </Link>
            </div>
          </Card>
        </main>
      </div>
    );
  }

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

  const totalVotesCast = p.forVotes + p.againstVotes + p.abstainVotes;
  const snapshotSupply = p.totalVotesAtCreation;
  const quorumThreshold = snapshotSupply > 0n ? (snapshotSupply * BigInt(daoConfig.quorumBps)) / 10000n : 0n;
  const isQuorumReached = p.forVotes >= quorumThreshold;
  const quorumPct = quorumThreshold > 0n ? Math.min(100, Number((p.forVotes * 10000n) / quorumThreshold) / 100) : 0;

  const isAuthority = address === daoConfig?.authority;
  const isProposer = address === p.proposer;

  const canVote = signer && isVotingActive && userVoteRecord === null;
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
  const canUnlock = signer && userVoteRecord && !userVoteRecord.unlocked && FINAL_STATES.has(state);

  // Time calculations
  const timeUntilVotingEnds = p.voteEnd > 0n ? Number(p.voteEnd) - now : 0;
  const timeUntilTimelockElapses = p.eta > 0n ? Number(p.eta) - now : 0;
  const timeUntilExpiration = p.eta > 0n ? Number(p.eta) + 14 * 86400 - now : 0;

  // Votes for this proposal
  const proposalVotes = (allVoteRecords ?? []).filter(
    (vr) => vr.account.proposal === proposal.address
  );

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
        const ms = (milestones ?? []).find(
          (m) => m.account.campaign === act.campaign && m.account.milestoneId === act.milestoneId
        );
        const camp = (campaigns ?? []).find((c) => c.address === act.campaign);
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
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Navigation & Share */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/governance"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Governance Hub
          </Link>
          <Button variant="outline" size="sm" onClick={copyShareLink} className="gap-1.5 text-xs h-8">
            <Share2 className="h-3.5 w-3.5" /> Share Proposal
          </Button>
        </div>

        {/* Proposal Header Card */}
        <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-card via-card to-primary/5 p-6 sm:p-8 shadow-sm mb-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div className="space-y-3 max-w-3xl">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="font-bold text-xs">
                  Proposal #{p.proposalId.toString()}
                </Badge>
                <ProposalStateBadge state={effectiveState} />
                {p.executed && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                    Executed On-Chain
                  </Badge>
                )}
                <Badge variant="outline" className="font-mono text-xs capitalize">
                  {ACTION_LABELS[act.__kind] || act.__kind}
                </Badge>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {p.description}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                <div>
                  Proposer:{" "}
                  <a
                    href={getExplorerUrl(`/address/${p.proposer}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-medium text-foreground underline hover:text-primary"
                  >
                    {truncate(p.proposer)}
                  </a>
                  {isProposer && <Badge variant="outline" className="ml-1.5 text-[10px] text-primary">You</Badge>}
                </div>
                <div>
                  Snapshot Supply: <strong className="text-foreground font-mono">{snapshotSupply.toString()}</strong>
                </div>
                <div>
                  Created: <strong className="text-foreground">{formatDate(p.createdAt)}</strong>
                </div>
              </div>
            </div>

            {/* Quick Action Panel */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canVote && (
                <>
                  <Button size="sm" onClick={() => vote(1)} disabled={isSending} className="bg-green-600 hover:bg-green-700 text-white text-xs h-9">
                    Vote For
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => vote(2)} disabled={isSending} className="text-xs h-9">
                    Abstain
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => vote(0)} disabled={isSending} className="text-xs h-9">
                    Vote Against
                  </Button>
                </>
              )}

              {canQueue && (
                <Button size="sm" variant="secondary" onClick={queue} disabled={isSending} className="gap-1.5 text-xs h-9">
                  <Clock className="h-4 w-4" /> Queue for Timelock
                </Button>
              )}

              {canExecute && (
                <Button size="sm" onClick={execute} disabled={isSending} className="gap-1.5 text-xs h-9 bg-green-600 hover:bg-green-700 text-white shadow-md">
                  <Play className="h-4 w-4" /> Execute Action Now
                </Button>
              )}

              {canUnlock && (
                <Button size="sm" variant="outline" onClick={unlock} disabled={isSending} className="gap-1.5 text-xs h-9">
                  <Unlock className="h-4 w-4" /> Unlock My Tokens
                </Button>
              )}
            </div>
          </div>

          {/* Timelock & Status Banners */}
          {isVotingActive && timeUntilVotingEnds > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 p-3 text-primary font-medium text-xs">
              <Timer className="h-4 w-4 shrink-0" />
              <span>Voting is Active · Closes in {Math.floor(timeUntilVotingEnds / 86400)}d {Math.floor((timeUntilVotingEnds % 86400) / 3600)}h {Math.floor((timeUntilVotingEnds % 3600) / 60)}m</span>
            </div>
          )}

          {state === 0 && !isVotingActive && Number(p.voteStart) > now && (
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 border border-border/60 p-3 text-muted-foreground font-medium text-xs">
              <Clock className="h-4 w-4 shrink-0" />
              <span>Voting starts in {formatRelative(p.voteStart)}</span>
            </div>
          )}

          {state === 5 && timeUntilTimelockElapses > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-amber-600 dark:text-amber-400 font-medium text-xs">
              <Clock className="h-4 w-4 shrink-0" />
              <span>Timelock Delay Active · Executable in {Math.floor(timeUntilTimelockElapses / 3600)}h {Math.floor((timeUntilTimelockElapses % 3600) / 60)}m {timeUntilTimelockElapses % 60}s</span>
            </div>
          )}

          {state === 5 && isExecutable && (
            <div className="flex items-center justify-between rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-green-600 dark:text-green-400 font-medium text-xs">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 shrink-0" />
                <span>Timelock Delay Cleared! This proposal is ready for permissionless execution ({Math.floor(timeUntilExpiration / 86400)}d remaining in execution window).</span>
              </div>
            </div>
          )}
        </div>

        {/* Two Column Grid */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column: Action Details & Timelock Stepper */}
          <div className="lg:col-span-2 space-y-6">
            {/* Target Action Details */}
            <Card className="border-border/60 p-6 space-y-4">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> Target Proposal Action
              </h2>
              <Separator />

              <div className="rounded-2xl bg-muted/20 border border-border/80 p-4 space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-muted-foreground">Action Type:</span>
                  <Badge variant="secondary" className="font-mono">{act.__kind}</Badge>
                </div>

                {act.__kind === "ApproveCampaign" && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Target Campaign PDA:</span>
                      <a
                        href={getExplorerUrl(`/address/${act.campaign}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-primary hover:underline flex items-center gap-1"
                      >
                        {truncate(act.campaign)} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="text-muted-foreground pt-1">
                      Upon execution, flips <code className="text-foreground font-mono">campaign.is_live = true</code>, opening the escrow vault for public stablecoin donations.
                    </p>
                    <Link href={`/campaigns/${act.campaign}`}>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 mt-2">
                        View Campaign Profile <ExternalLink className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                )}

                {act.__kind === "ReleaseMilestone" && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Target Campaign PDA:</span>
                      <span className="font-mono">{truncate(act.campaign)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Milestone Tranche Number:</span>
                      <span className="font-bold font-mono">#{act.milestoneId.toString()}</span>
                    </div>
                    <p className="text-muted-foreground pt-1">
                      Upon execution, atomically transfers the milestone tranche from the Campaign Escrow PDA to the creator ATA and reclaims the Milestone PDA rent.
                    </p>
                  </div>
                )}

                {act.__kind === "EmergencyWithdraw" && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Target Campaign PDA:</span>
                      <span className="font-mono">{truncate(act.campaign)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Drain Amount:</span>
                      <span className="font-bold text-destructive font-mono">{rawToDecimal(act.amount, 6)} USDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pinned Treasury Destination:</span>
                      <span className="font-mono">{truncate(daoConfig.treasury)}</span>
                    </div>
                  </div>
                )}

                {act.__kind === "TransferAuthority" && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nominated New Authority:</span>
                      <span className="font-mono font-bold text-foreground">{act.newAuthority}</span>
                    </div>
                    <p className="text-muted-foreground pt-1">
                      Step 1 of two-step authority handover. Sets <code className="text-foreground font-mono">pending_authority</code>. The new authority must sign <code className="text-foreground font-mono">accept_authority</code> to claim.
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Timelock & Execution Lifecycle Stepper */}
            <Card className="border-border/60 p-6 space-y-4">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Timelock Lifecycle &amp; Security Gate
              </h2>
              <Separator />

              <div className="space-y-4 text-xs">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-green-600 font-bold text-xs">
                    ✓
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-foreground">1. Proposal Created &amp; Supply Snapshotted</p>
                    <p className="text-muted-foreground">Recorded on Solana with total eligible quorum base of {snapshotSupply.toString()} tokens.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-bold text-xs ${
                    state >= 1 ? "bg-green-500/20 text-green-600" : "bg-muted text-muted-foreground"
                  }`}>
                    {state > 1 ? "✓" : "2"}
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-foreground">2. Active Voting Period ({formatDuration(daoConfig.votingPeriod)})</p>
                    <p className="text-muted-foreground">Voters lock tokens into per-voter escrows. Voting ended {p.voteEnd > 0n ? formatDate(p.voteEnd) : "—"}.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-bold text-xs ${
                    state === 5 || state === 7 ? "bg-green-500/20 text-green-600" : "bg-muted text-muted-foreground"
                  }`}>
                    {state === 7 ? "✓" : "3"}
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-foreground">3. Timelock Delay ({formatDuration(daoConfig.timelockDelay)})</p>
                    <p className="text-muted-foreground">Mandatory cool-off delay. ETA: {p.eta > 0n ? formatDate(p.eta) : "Pending Queue"}.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-bold text-xs ${
                    state === 7 ? "bg-green-500/20 text-green-600" : isExecutable ? "bg-primary text-primary-foreground animate-pulse" : "bg-muted text-muted-foreground"
                  }`}>
                    {state === 7 ? "✓" : "4"}
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-foreground">4. Permissionless Atomic Execution</p>
                    <p className="text-muted-foreground">
                      {state === 7
                        ? "Executed atomically on-chain. State finalized."
                        : isExecutable
                        ? "Open for any user or bot to trigger execution."
                        : "Pending timelock expiration."}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Voter Receipts Table */}
            <Card className="border-border/60 p-6 space-y-4">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> On-Chain Voter Receipts ({proposalVotes.length})
              </h2>
              <Separator />

              {proposalVotes.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2 text-center">
                  No voter receipts registered on-chain yet for this proposal.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
                  {proposalVotes.map((vr) => (
                    <div
                      key={vr.address}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 p-3"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-foreground">
                            {truncate(vr.account.voter)}
                          </span>
                          {vr.account.voter === address && (
                            <Badge variant="outline" className="text-[10px] text-primary">You</Badge>
                          )}
                          <Badge
                            variant="secondary"
                            className={
                              vr.account.support === 1
                                ? "bg-green-500/15 text-green-600 text-[10px]"
                                : vr.account.support === 0
                                ? "bg-destructive/15 text-destructive text-[10px]"
                                : "text-[10px]"
                            }
                          >
                            {VOTE_SUPPORT_LABELS[vr.account.support]}
                          </Badge>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-bold tabular-nums">{vr.account.weight.toString()} Tokens</p>
                        <span className="text-[10px] text-muted-foreground">
                          {vr.account.unlocked ? "Unlocked ✓" : "Locked in Escrow"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right Column: Quorum & Vote Gauge */}
          <div className="space-y-6">
            {/* Quorum Progress Card */}
            <Card className="border-border/60 p-6 space-y-4">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Vote className="h-4 w-4 text-primary" /> Voting &amp; Quorum Gauge
              </h3>
              <Separator />

              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex justify-between text-xs pb-1.5">
                    <span className="text-muted-foreground">Quorum Progress</span>
                    <span className="font-bold font-mono">
                      {p.forVotes.toString()} / {quorumThreshold.toString()} votes ({quorumPct.toFixed(1)}%)
                    </span>
                  </div>
                  <Progress value={quorumPct} className="h-2" />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {isQuorumReached
                      ? "✓ Quorum threshold achieved!"
                      : `Quorum needed: ${quorumThreshold > p.forVotes ? (quorumThreshold - p.forVotes).toString() : "0"} more For votes.`}
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-green-600 font-semibold">
                      <span className="h-2 w-2 rounded-full bg-green-600" /> For
                    </span>
                    <span className="font-mono font-bold">{p.forVotes.toString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-destructive font-semibold">
                      <span className="h-2 w-2 rounded-full bg-destructive" /> Against
                    </span>
                    <span className="font-mono font-bold">{p.againstVotes.toString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-muted-foreground font-semibold">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Abstain
                    </span>
                    <span className="font-mono font-bold">{p.abstainVotes.toString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t">
                    <span className="text-muted-foreground">Total Cast:</span>
                    <span className="font-mono font-bold">{totalVotesCast.toString()} votes</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Voter Token Escrow Info */}
            <Card className="border-border/60 p-6 bg-muted/15 space-y-3 text-xs">
              <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
                <Lock className="h-4 w-4 text-primary" /> Anti-Buy-Vote-Dump Escrow
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Arthasetu locks voted tokens into a voter-specific escrow ATA for the duration of the proposal. Once the proposal reaches a final state (Executed, Defeated, Expired, or Canceled), click <strong>Unlock Tokens</strong> to reclaim full token balances and rent.
              </p>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
