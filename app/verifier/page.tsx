"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "../components/navbar";
import { GridBackground } from "../components/grid-background";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCluster } from "@/app/components/cluster-context";
import { useSolanaClient } from "@/app/lib/solana-client-context";
import {
  useCampaigns,
  useDaoConfig,
  useFydaoTx,
  useFydaoWallet,
  useMilestones,
} from "@/app/lib/hooks/use-fydao";
import { useCampaignMetadata } from "@/app/lib/hooks/use-campaign-metadata";
import { proposeMilestoneActions } from "@/app/lib/fydao/actions";
import {
  uploadMilestoneProofMetadata,
  uploadDocumentToPinata,
  fetchMetadataByCid,
  type MilestoneProofMetadata,
} from "@/app/lib/ipfs";
import { parseTokenAmount, rawToDecimal } from "@/app/lib/fydao/amount";
import { truncate, formatDate } from "@/app/lib/fydao/format";
import type { Address } from "@solana/kit";
import type { Campaign, Milestone } from "@/app/generated/fydao/accounts";
import { CampaignStatusBadge } from "../components/fydao/status-badge";
import { CreateProposalDialog } from "../components/fydao/create-proposal-dialog";
import { ConnectGate } from "../components/fydao/shared";
import { MarkdownContent } from "../components/markdown-content";
import {
  ShieldCheck,
  FileCheck2,
  ExternalLink,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
  Upload,
  ArrowRight,
  Code2,
  Globe,
  Cpu,
  Vote,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

export default function VerifierPortalPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <ConnectGate>
          <VerifierDashboard />
        </ConnectGate>
      </main>
    </div>
  );
}

function VerifierDashboard() {
  const { getExplorerUrl } = useCluster();
  const { address } = useFydaoWallet();
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();
  const { data: allMilestones } = useMilestones();

  const [activeTab, setActiveTab] = useState<string>("assigned");
  const [selectedProofCid, setSelectedProofCid] = useState<string | null>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [attestModalCampaign, setAttestModalCampaign] = useState<{ address: string; account: Campaign } | null>(null);
  const [approvalModalCampaign, setApprovalModalCampaign] = useState<{ address: string; account: Campaign } | null>(null);

  // Filter campaigns assigned to this connected wallet
  const assignedCampaigns = (campaigns ?? []).filter(
    (c) => c.account.verifier === address
  );

  const totalAssigned = assignedCampaigns.length;
  const verifiedMilestonesCount = (allMilestones ?? []).filter((m) => {
    const parent = (campaigns ?? []).find((c) => c.address === m.account.campaign);
    return parent?.account.verifier === address && m.account.released;
  }).length;

  const supervisedEscrowRaw = assignedCampaigns.reduce(
    (sum, c) => sum + c.account.totalDeposited,
    0n
  );

  const handleInspectProof = (cid: string) => {
    setSelectedProofCid(cid);
    setInspectModalOpen(true);
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-card via-card to-primary/5 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" /> Designated Milestone Verifier Portal
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Attestation &amp; Deliverable Verification
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
              Under Arthasetu&apos;s security model (M5), milestone funds cannot be released on the creator&apos;s say-so. The designated verifier co-signs the off-chain deliverable proof CID before DAO governance can authorize the release.
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/80 p-4 font-mono text-xs space-y-1.5 shrink-0 backdrop-blur-sm">
            <p className="text-muted-foreground">Connected Attester:</p>
            <p className="font-bold text-foreground">{truncate(address || "")} <span className="text-green-600 font-sans font-semibold">(Active)</span></p>
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

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-6 pt-6 border-t border-border/40">
          <div>
            <span className="text-xs text-muted-foreground">Assigned Campaigns</span>
            <p className="text-2xl font-bold tabular-nums text-foreground">{totalAssigned}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Verified Milestones</span>
            <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">{verifiedMilestonesCount}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Supervised Escrow</span>
            <p className="text-2xl font-bold tabular-nums text-foreground">{rawToDecimal(supervisedEscrowRaw, 6)} USDC</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Attestation Security</span>
            <p className="text-sm font-semibold text-primary mt-1">Dual-Signer (M5)</p>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="assigned" className="text-xs">
            Assigned to Me ({totalAssigned})
          </TabsTrigger>
          <TabsTrigger value="all" className="text-xs">
            All Campaigns
          </TabsTrigger>
          <TabsTrigger value="builder" className="text-xs">
            Proof Builder
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Assigned Campaigns */}
        <TabsContent value="assigned" className="space-y-4">
          {totalAssigned === 0 ? (
            <Card className="p-12 text-center border-dashed border-border/80">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold">No Campaigns Assigned Yet</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                When creators designate your Solana wallet (<span className="font-mono">{truncate(address || "")}</span>) as their verifier at campaign launch, they will appear here.
              </p>
              <div className="mt-6">
                <Button size="sm" variant="outline" onClick={() => setActiveTab("all")}>
                  Browse All Campaigns
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {assignedCampaigns.map((c) => (
                <VerifierCampaignCard
                  key={c.address}
                  campaign={c}
                  milestones={(allMilestones ?? []).filter((m) => m.account.campaign === c.address)}
                  onInspectProof={handleInspectProof}
                  onAttest={() => setAttestModalCampaign(c)}
                  onSponsorApproval={() => setApprovalModalCampaign(c)}
                  isAssignedToMe={true}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: All Campaigns */}
        <TabsContent value="all" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            {(campaigns ?? []).map((c) => (
              <VerifierCampaignCard
                key={c.address}
                campaign={c}
                milestones={(allMilestones ?? []).filter((m) => m.account.campaign === c.address)}
                onInspectProof={handleInspectProof}
                onAttest={() => setAttestModalCampaign(c)}
                onSponsorApproval={() => setApprovalModalCampaign(c)}
                isAssignedToMe={c.account.verifier === address}
              />
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Proof Generator */}
        <TabsContent value="builder" className="space-y-4">
          <MilestoneProofBuilder />
        </TabsContent>
      </Tabs>

      {/* Proof Inspector Modal */}
      {selectedProofCid && (
        <ProofInspectorDialog
          cid={selectedProofCid}
          open={inspectModalOpen}
          onOpenChange={setInspectModalOpen}
        />
      )}

      {/* Co-Sign & Attest Dialog */}
      {attestModalCampaign && (
        <VerifierAttestModal
          campaign={attestModalCampaign}
          open={Boolean(attestModalCampaign)}
          onClose={() => setAttestModalCampaign(null)}
        />
      )}

      {/* Sponsor Approval Dialog */}
      {approvalModalCampaign && (
        <CreateProposalDialog
          open={Boolean(approvalModalCampaign)}
          onOpenChange={(open) => !open && setApprovalModalCampaign(null)}
          campaigns={[approvalModalCampaign]}
          defaultKind="ApproveCampaign"
          defaultCampaign={approvalModalCampaign.address}
        />
      )}
    </div>
  );
}

function VerifierCampaignCard({
  campaign,
  milestones,
  onInspectProof,
  onAttest,
  onSponsorApproval,
  isAssignedToMe,
}: {
  campaign: { address: string; account: Campaign };
  milestones: Array<{ address: string; account: Milestone }>;
  onInspectProof: (cid: string) => void;
  onAttest: () => void;
  onSponsorApproval: () => void;
  isAssignedToMe: boolean;
}) {
  const c = campaign.account;
  const { data: metadata } = useCampaignMetadata(c.metadataCid);
  const releasedCount = milestones.filter((m) => m.account.released).length;
  const docsCount = metadata?.documents?.length ?? 0;

  return (
    <Card className={`overflow-hidden border-border/80 ${isAssignedToMe ? "ring-1 ring-primary/40" : ""}`}>
      <CardHeader className="p-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-bold truncate">
                {metadata?.title || `Campaign #${c.campaignId.toString()}`}
              </CardTitle>
              <CampaignStatusBadge isLive={c.isLive} emergencyWithdrawn={c.emergencyWithdrawn} />
            </div>
            <p className="text-xs text-muted-foreground truncate">
              Creator: <span className="font-mono font-medium text-foreground">{truncate(c.creator)}</span>
            </p>
          </div>
          {isAssignedToMe && (
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-[10px] shrink-0">
              Assigned to You
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 space-y-4 text-xs">
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/30 p-2.5 text-center">
          <div>
            <span className="text-muted-foreground text-[10px]">Escrow Raised</span>
            <p className="font-bold tabular-nums">{rawToDecimal(c.totalDeposited, 6)} USDC</p>
          </div>
          <div>
            <span className="text-muted-foreground text-[10px]">AI Trust Score</span>
            <p className="font-bold tabular-nums text-primary">{c.trustScore.toString()}/100</p>
          </div>
          <div>
            <span className="text-muted-foreground text-[10px]">Milestones</span>
            <p className="font-bold tabular-nums">{releasedCount}/{c.milestoneCount.toString()} Paid</p>
          </div>
        </div>

        {/* AI & Document Audit Summary */}
        {metadata?.aiAudit && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-primary" /> AI Audit Rating: {metadata.aiAudit.rating}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {docsCount} Document{docsCount !== 1 ? "s" : ""} Attached
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
              Authenticity: {metadata.aiAudit.subScores.authenticityScore}% · Feasibility: {metadata.aiAudit.subScores.feasibilityScore}% · AI Risk: {metadata.aiAudit.aiGeneratedRisk}
            </p>
          </div>
        )}

        {/* Existing On-Chain Milestones */}
        <div className="space-y-2">
          <span className="font-semibold text-muted-foreground text-[11px]">Milestone Deliverable Attestations:</span>
          {milestones.length === 0 ? (
            <p className="text-muted-foreground italic py-1">No deliverable milestones submitted yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {milestones.map((m) => (
                <div
                  key={m.address}
                  className="flex items-center justify-between gap-2 rounded-lg bg-muted/20 border border-border/60 p-2.5"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">#{m.account.milestoneId.toString()}</span>
                      <span className="font-medium">{rawToDecimal(m.account.amount, 6)} USDC</span>
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground truncate">
                      CID: {m.account.proofCid}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px] px-2 gap-1"
                      onClick={() => onInspectProof(m.account.proofCid)}
                    >
                      <FileCheck2 className="h-3.5 w-3.5" /> Inspect Proof
                    </Button>
                    <Badge
                      variant="outline"
                      className={
                        m.account.released
                          ? "bg-green-500/15 text-green-600 dark:text-green-400 text-[10px]"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px]"
                      }
                    >
                      {m.account.released ? "Released" : "Pending Release"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex justify-between gap-2 border-t border-border/40 bg-muted/10">
        <Link href={`/campaigns/${c.campaignId.toString()}`}>
          <Button size="sm" variant="ghost" className="h-8 text-xs">
            View Campaign <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Link>

        {!c.isLive && !c.emergencyWithdrawn ? (
          <Button size="sm" variant="secondary" onClick={onSponsorApproval} className="h-8 text-xs gap-1.5">
            <Vote className="h-3.5 w-3.5" /> Sponsor DAO Vote
          </Button>
        ) : (
          c.isLive && isAssignedToMe && (
            <Button size="sm" onClick={onAttest} className="h-8 text-xs gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Attest Next Milestone
            </Button>
          )
        )}
      </CardFooter>
    </Card>
  );
}

function ProofInspectorDialog({
  cid,
  open,
  onOpenChange,
}: {
  cid: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [proofData, setProofData] = useState<MilestoneProofMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useState(() => {
    let active = true;
    setLoading(true);
    fetchMetadataByCid<MilestoneProofMetadata>(cid)
      .then((data) => {
        if (active) {
          setProofData(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileCheck2 className="h-5 w-5 text-primary" /> Milestone Deliverable Evidence Inspector
          </DialogTitle>
          <DialogDescription className="font-mono text-xs truncate">
            IPFS CID: {cid}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-xs max-h-[60vh] overflow-y-auto pr-1">
          {loading && (
            <div className="p-8 text-center text-muted-foreground">
              Fetching and decoding deliverable evidence from IPFS...
            </div>
          )}

          {!loading && !proofData && (
            <div className="rounded-xl bg-muted/40 p-4 space-y-2">
              <p className="font-semibold text-foreground">Raw Deliverable Proof CID</p>
              <p className="text-muted-foreground">
                This milestone references an off-chain IPFS payload. You can inspect it directly on an IPFS gateway:
              </p>
              <a
                href={`https://ipfs.io/ipfs/${cid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline flex items-center gap-1 font-mono"
              >
                https://ipfs.io/ipfs/{cid} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {proofData && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/30 p-4 space-y-1.5">
                <h4 className="font-bold text-sm text-foreground">
                  {proofData.title || "Milestone Deliverable Submission"}
                </h4>
                <MarkdownContent content={proofData.description || "No detailed description provided."} />
              </div>

              {proofData.gitCommit && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/20 border p-2.5 font-mono text-[11px]">
                  <Code2 className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Git Commit:</span>
                  <span className="text-foreground font-semibold">{proofData.gitCommit}</span>
                </div>
              )}

              {proofData.liveUrl && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/20 border p-2.5 text-[11px]">
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Live URL:</span>
                  <a
                    href={proofData.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline truncate"
                  >
                    {proofData.liveUrl}
                  </a>
                </div>
              )}

              {proofData.evidenceLinks && proofData.evidenceLinks.length > 0 && (
                <div className="space-y-2">
                  <span className="font-semibold text-muted-foreground">Attached Deliverable Links &amp; Evidence:</span>
                  <div className="space-y-1.5">
                    {proofData.evidenceLinks.map((link, idx) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-lg border bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors"
                      >
                        <span className="font-medium text-foreground">{link.label || "Evidence Link"}</span>
                        <ExternalLink className="h-3.5 w-3.5 text-primary" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between text-[10px] text-muted-foreground border-t pt-2">
                <span>Submitted: {formatDate(BigInt(Math.floor((proofData.submittedAt || Date.now()) / 1000)))}</span>
                <a
                  href={`https://ipfs.io/ipfs/${cid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  View Raw JSON on IPFS
                </a>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerifierAttestModal({
  campaign,
  open,
  onClose,
}: {
  campaign: { address: string; account: Campaign };
  open: boolean;
  onClose: () => void;
}) {
  const { signer } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();
  const c = campaign.account;
  const { data: metadata } = useCampaignMetadata(c.metadataCid);

  const [proofCid, setProofCid] = useState("");
  const [amount, setAmount] = useState("5000");

  const handleSubmit = async () => {
    if (!signer) return;
    const raw = parseTokenAmount(amount, 6);
    if (!raw || raw <= 0n) {
      toast.error("Please enter a valid milestone release amount");
      return;
    }
    if (!proofCid.trim()) {
      toast.error("Please provide the IPFS deliverable proof CID");
      return;
    }

    try {
      await run(`Attesting Milestone #${c.milestoneCount.toString()} on Solana`, () =>
        proposeMilestoneActions({
          creator: signer,
          campaign: campaign.address as Address,
          verifier: signer,
          milestoneId: c.milestoneCount,
          proofCid: proofCid.trim(),
          amount: raw,
        })
      );
      onClose();
    } catch {
      // toast in useFydaoTx
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Attest Milestone #{c.milestoneCount.toString()}
          </DialogTitle>
          <DialogDescription>
            Co-sign deliverable proof and register the on-chain Milestone PDA for {metadata?.title || `Campaign #${c.campaignId.toString()}`}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div className="rounded-xl bg-muted/40 p-3 space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Campaign Escrow Balance:</span>
              <span className="font-bold text-foreground">
                {rawToDecimal(c.totalDeposited - c.totalReleased, 6)} USDC
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Designated Verifier:</span>
              <span className="font-mono">{truncate(c.verifier)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>IPFS Deliverable Proof CID *</Label>
            <Input
              value={proofCid}
              onChange={(e) => setProofCid(e.target.value)}
              placeholder="bafybeih... or generated proof CID"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Generate this CID using the &quot;Proof Builder&quot; tab or upload proof JSON to IPFS.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Tranche Release Amount (USDC) *</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="5000"
              inputMode="decimal"
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isSending || !signer}>
            {isSending ? "Signing on Solana..." : "Attest & Create Milestone PDA"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneProofBuilder() {
  const { address } = useFydaoWallet();
  const [title, setTitle] = useState("");
  const [campaignId, setCampaignId] = useState("0");
  const [milestoneId, setMilestoneId] = useState("0");
  const [description, setDescription] = useState("");
  const [gitCommit, setGitCommit] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [links, setLinks] = useState<Array<{ label: string; url: string }>>([
    { label: "Live Demo", url: "" },
  ]);
  const [generatedCid, setGeneratedCid] = useState<string | null>(null);
  const [isPinning, setIsPinning] = useState(false);

  const addLink = () => {
    setLinks((prev) => [...prev, { label: "", url: "" }]);
  };

  const removeLink = (idx: number) => {
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLink = (idx: number, patch: Partial<{ label: string; url: string }>) => {
    setLinks((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const handlePin = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Please provide deliverable title and description");
      return;
    }

    setIsPinning(true);
    try {
      const payload: MilestoneProofMetadata = {
        version: "1.1.0",
        campaignId,
        milestoneId,
        title: title.trim(),
        description: description.trim(),
        evidenceLinks: links.filter((l) => l.url.trim().length > 0),
        gitCommit: gitCommit.trim() || undefined,
        liveUrl: liveUrl.trim() || undefined,
        submittedAt: Date.now(),
        submittedBy: address || "unknown",
      };

      const result = await uploadMilestoneProofMetadata(payload);
      setGeneratedCid(result.cid);
      toast.success("Milestone proof metadata pinned to IPFS!");
    } catch {
      toast.error("Failed to pin metadata");
    } finally {
      setIsPinning(false);
    }
  };

  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);

  const handleEvidenceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingEvidence(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const pinResult = await uploadDocumentToPinata(file, file.name, "evidence");
        setLinks((prev) => [
          ...prev.filter((l) => l.url.trim().length > 0),
          { label: file.name, url: pinResult.gatewayUrl },
        ]);
        toast.success(`Pinned ${file.name} to Pinata IPFS!`);
      }
    } catch (err: any) {
      toast.error("Failed to upload file to Pinata: " + err.message);
    } finally {
      setIsUploadingEvidence(false);
      e.target.value = "";
    }
  };

  return (
    <Card className="border-border/60 max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Milestone Deliverable Evidence Builder
        </CardTitle>
        <CardDescription className="text-xs">
          Package deliverable reports, evidence links, and git commits into a standardized Pinata IPFS CID to use when proposing or co-signing milestones.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-xs">
        <div className="space-y-1.5">
          <Label>Milestone Deliverable Title *</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Core Smart Contracts Deployed to Solana Devnet"
            className="text-xs"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Target Campaign ID</Label>
            <Input
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              placeholder="0"
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Milestone Number (#)</Label>
            <Input
              value={milestoneId}
              onChange={(e) => setMilestoneId(e.target.value)}
              placeholder="0"
              className="text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Deliverable Description &amp; Summary *</Label>
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detail the exact deliverables completed, test results, audit links, and verification instructions for the verifier..."
            className="text-xs"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Git Commit Hash</Label>
            <Input
              value={gitCommit}
              onChange={(e) => setGitCommit(e.target.value)}
              placeholder="e.g. 7f9a2c3b8..."
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Live Demo / Deployment URL</Label>
            <Input
              value={liveUrl}
              onChange={(e) => setLiveUrl(e.target.value)}
              placeholder="https://..."
              className="text-xs"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>Evidence &amp; Artifact Links</Label>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  onChange={handleEvidenceFileUpload}
                  className="hidden"
                  disabled={isUploadingEvidence}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] gap-1 pointer-events-none"
                  disabled={isUploadingEvidence}
                >
                  <Upload className="h-3 w-3" /> {isUploadingEvidence ? "Pinning..." : "Upload File to Pinata"}
                </Button>
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={addLink} className="h-6 text-[11px] gap-1">
                <Plus className="h-3 w-3" /> Add URL
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {links.map((link, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={link.label}
                  onChange={(e) => updateLink(idx, { label: e.target.value })}
                  placeholder="Label (e.g. Test Report)"
                  className="w-1/3 text-xs"
                />
                <Input
                  value={link.url}
                  onChange={(e) => updateLink(idx, { url: e.target.value })}
                  placeholder="https://..."
                  className="flex-1 text-xs"
                />
                {links.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLink(idx)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {generatedCid && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-1.5">
            <span className="text-xs font-semibold text-primary flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Generated Deliverable Proof CID
            </span>
            <p className="font-mono text-xs font-bold text-foreground break-all">
              {generatedCid}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Copy this CID and paste it into the milestone proposal dialog to register this attestation on Solana.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-end gap-2 border-t border-border/40 py-3">
        <Button size="sm" onClick={handlePin} disabled={isPinning} className="gap-1.5 text-xs">
          <Upload className="h-3.5 w-3.5" /> {isPinning ? "Pinning to IPFS..." : "Package & Pin to IPFS"}
        </Button>
      </CardFooter>
    </Card>
  );
}
