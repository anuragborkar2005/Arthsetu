"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Navbar } from "../components/navbar";
import { GridBackground } from "../components/grid-background";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCluster } from "@/app/components/cluster-context";
import {
  useCampaigns,
  useDaoConfig,
  useDonationRecords,
  useMilestones,
  useFydaoTx,
  useFydaoWallet,
} from "@/app/lib/hooks/use-fydao";
import { useCampaignMetadata } from "@/app/lib/hooks/use-campaign-metadata";
import { claimRefundActions } from "@/app/lib/fydao/actions";
import { rawToDecimal } from "@/app/lib/fydao/amount";
import { truncate, formatCompact } from "@/app/lib/fydao/format";
import { resolveIpfsUrl } from "@/app/lib/ipfs";
import type { Address } from "@solana/kit";
import type { Campaign, DonationRecord } from "@/app/generated/fydao/accounts";
import { CampaignStatusBadge } from "../components/fydao/status-badge";
import { ConnectGate } from "../components/fydao/shared";
import {
  HeartHandshake,
  ShieldAlert,
  Coins,
  ShieldCheck,
  ExternalLink,
  Receipt,
  ArrowRight,
  Sparkles,
  Milestone as MilestoneIcon,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export default function DonorPortfolioPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <ConnectGate>
          <DonorPortfolioContent />
        </ConnectGate>
      </main>
    </div>
  );
}

function DonorPortfolioContent() {
  const { getExplorerUrl } = useCluster();
  const { address, signer } = useFydaoWallet();
  const { data: daoConfig } = useDaoConfig();
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();
  const { data: donationRecords, isLoading: donationsLoading } = useDonationRecords();
  const { data: allMilestones } = useMilestones();
  const { run, isSending } = useFydaoTx();

  const [receiptCampaign, setReceiptCampaign] = useState<{
    campaign: { address: string; account: Campaign };
    donation: { address: string; account: DonationRecord };
  } | null>(null);

  // Filter donation records belonging to connected wallet
  const myDonations = useMemo(() => {
    if (!address || !donationRecords) return [];
    return donationRecords.filter((d) => d.account.donor === address);
  }, [address, donationRecords]);

  // Aggregate stats
  const totalContributedRaw = myDonations.reduce(
    (sum, d) => sum + d.account.amount,
    0n
  );

  // Match donations with campaign accounts
  const backedCampaignsData = useMemo(() => {
    return myDonations.map((donation) => {
      const match = (campaigns ?? []).find(
        (c) => c.address === donation.account.campaign
      );
      return {
        donation,
        campaign: match,
      };
    });
  }, [myDonations, campaigns]);

  // Refund Scanner: Find campaigns that suffered emergency_withdraw and have claimable amount
  const refundableItems = useMemo(() => {
    return backedCampaignsData.filter(
      (item) => item.campaign?.account.emergencyWithdrawn && item.donation.account.amount > 0n
    );
  }, [backedCampaignsData]);

  const handleClaimRefund = async (campaignAddress: string) => {
    if (!signer || !daoConfig) return;
    await run("Claiming Pro-Rata Emergency Refund", () =>
      claimRefundActions({
        donor: signer,
        campaign: campaignAddress as Address,
        stablecoinMint: daoConfig.stablecoinMint,
      })
    );
  };

  return (
    <div className="space-y-8">
      {/* Header & Impact Summary */}
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-card via-card to-primary/5 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <HeartHandshake className="h-4 w-4" /> Backer Impact Portfolio
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              My Backed Campaigns &amp; Recourse
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
              Track all projects you have funded on Solana. Your stablecoin deposits are protected by non-custodial escrows, verified milestone releases, and cryptographic donor clawbacks.
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/80 p-4 font-mono text-xs space-y-1 shrink-0 backdrop-blur-sm">
            <p className="text-muted-foreground">Connected Backer:</p>
            <p className="font-bold text-foreground">{truncate(address || "")} <span className="text-primary font-sans font-semibold">(Verified)</span></p>
            <a
              href={getExplorerUrl(`/address/${address}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1 pt-1"
            >
              View on Explorer <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-6 pt-6 border-t border-border/40">
          <div>
            <span className="text-xs text-muted-foreground">Total Contributed</span>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {rawToDecimal(totalContributedRaw, 6)} USDC
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Campaigns Backed</span>
            <p className="text-2xl font-bold tabular-nums text-primary">
              {myDonations.length}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Active Protections</span>
            <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
              Escrow PDA (M4)
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Refund Alerts</span>
            <p className={`text-2xl font-bold tabular-nums ${refundableItems.length > 0 ? "text-destructive animate-pulse" : "text-foreground"}`}>
              {refundableItems.length > 0 ? `${refundableItems.length} Available` : "0 Active"}
            </p>
          </div>
        </div>
      </div>

      {/* Emergency Refund Scanner Alert (Security Audit M4) */}
      {refundableItems.length > 0 && (
        <Card className="border-destructive/60 bg-destructive/5 p-6 shadow-md space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground shadow-sm">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-destructive">
                  Emergency Refund Available ({refundableItems.length} Campaign{refundableItems.length > 1 ? "s" : ""})
                </h3>
                <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                  The DAO passed an Emergency Withdrawal on campaign(s) you funded. Under Arthasetu Protocol Security (Audit M4), you are entitled to a pro-rata refund of remaining escrow funds directly to your wallet.
                </p>
              </div>
            </div>
          </div>

          <Separator className="border-destructive/20" />

          <div className="space-y-3">
            {refundableItems.map((item) => (
              <div
                key={item.donation.address}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-destructive/30 bg-background/90 p-4 text-xs shadow-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <span className="font-bold text-foreground text-sm">
                    Campaign #{item.campaign?.account.campaignId.toString() || truncate(item.donation.account.campaign)}
                  </span>
                  <p className="text-muted-foreground font-mono text-[11px]">
                    Eligible Claim: <strong className="text-destructive font-bold">{rawToDecimal(item.donation.account.amount, 6)} USDC</strong>
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleClaimRefund(item.donation.account.campaign)}
                  disabled={isSending}
                  className="h-9 text-xs gap-1.5 shrink-0 shadow-sm"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Claim Pro-Rata Refund Now
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Backed Campaigns List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" /> Backed Campaigns History ({myDonations.length})
          </h2>
          <Link href="/explore">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
              Explore More Campaigns <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        {myDonations.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-border/80">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <HeartHandshake className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold">You Haven&apos;t Backed Any Campaigns Yet</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Browse live crowdfunding campaigns on Solana and support creators with escrow-backed donations.
            </p>
            <div className="mt-6">
              <Link href="/explore">
                <Button size="sm" className="gap-1.5">
                  <Search className="h-4 w-4" /> Explore Live Campaigns
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {backedCampaignsData.map((item) => (
              <BackedCampaignCard
                key={item.donation.address}
                donation={item.donation}
                campaign={item.campaign}
                milestones={(allMilestones ?? []).filter(
                  (m) => m.account.campaign === item.donation.account.campaign
                )}
                onViewReceipt={() => {
                  if (item.campaign) {
                    setReceiptCampaign({
                      campaign: item.campaign,
                      donation: item.donation,
                    });
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Receipt Modal */}
      {receiptCampaign && (
        <ContributionReceiptModal
          data={receiptCampaign}
          open={Boolean(receiptCampaign)}
          onClose={() => setReceiptCampaign(null)}
        />
      )}
    </div>
  );
}

function BackedCampaignCard({
  donation,
  campaign,
  milestones,
  onViewReceipt,
}: {
  donation: { address: string; account: DonationRecord };
  campaign?: { address: string; account: Campaign };
  milestones: Array<{ address: string; account: any }>;
  onViewReceipt: () => void;
}) {
  const { data: metadata } = useCampaignMetadata(campaign?.account.metadataCid);
  const c = campaign?.account;

  const releasedCount = milestones.filter((m) => m.account.released).length;
  const bannerImg = metadata?.bannerUrl ? resolveIpfsUrl(metadata.bannerUrl) : null;

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm flex flex-col justify-between">
      <div>
        {bannerImg && (
          <div className="relative h-32 w-full overflow-hidden bg-muted">
            <img src={bannerImg} alt="banner" className="h-full w-full object-cover" />
            <div className="absolute top-3 right-3">
              {c && <CampaignStatusBadge isLive={c.isLive} emergencyWithdrawn={c.emergencyWithdrawn} />}
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

        <CardHeader className="p-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold truncate">
                  {metadata?.title || `Campaign #${c?.campaignId.toString() || truncate(donation.account.campaign)}`}
                </CardTitle>
                {!bannerImg && c && (
                  <CampaignStatusBadge isLive={c.isLive} emergencyWithdrawn={c.emergencyWithdrawn} />
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {metadata?.tagline || `Funded campaign on Solana`}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 pt-0 space-y-4 text-xs">
          {/* User Contribution Box */}
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Your Lifetime Contribution</span>
              <p className="text-lg font-bold text-primary tabular-nums">
                {rawToDecimal(donation.account.amount, 6)} USDC
              </p>
            </div>
            {c && (
              <div className="text-right">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Campaign Total Raised</span>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {rawToDecimal(c.totalDeposited, 6)} USDC
                </p>
              </div>
            )}
          </div>

          {/* Milestone Status */}
          {c && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Milestones Delivered</span>
                <span className="font-semibold text-foreground">{releasedCount} of {c.milestoneCount.toString()} Released</span>
              </div>
              <Progress
                value={c.milestoneCount > 0n ? (releasedCount * 100) / Number(c.milestoneCount) : 0}
                className="h-1.5"
              />
            </div>
          )}
        </CardContent>
      </div>

      <CardFooter className="p-4 pt-0 flex items-center justify-between gap-2 border-t border-border/40 bg-muted/10">
        <Button size="sm" variant="ghost" onClick={onViewReceipt} className="h-8 text-xs gap-1.5">
          <Receipt className="h-3.5 w-3.5" /> View Receipt
        </Button>

        {c && (
          <Link href={`/campaigns/${c.campaignId.toString()}`}>
            <Button size="sm" variant="secondary" className="h-8 text-xs gap-1">
              Campaign Page <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}

function ContributionReceiptModal({
  data,
  open,
  onClose,
}: {
  data: {
    campaign: { address: string; account: Campaign };
    donation: { address: string; account: DonationRecord };
  };
  open: boolean;
  onClose: () => void;
}) {
  const { getExplorerUrl } = useCluster();
  const { data: metadata } = useCampaignMetadata(data.campaign.account.metadataCid);

  const copyReceipt = () => {
    if (typeof window !== "undefined") {
      const receiptText = `Arthasetu Contribution Receipt\nCampaign: ${metadata?.title || data.campaign.account.campaignId.toString()}\nCampaign PDA: ${data.campaign.address}\nDonor: ${data.donation.account.donor}\nAmount: ${rawToDecimal(data.donation.account.amount, 6)} USDC\nDonation PDA: ${data.donation.address}`;
      navigator.clipboard.writeText(receiptText);
      toast.success("Receipt details copied to clipboard!");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-5 w-5 text-primary" /> Cryptographic Contribution Receipt
          </DialogTitle>
          <DialogDescription className="text-xs">
            Proof of donation recorded on the Solana blockchain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 rounded-2xl border border-border/80 bg-muted/20 p-4 text-xs font-mono">
          <div className="space-y-1 pb-3 border-b border-border/60 font-sans">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Campaign</span>
            <p className="font-bold text-sm text-foreground">{metadata?.title || `Campaign #${data.campaign.account.campaignId.toString()}`}</p>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Contributed Amount:</span>
            <span className="font-bold text-primary text-sm font-sans tabular-nums">
              {rawToDecimal(data.donation.account.amount, 6)} USDC
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Donor Address:</span>
            <span className="truncate max-w-[180px]">{truncate(data.donation.account.donor)}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Campaign PDA:</span>
            <span className="truncate max-w-[180px]">{truncate(data.campaign.address)}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground font-sans">Donation PDA:</span>
            <span className="truncate max-w-[180px]">{truncate(data.donation.address)}</span>
          </div>

          <div className="pt-2 border-t border-border/60 flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground font-sans">Solana On-Chain Status:</span>
            <Badge variant="outline" className="bg-green-500/10 text-green-600 text-[10px] font-sans">
              Recorded on SVM ✓
            </Badge>
          </div>
        </div>

        <DialogFooter className="flex justify-between gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={copyReceipt} className="text-xs">
            Copy Receipt Details
          </Button>
          <a
            href={getExplorerUrl(`/address/${data.donation.address}`)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" className="text-xs gap-1">
              View on Explorer <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
