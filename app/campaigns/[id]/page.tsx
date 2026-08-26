"use client";

import { use, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "../../components/navbar";
import { GridBackground } from "../../components/grid-background";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCluster } from "@/app/components/cluster-context";
import { useSolanaClient } from "@/app/lib/solana-client-context";
import {
  useCampaigns,
  useDaoConfig,
  useFydaoTx,
  useFydaoWallet,
  useMilestones,
  useTokenBalance,
} from "@/app/lib/hooks/use-fydao";
import { useCampaignMetadata } from "@/app/lib/hooks/use-campaign-metadata";
import { claimRefundActions, donateActions } from "@/app/lib/fydao/actions";
import { parseTokenAmount, rawToDecimal } from "@/app/lib/fydao/amount";
import { truncate } from "@/app/lib/fydao/format";
import { fetchMetadataByCid, resolveIpfsUrl, type MilestoneProofMetadata } from "@/app/lib/ipfs";
import type { Address } from "@solana/kit";
import { CampaignStatusBadge } from "../../components/fydao/status-badge";
import { ProposeMilestoneDialog } from "../../components/fydao/milestone-dialog";
import { CreateProposalDialog } from "../../components/fydao/create-proposal-dialog";
import { MarkdownContent } from "../../components/markdown-content";
import {
  ShieldCheck,
  Coins,
  Milestone as MilestoneIcon,
  ExternalLink,
  Globe,
  Code2,
  MessageCircle,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Share2,
  Cpu,
  FileCheck2,
  FileText,
  Layers,
  Vote,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";

const DECIMALS = 6;
const PRESET_AMOUNTS = ["25", "50", "100", "250", "500"];

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const campaignIdentifier = resolvedParams.id;

  const { getExplorerUrl } = useCluster();
  const client = useSolanaClient();
  const { address, signer } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();
  const { data: campaigns, isLoading } = useCampaigns();
  const { data: allMilestones } = useMilestones();
  const { data: daoConfig } = useDaoConfig();

  const [donationAmount, setDonationAmount] = useState("100");
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Inspector modal for milestone deliverable proofs
  const [inspectedMilestone, setInspectedMilestone] = useState<{
    id: bigint;
    amount: bigint;
    proofCid: string;
    verifiedBy: string;
    released: boolean;
  } | null>(null);
  const [inspectedProofData, setInspectedProofData] = useState<MilestoneProofMetadata | null>(null);
  const [proofLoading, setProofLoading] = useState(false);

  // Find matching campaign by ID or Address
  const campaign = (campaigns ?? []).find(
    (c) =>
      c.account.campaignId.toString() === campaignIdentifier ||
      c.address === campaignIdentifier
  );

  const c = campaign?.account;
  const { data: metadata, isLoading: isMetaLoading } = useCampaignMetadata(
    c?.metadataCid
  );
  const stablecoinMint = daoConfig?.stablecoinMint;

  const { data: donorBalance } = useTokenBalance(
    (address as Address) ?? null,
    stablecoinMint ?? null
  );

  const milestones = (allMilestones ?? []).filter(
    (m) => m.account.campaign === campaign?.address
  );

  const isCreator = address === c?.creator;
  const isVerifier = address === c?.verifier;
  const isLive = c?.isLive && !c?.emergencyWithdrawn;

  const handleDonate = async () => {
    if (!signer || !stablecoinMint || !campaign) return;
    const raw = parseTokenAmount(donationAmount, DECIMALS);
    if (!raw || raw <= 0n) {
      toast.error("Please enter a valid donation amount");
      return;
    }
    await run("Donating USDC to Escrow", () =>
      donateActions({
        rpc: client.rpc,
        donor: signer,
        campaign: campaign.address as Address,
        stablecoinMint,
        amount: raw,
      })
    );
    setDonationAmount("");
  };

  const handleClaimRefund = async () => {
    if (!signer || !stablecoinMint || !campaign) return;
    await run("Claiming Pro-Rata Refund", () =>
      claimRefundActions({
        donor: signer,
        campaign: campaign.address as Address,
        stablecoinMint,
      })
    );
  };

  const copyShareLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Campaign link copied to clipboard!");
    }
  };

  const handleInspectProof = async (m: {
    id: bigint;
    amount: bigint;
    proofCid: string;
    verifiedBy: string;
    released: boolean;
  }) => {
    setInspectedMilestone(m);
    setProofLoading(true);
    try {
      const data = await fetchMetadataByCid<MilestoneProofMetadata>(m.proofCid);
      setInspectedProofData(data);
    } catch {
      setInspectedProofData(null);
    } finally {
      setProofLoading(false);
    }
  };

  if (isLoading && !campaign) {
    return (
      <div className="relative min-h-screen bg-background text-foreground">
        <GridBackground />
        <Navbar />
        <main className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="h-96 rounded-3xl animate-pulse bg-muted/30 border border-border/40" />
        </main>
      </div>
    );
  }

  if (!campaign || !c) {
    return (
      <div className="relative min-h-screen bg-background text-foreground">
        <GridBackground />
        <Navbar />
        <main className="relative z-10 mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <Card className="p-12 border-dashed border-border/80">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <AlertTriangle className="h-7 w-7 text-amber-500" />
            </div>
            <h1 className="mt-4 text-2xl font-bold">Campaign Not Found</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              Could not find campaign{" "}
              <span className="font-mono font-semibold">
                {campaignIdentifier}
              </span>{" "}
              on this cluster.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href="/explore">
                <Button variant="secondary">Browse Campaigns</Button>
              </Link>
              <Link href="/campaigns/new">
                <Button>Launch a Campaign</Button>
              </Link>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  const releasedPct =
    c.totalDeposited > 0n
      ? Number((c.totalReleased * 10000n) / c.totalDeposited) / 100
      : 0;

  const bannerImg = metadata?.bannerUrl
    ? resolveIpfsUrl(metadata.bannerUrl)
    : null;
  const lockedInEscrow =
    c.totalDeposited > c.totalReleased
      ? c.totalDeposited - c.totalReleased
      : 0n;

  const aiAudit = metadata?.aiAudit;
  const attachedDocs = metadata?.documents ?? [];

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Back Link */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/explore"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Explorer
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={copyShareLink}
            className="gap-1.5 text-xs h-8"
          >
            <Share2 className="h-3.5 w-3.5" /> Share
          </Button>
        </div>

        {/* Hero Banner Card */}
        <div className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-sm mb-8">
          <div className="relative h-56 sm:h-72 w-full overflow-hidden bg-muted">
            {bannerImg ? (
              <Image
                src={bannerImg}
                alt={metadata?.title || "Campaign banner"}
                fill
                priority
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 70vw, 800px"
                className="object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-r from-primary/30 via-background to-secondary flex items-center justify-center font-mono text-xl font-bold text-muted-foreground">
                Campaign #{c.campaignId.toString()}
              </div>
            )}
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <CampaignStatusBadge
                isLive={c.isLive}
                emergencyWithdrawn={c.emergencyWithdrawn}
              />
            </div>
            {metadata?.category && (
              <div className="absolute bottom-4 left-4">
                <Badge
                  variant="secondary"
                  className="backdrop-blur-md bg-background/80 capitalize text-xs px-3 py-1 font-medium shadow-sm"
                >
                  {metadata.category}
                </Badge>
              </div>
            )}
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="space-y-2 max-w-3xl">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    {metadata?.title || `Campaign #${c.campaignId.toString()}`}
                  </h1>
                </div>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {metadata?.tagline ||
                    "Decentralized fundraising campaign with milestone-governed escrow releases."}
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-muted-foreground">
                  <div>
                    Creator:{" "}
                    <a
                      href={getExplorerUrl(`/address/${c.creator}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-medium text-foreground underline hover:text-primary"
                    >
                      {truncate(c.creator)}
                    </a>
                    {isCreator && (
                      <Badge
                        variant="outline"
                        className="ml-1.5 text-[10px] text-primary"
                      >
                        You
                      </Badge>
                    )}
                  </div>
                  <div>
                    Verifier:{" "}
                    <a
                      href={getExplorerUrl(`/address/${c.verifier}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-medium text-foreground underline hover:text-primary"
                    >
                      {truncate(c.verifier)}
                    </a>
                    {isVerifier && (
                      <Badge
                        variant="outline"
                        className="ml-1.5 text-[10px] text-green-600"
                      >
                        You
                      </Badge>
                    )}
                  </div>
                  {c.metadataCid && (
                    <a
                      href={`https://ipfs.io/ipfs/${c.metadataCid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 font-mono text-primary hover:underline"
                    >
                      IPFS Metadata <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Trust Score Card */}
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 shrink-0 min-w-[220px] text-center space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-primary">
                  <Cpu className="h-4 w-4" /> AI Verified Trust Score
                </div>
                <p className="text-3xl font-extrabold tabular-nums text-foreground">
                  {c.trustScore.toString()}
                  <span className="text-base text-muted-foreground font-normal">
                    /100
                  </span>
                </p>
                <Badge
                  variant="outline"
                  className="text-[10px] border-primary/30 bg-primary/10 text-primary"
                >
                  {aiAudit?.rating || (Number(c.trustScore) >= 75 ? "Verified High" : "Standard")}
                </Badge>
              </div>
            </div>

            {/* Escrow Progress Bar */}
            <div className="rounded-2xl bg-muted/30 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">
                    Total Escrow Raised
                  </span>
                  <p className="text-2xl font-bold tabular-nums text-foreground">
                    {rawToDecimal(c.totalDeposited, DECIMALS)} USDC
                    {metadata?.targetFundingUsdc && (
                      <span className="text-sm text-muted-foreground font-normal">
                        {" "}
                        of {metadata.targetFundingUsdc} USDC target
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">
                    Released to Creator
                  </span>
                  <p className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">
                    {rawToDecimal(c.totalReleased, DECIMALS)} USDC (
                    {releasedPct.toFixed(1)}%)
                  </p>
                </div>
              </div>

              <Progress value={releasedPct} className="h-2.5" />

              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>
                  Locked in Vault:{" "}
                  <strong className="text-foreground">
                    {rawToDecimal(lockedInEscrow, DECIMALS)} USDC
                  </strong>
                </span>
                <span>
                  Milestones:{" "}
                  <strong className="text-foreground">
                    {milestones.filter((m) => m.account.released).length}/
                    {c.milestoneCount.toString()} Completed
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Grid */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column: Project Story, AI Report & Documents */}
          <div className="lg:col-span-2 space-y-6">
            {/* Story Card */}
            <Card className="border-border/60 p-6 sm:p-8 space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Project Story &amp; Architecture
              </h2>
              <Separator />
              <MarkdownContent
                content={metadata?.description || "No extended description provided for this campaign."}
              />

              {/* Social / External Links */}
              {(metadata?.websiteUrl ||
                metadata?.twitterUrl ||
                metadata?.githubUrl ||
                metadata?.contactEmail) && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Project Links &amp; Resources
                    </h3>
                    <div className="flex flex-wrap gap-3 text-xs">
                      {metadata.websiteUrl && (
                        <a
                          href={metadata.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/30 px-3 py-1.5 hover:bg-muted transition-colors"
                        >
                          <Globe className="h-3.5 w-3.5" /> Website
                        </a>
                      )}
                      {metadata.twitterUrl && (
                        <a
                          href={
                            metadata.twitterUrl.startsWith("http")
                              ? metadata.twitterUrl
                              : `https://twitter.com/${metadata.twitterUrl.replace("@", "")}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/30 px-3 py-1.5 hover:bg-muted transition-colors"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Twitter / X
                        </a>
                      )}
                      {metadata.githubUrl && (
                        <a
                          href={metadata.githubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/30 px-3 py-1.5 hover:bg-muted transition-colors"
                        >
                          <Code2 className="h-3.5 w-3.5" /> GitHub Repository
                        </a>
                      )}
                    </div>
                  </div>
                </>
              )}
            </Card>

            {/* AI Trust & Document Verification Card */}
            <Card className="border-border/60 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-primary" /> Privacy AI Audit &amp; Document Checksums
                </h3>
                <Badge variant="outline" className="text-xs font-mono">
                  Trust Score: {c.trustScore.toString()}/100
                </Badge>
              </div>

              <Separator />

              {aiAudit ? (
                <div className="space-y-4 text-xs">
                  {/* Cryptographic Proofs & Privacy Attestation */}
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 pb-2">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-primary" /> Cryptographic Integrity &amp; Zero-Retention Proofs
                      </span>
                      <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary capitalize">
                        {aiAudit.privacyMode === "local_air_gapped" ? "100% Air-Gapped Local" : "Stateless Zero-Retention"}
                      </Badge>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 text-[11px] font-mono">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>Document Merkle Root:</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(aiAudit.docMerkleRoot || "00".repeat(32), "merkle")}
                            className="text-primary hover:text-primary/80 flex items-center gap-1 text-[10px]"
                          >
                            {copiedField === "merkle" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            {copiedField === "merkle" ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <p className="font-semibold text-foreground truncate bg-background/80 p-1.5 rounded border border-border/40">
                          {aiAudit.docMerkleRoot || "00".repeat(32)}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>Canonical Audit Hash:</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(aiAudit.auditHash || "0x...", "hash")}
                            className="text-primary hover:text-primary/80 flex items-center gap-1 text-[10px]"
                          >
                            {copiedField === "hash" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            {copiedField === "hash" ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <p className="font-semibold text-primary truncate bg-background/80 p-1.5 rounded border border-border/40">
                          {aiAudit.auditHash || "0x..."}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px] text-muted-foreground">
                      <span>🛡️ <strong>{aiAudit.redactionsCount?.totalRedacted ?? 0}</strong> sensitive tokens redacted in-memory</span>
                      <span>·</span>
                      <span>📊 Linguistic Human Depth: <strong>{aiAudit.stylometricMetrics?.burstinessScore ?? 75}/100</strong></span>
                      <span>·</span>
                      <span>
                        {aiAudit.budgetAnalysis?.isBalanced ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">✓ Budget Math Balanced</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">⚠️ Budget variance detected</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Sub-Scores Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                    <div className="rounded-xl bg-muted/30 p-2.5">
                      <span className="text-[10px] text-muted-foreground uppercase">Authenticity</span>
                      <p className="font-bold text-sm">{aiAudit.subScores.authenticityScore}%</p>
                    </div>
                    <div className="rounded-xl bg-primary/10 border border-primary/20 p-2.5">
                      <span className="text-[10px] text-primary uppercase font-semibold">Story Alignment</span>
                      <p className="font-bold text-sm text-primary">{aiAudit.subScores.storyDocumentAlignmentScore ?? 85}%</p>
                    </div>
                    <div className="rounded-xl bg-muted/30 p-2.5">
                      <span className="text-[10px] text-muted-foreground uppercase">Feasibility</span>
                      <p className="font-bold text-sm">{aiAudit.subScores.feasibilityScore}%</p>
                    </div>
                    <div className="rounded-xl bg-muted/30 p-2.5">
                      <span className="text-[10px] text-muted-foreground uppercase">Verifiability</span>
                      <p className="font-bold text-sm">{aiAudit.subScores.verifiabilityScore}%</p>
                    </div>
                    <div className="rounded-xl bg-muted/30 p-2.5">
                      <span className="text-[10px] text-muted-foreground uppercase">AI Content Risk</span>
                      <p className="font-bold text-sm">{aiAudit.aiGeneratedProbability}% ({aiAudit.aiGeneratedRisk})</p>
                    </div>
                  </div>

                  {/* Budget Category Allocation Breakdown */}
                  {aiAudit.budgetAnalysis?.categoryBreakdown && aiAudit.budgetAnalysis.categoryBreakdown.length > 0 && (
                    <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <Coins className="h-4 w-4 text-primary" /> Itemized Budget Category Allocations
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Goal: ${aiAudit.budgetAnalysis.targetFundingUsdc?.toLocaleString()} USDC
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {aiAudit.budgetAnalysis.categoryBreakdown.map((cat, idx) => (
                          <div key={idx} className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs">
                            <span className="capitalize font-medium text-foreground">{cat.category.replace("_", " ")}: </span>
                            <span className="font-bold text-primary">${cat.amountUsdc.toLocaleString()}</span>
                            <span className="text-muted-foreground text-[10px]"> ({cat.percentage}%)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cross-Document Consistency Matrix */}
                  {aiAudit.crossDocConsistencyMatrix && aiAudit.crossDocConsistencyMatrix.length > 0 && (
                    <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <FileCheck2 className="h-4 w-4 text-primary" /> Multi-Document Consistency Matrix
                      </span>
                      <div className="space-y-1.5">
                        {aiAudit.crossDocConsistencyMatrix.map((pair, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2 rounded-lg bg-background/60 border border-border/40">
                            <div className="truncate max-w-sm">
                              <span className="font-semibold text-foreground">{pair.docAName}</span>
                              <span className="text-muted-foreground"> ↔ </span>
                              <span className="font-semibold text-foreground">{pair.docBName}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  pair.status === "Consistent"
                                    ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30"
                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                }`}
                              >
                                {pair.status} ({pair.consistencyScore}%)
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Story vs Document Cross-Alignment Findings */}
                  {((aiAudit.storyAlignmentFindings && aiAudit.storyAlignmentFindings.length > 0) ||
                    (aiAudit.storyDiscrepancies && aiAudit.storyDiscrepancies.length > 0)) && (
                    <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2 text-xs">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <Cpu className="h-4 w-4 text-primary" /> Story vs. Document Cross-Examination
                      </span>

                      {aiAudit.storyAlignmentFindings && aiAudit.storyAlignmentFindings.length > 0 && (
                        <div className="space-y-1">
                          {aiAudit.storyAlignmentFindings.map((f, i) => (
                            <p key={i} className="flex items-start gap-1.5 text-muted-foreground">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                              <span>{f}</span>
                            </p>
                          ))}
                        </div>
                      )}

                      {aiAudit.storyDiscrepancies && aiAudit.storyDiscrepancies.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-border/40">
                          {aiAudit.storyDiscrepancies.map((d, i) => (
                            <p key={i} className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                              <span>{d}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {aiAudit.strengths && aiAudit.strengths.length > 0 && (
                    <div className="space-y-1">
                      <span className="font-semibold text-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Key Audit Strengths
                      </span>
                      <ul className="space-y-1 text-muted-foreground">
                        {aiAudit.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-primary">•</span> <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiAudit.riskWarnings && aiAudit.riskWarnings.length > 0 && (
                    <div className="space-y-1">
                      <span className="font-semibold text-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Audit Findings &amp; Notes
                      </span>
                      <ul className="space-y-1 text-muted-foreground">
                        {aiAudit.riskWarnings.map((w, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-amber-500">•</span> <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Campaign initialized with standard protocol baseline trust score ({c.trustScore.toString()}/100).
                </p>
              )}

              {attachedDocs.length > 0 && (
                <div className="pt-2 border-t border-border/40 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileCheck2 className="h-3.5 w-3.5 text-primary" /> Verified Supporting Documents ({attachedDocs.length})
                  </h4>
                  <div className="grid gap-2">
                    {attachedDocs.map((doc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/20 p-2.5 text-xs font-mono"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate font-medium text-foreground">{doc.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-[10px]">
                          <span className="text-muted-foreground">
                            SHA-256: {doc.sha256.slice(0, 10)}...{doc.sha256.slice(-6)}
                          </span>
                          {doc.ipfsCid && (
                            <a
                              href={doc.ipfsUrl || resolveIpfsUrl(doc.ipfsCid)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline flex items-center gap-0.5 font-semibold"
                            >
                              Pinata <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Planned Milestone Roadmap (Planned vs Submitted) */}
            {metadata?.plannedMilestones && metadata.plannedMilestones.length > 0 && (
              <Card className="border-border/60 p-6 space-y-4">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" /> Planned Deliverable Roadmap ({metadata.plannedMilestones.length})
                </h3>
                <Separator />
                <div className="space-y-3">
                  {metadata.plannedMilestones.map((pm) => {
                    const submitted = milestones.find((m) => m.account.milestoneId === BigInt(pm.id));
                    return (
                      <div
                        key={pm.id}
                        className="rounded-xl border border-border/80 bg-muted/15 p-3.5 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              Tranche #{pm.id}
                            </Badge>
                            <span className="font-bold text-foreground">{pm.title}</span>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              submitted?.account.released
                                ? "bg-green-500/15 text-green-600 dark:text-green-400 text-[10px]"
                                : submitted
                                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]"
                                : "bg-muted text-muted-foreground text-[10px]"
                            }
                          >
                            {submitted?.account.released
                              ? "Completed & Released"
                              : submitted
                              ? "Proof Submitted & Attested"
                              : "Planned"}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground">{pm.description}</p>
                        <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                          <span>Target: <strong className="text-foreground">{Number(pm.targetAmountUsdc).toLocaleString()} USDC</strong></span>
                          {pm.estimatedDurationDays && (
                            <span>Est. Duration: {pm.estimatedDurationDays} days</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>

          {/* Right Column: Donation Form & Milestones */}
          <div className="space-y-6">
            {/* Donation Card */}
            {isLive && (
              <Card className="border-primary/40 bg-card shadow-md p-6 space-y-4">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Coins className="h-5 w-5 text-primary" /> Back this Campaign
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Deposit USDC into the non-custodial campaign escrow vault.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Donation Amount (USDC)
                      </span>
                      {donorBalance && (
                        <span className="text-muted-foreground font-mono text-[11px]">
                          Wallet:{" "}
                          {rawToDecimal(
                            donorBalance.amount,
                            donorBalance.decimals
                          )}{" "}
                          USDC
                        </span>
                      )}
                    </div>
                    <Input
                      value={donationAmount}
                      onChange={(e) => setDonationAmount(e.target.value)}
                      placeholder="100"
                      inputMode="decimal"
                      className="font-bold text-lg h-11"
                    />
                  </div>

                  {/* Preset Amount Chips */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {PRESET_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDonationAmount(amt)}
                        className={`rounded-lg border py-1 text-xs font-semibold transition-colors ${
                          donationAmount === amt
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/80 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>

                  <Button
                    onClick={handleDonate}
                    disabled={isSending || !signer}
                    className="w-full h-11 text-sm font-bold bg-primary text-primary-foreground shadow-md hover:bg-primary/90 mt-2"
                  >
                    {isSending
                      ? "Confirming Donation..."
                      : `Donate ${donationAmount || "0"} USDC`}
                  </Button>
                </div>
              </Card>
            )}

            {c.emergencyWithdrawn && (
              <Card className="border-destructive/40 bg-destructive/5 p-6 space-y-3">
                <div className="flex items-center gap-2 text-destructive font-bold text-sm">
                  <AlertTriangle className="h-4 w-4" /> Emergency Withdrawn
                </div>
                <p className="text-xs text-muted-foreground">
                  This campaign was drained by a DAO emergency proposal. If you
                  made previous donations, you can claim your pro-rata share of
                  remaining funds.
                </p>
                <Button
                  variant="destructive"
                  onClick={handleClaimRefund}
                  disabled={isSending || !signer}
                  className="w-full text-xs"
                >
                  Claim Refund
                </Button>
              </Card>
            )}

            {!c.isLive && !c.emergencyWithdrawn && (
              <Card className="border-amber-500/40 bg-amber-500/5 p-6 space-y-3 text-center">
                <Badge
                  variant="outline"
                  className="bg-amber-500/15 text-amber-600 dark:text-amber-400 mx-auto"
                >
                  Awaiting DAO Approval &amp; Voting
                </Badge>
                <p className="text-xs text-muted-foreground">
                  This campaign is pending community governance approval. Once approved by a DAO proposal, donations will be unlocked.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setApprovalOpen(true)}
                  className="w-full text-xs gap-1.5"
                >
                  <Vote className="h-3.5 w-3.5" /> Sponsor DAO Approval Proposal
                </Button>
              </Card>
            )}

            {/* Milestones Card */}
            <Card className="border-border/60 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <MilestoneIcon className="h-4 w-4 text-primary" /> On-Chain Milestones
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {milestones.length} tranche{milestones.length !== 1 ? "s" : ""} registered on Solana.
                  </p>
                </div>

                {isCreator && c.isLive && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMilestoneOpen(true)}
                    className="h-8 text-xs gap-1"
                  >
                    + Submit Proof
                  </Button>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                {milestones.length === 0 && (
                  <p className="text-xs text-muted-foreground italic py-2 text-center">
                    No milestone deliverable proofs submitted yet.
                    {isCreator &&
                      c.isLive &&
                      " Submit your first deliverable proof above."}
                  </p>
                )}

                {milestones.map((m) => (
                  <div
                    key={m.address}
                    className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-foreground">
                        Milestone #{m.account.milestoneId.toString()}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          m.account.released
                            ? "bg-green-500/15 text-green-600 dark:text-green-400 text-[10px]"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px]"
                        }
                      >
                        {m.account.released ? "Released" : "Attested / Pending Release"}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Tranche Amount:
                      </span>
                      <span className="font-bold tabular-nums">
                        {rawToDecimal(m.account.amount, DECIMALS)} USDC
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-border/40">
                      <span className="font-mono text-muted-foreground truncate max-w-[140px]">
                        Proof: {m.account.proofCid.slice(0, 12)}...
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs text-primary px-2 hover:bg-primary/10"
                        onClick={() =>
                          handleInspectProof({
                            id: m.account.milestoneId,
                            amount: m.account.amount,
                            proofCid: m.account.proofCid,
                            verifiedBy: m.account.verifiedBy,
                            released: m.account.released,
                          })
                        }
                      >
                        Inspect Proof <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {milestones.some((m) => !m.account.released) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReleaseOpen(true)}
                  className="w-full text-xs mt-2 gap-1.5"
                >
                  <Vote className="h-3.5 w-3.5" /> Propose Milestone Release Vote
                </Button>
              )}
            </Card>
          </div>
        </div>
      </main>

      {/* Deliverable Proof Inspector Modal */}
      {inspectedMilestone && (
        <Dialog open={!!inspectedMilestone} onOpenChange={() => setInspectedMilestone(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-primary" />
                Milestone #{inspectedMilestone.id.toString()} Deliverable Proof
              </DialogTitle>
              <DialogDescription>
                Cryptographic on-chain verification and deliverable artifacts for this tranche.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-muted/40 p-3">
                  <span className="text-muted-foreground">Tranche Amount:</span>
                  <p className="font-bold text-sm text-foreground mt-0.5">
                    {rawToDecimal(inspectedMilestone.amount, DECIMALS)} USDC
                  </p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <span className="text-muted-foreground">Release Status:</span>
                  <p className="font-bold text-sm mt-0.5">
                    {inspectedMilestone.released ? (
                      <span className="text-green-600 dark:text-green-400">Disbursed to Creator</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Awaiting Release Vote</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IPFS Proof CID:</span>
                  <a
                    href={`https://ipfs.io/ipfs/${inspectedMilestone.proofCid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline truncate max-w-[260px]"
                  >
                    {inspectedMilestone.proofCid}
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Attested By Verifier:</span>
                  <span className="text-foreground truncate max-w-[260px]">
                    {inspectedMilestone.verifiedBy}
                  </span>
                </div>
              </div>

              {proofLoading ? (
                <div className="h-24 animate-pulse bg-muted/30 rounded-xl flex items-center justify-center text-muted-foreground">
                  Resolving IPFS deliverable metadata...
                </div>
              ) : inspectedProofData ? (
                <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
                  <div>
                    <h4 className="font-bold text-sm text-foreground">{inspectedProofData.title}</h4>
                    <div className="mt-1">
                      <MarkdownContent content={inspectedProofData.description || ""} />
                    </div>
                  </div>

                  {inspectedProofData.gitCommit && (
                    <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                      <Code2 className="h-4 w-4 text-primary" />
                      <span className="text-muted-foreground font-mono">
                        Git Commit: <strong className="text-foreground">{inspectedProofData.gitCommit}</strong>
                      </span>
                    </div>
                  )}

                  {inspectedProofData.liveUrl && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <a
                        href={inspectedProofData.liveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline flex items-center gap-1"
                      >
                        {inspectedProofData.liveUrl} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}

                  {inspectedProofData.evidenceLinks && inspectedProofData.evidenceLinks.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <span className="font-semibold text-foreground">Evidence &amp; Artifact Links:</span>
                      <ul className="space-y-1">
                        {inspectedProofData.evidenceLinks.map((link, i) => (
                          <li key={i}>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              • {link.label}: {link.url} <ExternalLink className="h-3 w-3" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      )}

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
    </div>
  );
}
