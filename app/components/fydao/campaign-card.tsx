"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCluster } from "@/app/components/cluster-context";
import { useSolanaClient } from "@/app/lib/solana-client-context";
import {
  useDaoConfig,
  useFydaoTx,
  useFydaoWallet,
  useMilestones,
} from "@/app/lib/hooks/use-fydao";
import { useCampaignMetadata } from "@/app/lib/hooks/use-campaign-metadata";
import {
  claimRefundActions,
  donateActions,
} from "@/app/lib/fydao/actions";
import { parseTokenAmount, rawToDecimal } from "@/app/lib/fydao/amount";
import { truncate } from "@/app/lib/fydao/format";
import { resolveIpfsUrl } from "@/app/lib/ipfs";
import type { Address } from "@solana/kit";
import type { Campaign } from "@/app/generated/fydao/accounts";
import { CampaignStatusBadge } from "./status-badge";
import { ProposeMilestoneDialog } from "./milestone-dialog";
import { CreateProposalDialog } from "./create-proposal-dialog";
import { Globe, Shield, ExternalLink, Sparkles } from "lucide-react";

const DECIMALS = 6;

export function CampaignCard({
  campaign,
}: {
  campaign: { address: string; account: Campaign };
}) {
  const { getExplorerUrl } = useCluster();
  const client = useSolanaClient();
  const { address, signer } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();
  const { data: daoConfig } = useDaoConfig();
  const { data: allMilestones } = useMilestones();
  const [donation, setDonation] = useState("");
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);

  const c = campaign.account;
  const { data: metadata } = useCampaignMetadata(c.metadataCid);
  const stablecoinMint = daoConfig?.stablecoinMint;
  const milestones = (allMilestones ?? []).filter((m) => m.account.campaign === campaign.address);
  const isCreator = address === c.creator;
  const isLive = c.isLive && !c.emergencyWithdrawn;

  const donate = async () => {
    if (!signer || !stablecoinMint) return;
    const raw = parseTokenAmount(donation, DECIMALS);
    if (!raw || raw <= 0n) return;
    await run("Donating to Escrow", () =>
      donateActions({
        rpc: client.rpc,
        donor: signer,
        campaign: campaign.address as Address,
        stablecoinMint,
        amount: raw,
      }),
    );
    setDonation("");
  };

  const claimRefund = async () => {
    if (!signer || !stablecoinMint) return;
    await run("Claiming refund", () =>
      claimRefundActions({
        donor: signer,
        campaign: campaign.address as Address,
        stablecoinMint,
      }),
    );
  };

  const releasedPct =
    c.totalDeposited > 0n
      ? Number((c.totalReleased * 10000n) / c.totalDeposited) / 100
      : 0;

  const bannerImg = metadata?.bannerUrl ? resolveIpfsUrl(metadata.bannerUrl) : null;

  return (
    <Card className="overflow-hidden border-border/80 transition-shadow hover:shadow-md">
      {bannerImg && (
        <div className="relative h-32 w-full overflow-hidden bg-muted">
          <Image
            src={bannerImg}
            alt={metadata?.title || "Campaign banner"}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover"
          />
          <div className="absolute top-3 right-3">
            <CampaignStatusBadge
              isLive={c.isLive}
              emergencyWithdrawn={c.emergencyWithdrawn}
            />
          </div>
          {metadata?.category && (
            <div className="absolute bottom-3 left-3">
              <Badge variant="secondary" className="backdrop-blur-md bg-background/80 capitalize text-xs">
                {metadata.category}
              </Badge>
            </div>
          )}
        </div>
      )}

      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-bold truncate">
                {metadata?.title || `Campaign #${c.campaignId.toString()}`}
              </CardTitle>
              {!bannerImg && (
                <CampaignStatusBadge
                  isLive={c.isLive}
                  emergencyWithdrawn={c.emergencyWithdrawn}
                />
              )}
            </div>

            {metadata?.tagline && (
              <p className="text-xs text-muted-foreground line-clamp-2">{metadata.tagline}</p>
            )}

            <p className="text-xs text-muted-foreground">
              by{" "}
              <a
                className="font-mono underline-offset-2 hover:underline text-foreground"
                href={getExplorerUrl(`/address/${c.creator}`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {truncate(c.creator)}
              </a>
              {isCreator && <span className="ml-1 text-primary font-semibold">(you)</span>}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 py-2 space-y-4">
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/25 p-2.5 text-center text-xs">
          <div>
            <p className="text-[11px] text-muted-foreground">Trust Score</p>
            <p className="font-bold tabular-nums text-foreground">{c.trustScore.toString()}/100</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Milestones</p>
            <p className="font-bold tabular-nums text-foreground">
              {milestones.filter((m) => m.account.released).length}/{c.milestoneCount.toString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Verifier</p>
            <p className="font-mono text-[11px] truncate">
              {truncate(c.verifier)}
              {c.verifier === address && (
                <span className="ml-0.5 text-green-600 dark:text-green-400 font-semibold">*</span>
              )}
            </p>
          </div>
        </div>

        {c.metadataCid && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
            <span className="truncate">IPFS: {c.metadataCid}</span>
            <a
              href={`https://ipfs.io/ipfs/${c.metadataCid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline shrink-0 flex items-center gap-0.5"
            >
              View <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Escrow Raised</span>
            <span className="font-semibold tabular-nums text-foreground">
              {rawToDecimal(c.totalDeposited, DECIMALS)} USDC
              {metadata?.targetFundingUsdc && (
                <span className="text-muted-foreground font-normal"> / {metadata.targetFundingUsdc} goal</span>
              )}
            </span>
          </div>
          <Progress value={releasedPct} className="h-2" />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{releasedPct.toFixed(1)}% released</span>
            <span className="tabular-nums">
              {rawToDecimal(c.totalReleased, DECIMALS)} USDC released
            </span>
          </div>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Milestone Releases</p>
          {milestones.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No milestones proposed yet
              {isCreator && c.isLive && " — propose the first one below."}
            </p>
          )}
          <ul className="space-y-1.5">
            {milestones.map((m) => (
              <li
                key={m.address}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    #{m.account.milestoneId.toString()} ·{" "}
                    {rawToDecimal(m.account.amount, DECIMALS)} USDC
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    proof: {m.account.proofCid}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    m.account.released
                      ? "bg-green-500/15 text-green-600 dark:text-green-400 shrink-0 text-[10px]"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0 text-[10px]"
                  }
                >
                  {m.account.released ? "Released" : "Pending Release"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        {isLive && signer && (
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={donation}
              onChange={(e) => setDonation(e.target.value)}
              placeholder="Amount (USDC)"
              inputMode="decimal"
              className="h-9 text-xs max-w-36"
            />
            <Button size="sm" onClick={donate} disabled={isSending} className="h-9 text-xs">
              Donate USDC
            </Button>
          </div>
        )}

        {c.emergencyWithdrawn && (
          <p className="text-xs text-destructive rounded-lg bg-destructive/10 p-2.5">
            This campaign was emergency-withdrawn. Donors can claim their pro-rata refund from the remaining escrow.
          </p>
        )}
      </CardContent>

      <CardFooter className="px-4 py-3 flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-muted/10">
        <a
          href={`/campaigns/${c.campaignId.toString()}`}
          className="text-xs font-semibold text-primary hover:underline"
        >
          View Details &amp; AI Audit →
        </a>

        <div className="flex items-center gap-1.5 flex-wrap">
          {isCreator && c.isLive && (
            <Button size="sm" variant="secondary" onClick={() => setMilestoneOpen(true)} className="h-8 text-xs">
              Propose Milestone
            </Button>
          )}
          {!c.isLive && (
            <Button size="sm" variant="secondary" onClick={() => setApprovalOpen(true)} className="h-8 text-xs">
              Propose Approval
            </Button>
          )}
          {c.emergencyWithdrawn && (
            <Button size="sm" variant="destructive" onClick={claimRefund} disabled={!signer} className="h-8 text-xs">
              Claim Refund
            </Button>
          )}
        </div>
      </CardFooter>

      {milestoneOpen && (
        <ProposeMilestoneDialog
          campaign={c}
          campaignAddress={campaign.address as Address}
          onClose={() => setMilestoneOpen(false)}
        />
      )}
      {approvalOpen && (
        <CreateProposalDialog
          open={approvalOpen}
          onOpenChange={setApprovalOpen}
          campaigns={[{ address: campaign.address, account: c }]}
          defaultKind="ApproveCampaign"
          defaultCampaign={campaign.address}
        />
      )}
      {releaseOpen && (
        <CreateProposalDialog
          open={releaseOpen}
          onOpenChange={setReleaseOpen}
          campaigns={[{ address: campaign.address, account: c }]}
          milestones={milestones}
          defaultKind="ReleaseMilestone"
          defaultCampaign={campaign.address}
        />
      )}
    </Card>
  );
}
