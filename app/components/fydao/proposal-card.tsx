import { useEffect, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCluster } from "@/app/components/cluster-context";
import { useSolanaClient } from "@/app/lib/solana-client-context";
import {
  useCampaigns,
  useDaoConfig,
  useFydaoTx,
  useFydaoWallet,
  useMilestones,
  useVoteRecord,
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
import { formatDate, formatRelative, truncate } from "@/app/lib/fydao/format";
import { rawToDecimal } from "@/app/lib/fydao/amount";
import { ACTION_LABELS, VOTE_SUPPORT_LABELS } from "@/app/lib/fydao/constants";
import type { Proposal } from "@/app/generated/fydao/accounts";
import { ProposalStateBadge } from "./status-badge";

const FINAL_STATES = new Set([2, 3, 6, 7]); // Canceled, Defeated, Expired, Executed

function describeAction(action: Proposal["action"]): { label: string; detail: string } {
  switch (action.__kind) {
    case "ApproveCampaign":
      return { label: ACTION_LABELS.ApproveCampaign, detail: truncate(action.campaign) };
    case "ReleaseMilestone":
      return {
        label: ACTION_LABELS.ReleaseMilestone,
        detail: `${truncate(action.campaign)} · #${action.milestoneId.toString()}`,
      };
    case "EmergencyWithdraw":
      return {
        label: ACTION_LABELS.EmergencyWithdraw,
        detail: `${truncate(action.campaign)} · ${rawToDecimal(action.amount, 6)} USDC`,
      };
    case "TransferAuthority":
      return {
        label: ACTION_LABELS.TransferAuthority,
        detail: truncate(action.newAuthority),
      };
  }
}

export function ProposalCard({
  proposal,
}: {
  proposal: { address: string; account: Proposal };
}) {
  const { getExplorerUrl } = useCluster();
  const client = useSolanaClient();
  const { address, signer } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();
  const { data: daoConfig } = useDaoConfig();
  const { data: campaigns } = useCampaigns();
  const { data: milestones } = useMilestones();
  const { data: voteRecord } = useVoteRecord(
    proposal.address as Proposal["proposer"],
    address ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 15_000);
    return () => clearInterval(id);
  }, []);

  const p = proposal.account;
  const act = p.action;
  const state = p.state;
  const { label, detail } = describeAction(act);

  const campaign =
    act.__kind !== "TransferAuthority"
      ? (campaigns ?? []).find((c) => c.address === act.campaign)
      : undefined;

  const isAuthority = address === daoConfig?.authority;
  const isProposer = address === p.proposer;
  const canVote =
    signer && state === 1 && voteRecord === null; // Active + not already voted
  const canQueue =
    signer && state === 4 && now >= Number(p.voteEnd); // Succeeded
  const canExecute =
    signer &&
    state === 5 &&
    now >= Number(p.eta) &&
    p.eta > 0n &&
    !p.executed;
  const canCancel =
    signer &&
    (state === 0 || state === 1 || state === 4 || state === 5) &&
    (isProposer || isAuthority) &&
    (state === 0 || state === 1 || isAuthority);
  const canUnlock =
    signer &&
    voteRecord &&
    !voteRecord.unlocked &&
    FINAL_STATES.has(state);

  const vote = async (support: number) => {
    if (!signer || !daoConfig) return;
    setBusy(true);
    try {
      await run("Casting vote", () =>
        castVoteActions({
          rpc: client.rpc,
          voter: signer,
          governanceMint: daoConfig.governanceMint,
          proposal: proposal.address as Proposal["proposer"],
          support,
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const queue = async () => {
    if (!signer) return;
    setBusy(true);
    try {
      await run("Queuing proposal", () =>
        queueProposalActions({
          authority: signer,
          proposal: proposal.address as Proposal["proposer"],
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!signer || !daoConfig) return;
    setBusy(true);
    try {
      switch (act.__kind) {
        case "ApproveCampaign":
          await run("Executing campaign approval", () =>
            approveCampaignActions({
              proposal: proposal.address as Proposal["proposer"],
              campaign: act.campaign,
            }),
          );
          break;
        case "ReleaseMilestone": {
          const ms = (milestones ?? []).find(
            (m) =>
              m.account.campaign === act.campaign &&
              m.account.milestoneId === act.milestoneId,
          );
          if (!campaign) break;
          if (!ms) throw new Error("Milestone account not found.");
          await run("Executing milestone release", () =>
            releaseMilestoneActions({
              proposal: proposal.address as Proposal["proposer"],
              campaign: act.campaign,
              campaignCreator: campaign.account.creator,
              stablecoinMint: daoConfig.stablecoinMint,
              milestone: ms.address,
              milestoneId: act.milestoneId,
            }),
          );
          break;
        }
        case "EmergencyWithdraw":
          await run("Executing emergency withdraw", () =>
            emergencyWithdrawActions({
              proposal: proposal.address as Proposal["proposer"],
              campaign: act.campaign,
              treasury: daoConfig.treasury,
              stablecoinMint: daoConfig.stablecoinMint,
              amount: act.amount,
            }),
          );
          break;
        case "TransferAuthority":
          await run("Executing authority transfer", () =>
            transferAuthorityActions({
              proposal: proposal.address as Proposal["proposer"],
            }),
          );
          break;
      }
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!signer) return;
    setBusy(true);
    try {
      await run("Canceling proposal", () =>
        cancelProposalActions({
          authority: signer,
          proposal: proposal.address as Proposal["proposer"],
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    if (!signer || !daoConfig) return;
    setBusy(true);
    try {
      await run("Unlocking votes", () =>
        unlockVotesActions({
          rpc: client.rpc,
          voter: signer,
          governanceMint: daoConfig.governanceMint,
          proposal: proposal.address as Proposal["proposer"],
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const totalVotes = p.forVotes + p.againstVotes + p.abstainVotes;

  return (
    <Card className="px-4">
      <CardHeader className="px-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">
                Proposal #{p.proposalId.toString()}
              </CardTitle>
              <ProposalStateBadge state={state} />
              {p.executed && <Badge variant="outline">executed</Badge>}
            </div>
            <p className="text-sm text-muted">{p.description}</p>
            <p className="text-xs text-muted">
              by{" "}
              <a
                className="font-mono underline-offset-2 hover:underline"
                href={getExplorerUrl(`/address/${p.proposer}`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {truncate(p.proposer)}
              </a>
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 space-y-4">
        <div className="rounded-lg bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted">Action</p>
          <p className="text-sm font-medium">
            {label} <span className="font-mono text-xs text-muted">{detail}</span>
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-lg bg-green-500/10 px-2 py-2">
            <p className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">
              {p.forVotes.toString()}
            </p>
            <p className="text-xs text-muted">For</p>
          </div>
          <div className="rounded-lg bg-destructive/10 px-2 py-2">
            <p className="text-lg font-semibold tabular-nums text-destructive">
              {p.againstVotes.toString()}
            </p>
            <p className="text-xs text-muted">Against</p>
          </div>
          <div className="rounded-lg bg-muted/30 px-2 py-2">
            <p className="text-lg font-semibold tabular-nums">
              {p.abstainVotes.toString()}
            </p>
            <p className="text-xs text-muted">Abstain</p>
          </div>
          <div className="rounded-lg bg-muted/30 px-2 py-2">
            <p className="text-lg font-semibold tabular-nums">
              {p.totalVotesAtCreation.toString()}
            </p>
            <p className="text-xs text-muted">Eligible</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-3">
          <span>Total cast: {totalVotes.toString()}</span>
          <span>Created: {formatRelative(p.createdAt)}</span>
          <span>
            Voting {p.voteStart > 0n ? formatRelative(p.voteStart) : "\u2014"} →{" "}
            {p.voteEnd > 0n ? formatRelative(p.voteEnd) : "\u2014"}
          </span>
          {p.queuedAt > 0n && <span>Queued: {formatDate(p.queuedAt)}</span>}
          {p.eta > 0n && <span>Executable: {formatDate(p.eta)}</span>}
        </div>

        {voteRecord && (
          <p className="text-xs text-muted">
            Your vote: {VOTE_SUPPORT_LABELS[voteRecord.support]} (
            {voteRecord.weight.toString()} votes)
            {voteRecord.unlocked ? " · unlocked" : " · locked"}
          </p>
        )}

        {state === 0 && p.voteStart > 0n && (
          <p className="text-xs text-muted">
            Voting starts in {formatRelative(p.voteStart)}.
          </p>
        )}

        <Separator />
      </CardContent>

      <CardFooter className="px-0 flex-wrap gap-2">
        {canVote && (
          <>
            <Button size="sm" onClick={() => vote(1)} disabled={busy || isSending}>
              For
            </Button>
            <Button size="sm" variant="outline" onClick={() => vote(2)} disabled={busy || isSending}>
              Abstain
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => vote(0)}
              disabled={busy || isSending}
            >
              Against
            </Button>
          </>
        )}
        {canQueue && (
          <Button size="sm" variant="secondary" onClick={queue} disabled={busy || isSending}>
            Queue for timelock
          </Button>
        )}
        {canExecute && (
          <Button size="sm" onClick={execute} disabled={busy || isSending}>
            Execute action
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="ghost" onClick={cancel} disabled={busy || isSending}>
            Cancel
          </Button>
        )}
        {canUnlock && (
          <Button size="sm" variant="outline" onClick={unlock} disabled={busy || isSending}>
            Unlock votes
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
