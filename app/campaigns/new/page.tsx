"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Navbar } from "../../components/navbar";
import { GridBackground } from "../../components/grid-background";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCluster } from "@/app/components/cluster-context";
import { useSolanaClient } from "@/app/lib/solana-client-context";
import { toast } from "sonner";
import {
  useDaoConfig,
  useFydaoTx,
  useFydaoWallet,
} from "@/app/lib/hooks/use-fydao";
import { createCampaignActions } from "@/app/lib/fydao/actions";
import {
  uploadCampaignMetadata,
  uploadDocumentToPinata,
  CAMPAIGN_CATEGORIES,
  type CampaignMetadata,
  type CampaignMilestonePlan,
} from "@/app/lib/ipfs";
import {
  computeFileHash,
  extractDocumentText,
  runPrivacyAiAudit,
  type DocumentAttachment,
  type AiAuditReport,
} from "@/app/lib/ai-audit";
import { ASSAM_FLOOD_RELIEF_EXAMPLE } from "@/app/lib/examples/assam-flood-relief";
import type { Address } from "@solana/kit";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Rocket,
  Shield,
  ShieldCheck,
  Plus,
  Trash2,
  ExternalLink,
  ArrowRight,
  Upload,
  FileText,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  FileCheck2,
  Layers,
  Split,
} from "lucide-react";
import { ConnectGate } from "../../components/fydao/shared";
import { MarkdownContent } from "../../components/markdown-content";

const DRAFT_KEY = "arthasetu:campaign:draft:v2";

const SAMPLE_BANNERS = [
  "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
];

const STEPS = [
  { id: 1, name: "Identity & Branding", desc: "Basic details & links" },
  { id: 2, name: "Docs & Privacy AI Audit", desc: "Upload docs & Trust Score" },
  { id: 3, name: "Story & Milestones", desc: "Roadmap & tranches" },
  { id: 4, name: "Funding & Verifier", desc: "Target & proof attester" },
  { id: 5, name: "Review & Launch", desc: "IPFS pin & Solana broadcast" },
];

const DEFAULT_STORY = [
  "## About the Project",
  "",
  "Explain what you are building, why it matters, and the problem it solves on Solana.",
  "",
  "### Technical Architecture & Deliverables",
  "- Core smart contract development with unit & integration tests",
  "- Frontend user interface and TypeScript client integration",
  "- End-to-end security audit and verifier deliverable attestations",
  "",
  "### Escrow & Fund Allocation",
  "100% of funding is locked in the non-custodial campaign escrow ATA. Funds are released tranche-by-tranche only upon verified deliverable proofs co-signed by our designated verifier and voted by the DAO.",
].join("\n");

export default function CreateCampaignPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <ConnectGate>
          <CampaignCreatorWizard />
        </ConnectGate>
      </main>
    </div>
  );
}

function CampaignCreatorWizard() {
  const router = useRouter();
  const { getExplorerUrl } = useCluster();
  const client = useSolanaClient();
  const { address, signer } = useFydaoWallet();
  const { data: daoConfig } = useDaoConfig();
  const { run, isSending } = useFydaoTx();

  const initialDraft = (() => {
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      return draft ? JSON.parse(draft) : {};
    } catch {
      return {};
    }
  })();

  const [step, setStep] = useState(1);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [createdCampaignId, setCreatedCampaignId] = useState<bigint | null>(
    null
  );
  const [pinnedCid, setPinnedCid] = useState<string | null>(null);

  // Step 1: Identity & Branding
  const [title, setTitle] = useState(initialDraft.title || "");
  const [tagline, setTagline] = useState(initialDraft.tagline || "");
  const [category, setCategory] = useState<string>(
    initialDraft.category || "technology"
  );
  const [logoUrl, setLogoUrl] = useState(initialDraft.logoUrl || "");
  const [bannerUrl, setBannerUrl] = useState(
    initialDraft.bannerUrl || SAMPLE_BANNERS[0]
  );
  const [websiteUrl, setWebsiteUrl] = useState(initialDraft.websiteUrl || "");
  const [twitterUrl, setTwitterUrl] = useState(initialDraft.twitterUrl || "");
  const [githubUrl, setGithubUrl] = useState(initialDraft.githubUrl || "");
  const [contactEmail, setContactEmail] = useState(
    initialDraft.contactEmail || ""
  );

  // Step 2: Documents & Privacy AI Audit
  const [documents, setDocuments] = useState<DocumentAttachment[]>(
    initialDraft.documents || []
  );
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);
  const [isScanningAi, setIsScanningAi] = useState(false);
  const [forceLocalPrivacy, setForceLocalPrivacy] = useState(false);
  const [aiAuditReport, setAiAuditReport] = useState<AiAuditReport | null>(
    initialDraft.aiAuditReport || null
  );

  // Step 3: Story & Roadmap
  const [description, setDescription] = useState(
    initialDraft.description || DEFAULT_STORY
  );
  const [storyTab, setStoryTab] = useState<"write" | "preview">("write");
  const [milestones, setMilestones] = useState<CampaignMilestonePlan[]>(
    initialDraft.milestones && initialDraft.milestones.length > 0
      ? initialDraft.milestones
      : [
          {
            id: 0,
            title: "Alpha Protocol & Architecture Verification",
            description:
              "Deploy core Solana programs to devnet with complete test coverage.",
            targetAmountUsdc: "10000",
            estimatedDurationDays: 30,
            deliverableCriteria: [
              "Devnet deployed program ID",
              "Passed test suite",
            ],
          },
          {
            id: 1,
            title: "Beta Launch & UI Release",
            description:
              "Public beta release on Solana with user onboarding and client SDK.",
            targetAmountUsdc: "15000",
            estimatedDurationDays: 45,
            deliverableCriteria: ["Live web app URL", "Audit report"],
          },
        ]
  );

  // Step 4: Funding & Verifier
  const [targetFundingUsdc, setTargetFundingUsdc] = useState(
    initialDraft.targetFundingUsdc || "25000"
  );
  const [trustScore, setTrustScore] = useState<number>(
    initialDraft.trustScore || 75
  );
  const [verifier, setVerifier] = useState(
    initialDraft.verifier || address || ""
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  const saveDraft = () => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          title,
          tagline,
          category,
          logoUrl,
          bannerUrl,
          websiteUrl,
          twitterUrl,
          githubUrl,
          contactEmail,
          documents,
          aiAuditReport,
          description,
          targetFundingUsdc,
          trustScore: aiAuditReport ? aiAuditReport.trustScore : trustScore,
          verifier,
          milestones,
        })
      );
    } catch {
      // ignore
    }
  };

  const loadAssamFloodTemplate = () => {
    setTitle(ASSAM_FLOOD_RELIEF_EXAMPLE.title);
    setTagline(ASSAM_FLOOD_RELIEF_EXAMPLE.tagline);
    setCategory(ASSAM_FLOOD_RELIEF_EXAMPLE.category);
    setBannerUrl(ASSAM_FLOOD_RELIEF_EXAMPLE.bannerUrl || "");
    setLogoUrl(ASSAM_FLOOD_RELIEF_EXAMPLE.logoUrl || "");
    setWebsiteUrl(ASSAM_FLOOD_RELIEF_EXAMPLE.websiteUrl || "");
    setTwitterUrl(ASSAM_FLOOD_RELIEF_EXAMPLE.twitterUrl || "");
    setGithubUrl(ASSAM_FLOOD_RELIEF_EXAMPLE.githubUrl || "");
    setContactEmail(ASSAM_FLOOD_RELIEF_EXAMPLE.contactEmail || "");
    setDescription(ASSAM_FLOOD_RELIEF_EXAMPLE.description);
    setTargetFundingUsdc(ASSAM_FLOOD_RELIEF_EXAMPLE.targetFundingUsdc);
    setDocuments(ASSAM_FLOOD_RELIEF_EXAMPLE.documents || []);
    setAiAuditReport(ASSAM_FLOOD_RELIEF_EXAMPLE.aiAudit || null);
    setTrustScore(ASSAM_FLOOD_RELIEF_EXAMPLE.aiAudit?.trustScore || 94);
    setMilestones(ASSAM_FLOOD_RELIEF_EXAMPLE.plannedMilestones || []);
    toast.success("Loaded verified 'Assam Flood Emergency Relief' campaign template!");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingDocs(true);
    try {
      const newAttachments: DocumentAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const sha256 = await computeFileHash(file);
        const { textSnippet, pdfMetadata } = await extractDocumentText(file);
        let cat: DocumentAttachment["category"] = "other";
        const fname = file.name.toLowerCase();
        if (fname.includes("whitepaper") || fname.includes("wp"))
          cat = "whitepaper";
        else if (
          fname.includes("budget") ||
          fname.includes("finance") ||
          fname.includes("cost")
        )
          cat = "budget";
        else if (fname.includes("pitch") || fname.includes("deck"))
          cat = "pitch_deck";
        else if (fname.includes("spec") || fname.includes("architecture"))
          cat = "technical_spec";
        else if (
          fname.includes("id") ||
          fname.includes("kyc") ||
          fname.includes("reg")
        ) {
          cat = "identity";
        }

        // Upload and Pin file to Pinata IPFS
        const pinResult = await uploadDocumentToPinata(file, file.name, cat);

        newAttachments.push({
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          sha256,
          textSnippet,
          pdfMetadata,
          ipfsCid: pinResult.cid,
          ipfsUrl: pinResult.gatewayUrl,
          category: cat,
        });
      }
      setDocuments((prev) => [...prev, ...newAttachments]);
      toast.success(
        `Uploaded & pinned ${newAttachments.length} document(s) to Pinata IPFS with SHA-256!`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown upload error";
      toast.error("Failed to process documents: " + msg);
    } finally {
      setIsUploadingDocs(false);
      e.target.value = "";
    }
  };

  const removeDocument = (idx: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleTriggerAiScan = async () => {
    setIsScanningAi(true);
    try {
      const report = await runPrivacyAiAudit({
        title: title || "Untitled Campaign",
        tagline: tagline || "",
        category,
        description,
        targetFundingUsdc,
        documents,
        creatorPubkey: address || "unspecified",
        forceLocalOnly: forceLocalPrivacy,
        plannedMilestones: milestones,
      });
      setAiAuditReport(report);
      setTrustScore(report.trustScore);
      toast.success(
        `Privacy AI Audit completed! Generated Trust Score: ${report.trustScore}/100`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown audit error";
      toast.error("AI audit failed: " + msg);
    } finally {
      setIsScanningAi(false);
    }
  };

  const applySuggestedMilestones = () => {
    if (!aiAuditReport || !aiAuditReport.suggestedMilestones.length) return;
    const mapped: CampaignMilestonePlan[] =
      aiAuditReport.suggestedMilestones.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        targetAmountUsdc: m.targetAmountUsdc,
        estimatedDurationDays: m.estimatedDurationDays,
        deliverableCriteria: m.deliverableCriteria,
      }));
    setMilestones(mapped);
    toast.success("Applied AI-crafted milestone roadmap tranches!");
  };

  const addMilestone = () => {
    setMilestones((prev) => [
      ...prev,
      {
        id: prev.length,
        title: `Milestone #${prev.length}`,
        description:
          "Describe what will be delivered for this milestone release.",
        targetAmountUsdc: "5000",
        estimatedDurationDays: 30,
        deliverableCriteria: ["Verifiable deliverable proofs"],
      },
    ]);
  };

  const removeMilestone = (idx: number) => {
    if (milestones.length <= 1) {
      toast.info("A campaign must have at least 1 milestone.");
      return;
    }
    setMilestones((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((m, newIdx) => ({ ...m, id: newIdx }))
    );
  };

  const updateMilestone = (
    idx: number,
    patch: Partial<CampaignMilestonePlan>
  ) => {
    setMilestones((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, ...patch } : m))
    );
  };

  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!title.trim()) errs.title = "Title is required";
      if (!tagline.trim()) errs.tagline = "Tagline is required";
      if (!category) errs.category = "Category is required";
    } else if (s === 2) {
      // Step 2 is docs & AI scan; allow proceeding even if no docs, but warn if no AI scan run
      if (!aiAuditReport) {
        // Auto-run AI audit if not run yet
      }
    } else if (s === 3) {
      if (!description.trim() || description.length < 30) {
        errs.description =
          "Please provide a detailed story of at least 30 characters";
      }
      if (milestones.length === 0) {
        errs.milestones = "At least one planned milestone is required";
      }
    } else if (s === 4) {
      if (!targetFundingUsdc || Number(targetFundingUsdc) <= 0) {
        errs.targetFundingUsdc = "Funding goal must be greater than zero";
      }
      if (!verifier.trim()) {
        errs.verifier = "Verifier Solana public key is required";
      } else if (verifier.trim().length < 32 || verifier.trim().length > 44) {
        errs.verifier = "Invalid base58 Solana address";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = async () => {
    if (validateStep(step)) {
      if (step === 2 && !aiAuditReport) {
        await handleTriggerAiScan();
      } else if (step === 3 && documents.length > 0) {
        // Cross-examine the updated story description against attached documents
        handleTriggerAiScan();
      }
      saveDraft();
      setStep((prev) => Math.min(prev + 1, 5));
    }
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleLaunch = async () => {
    if (!signer || !daoConfig || !address) return;
    if (!validateStep(1) || !validateStep(3) || !validateStep(4)) {
      return;
    }

    const mintInfo = await client.rpc
      .getAccountInfo(daoConfig.stablecoinMint)
      .send()
      .catch(() => ({ value: null }));
    if (!mintInfo.value) {
      toast.error(
        `The configured stablecoin mint (${daoConfig.stablecoinMint.slice(
          0,
          8
        )}...) is not initialized on this cluster. Please configure USDC mint in /admin first.`
      );
      return;
    }

    // Final Trust Score to record on-chain
    const finalTrustScore = aiAuditReport
      ? aiAuditReport.trustScore
      : trustScore;
    const parsedTrust = BigInt(
      Math.max(0, Math.min(100, Number(finalTrustScore) || 50))
    );

    const campaignMetadata: CampaignMetadata = {
      version: "1.1.0",
      title: title.trim(),
      tagline: tagline.trim(),
      category,
      description: description.trim(),
      logoUrl: logoUrl.trim() || undefined,
      bannerUrl: bannerUrl.trim() || undefined,
      websiteUrl: websiteUrl.trim() || undefined,
      twitterUrl: twitterUrl.trim() || undefined,
      githubUrl: githubUrl.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      targetFundingUsdc: targetFundingUsdc.trim(),
      plannedMilestones: milestones,
      documents: documents.map((d) => ({
        name: d.name,
        type: d.type,
        size: d.size,
        sha256: d.sha256,
        category: d.category,
      })),
      aiAudit: aiAuditReport || undefined,
      createdAt: Date.now(),
      creatorAddress: address,
      verifierAddress: verifier.trim(),
    };

    try {
      // 1. Upload to IPFS / Decentralized Storage
      const { cid } = await uploadCampaignMetadata(campaignMetadata);
      setPinnedCid(cid);

      const campaignId = daoConfig.campaignCount;

      // 2. Broadcast on-chain transaction with AI Trust Score
      const sig = await run(
        `Launching Campaign #${campaignId.toString()} with AI Trust Score (${parsedTrust}/100)`,
        () =>
          createCampaignActions({
            creator: signer,
            stablecoinMint: daoConfig.stablecoinMint,
            campaignId,
            metadataCid: cid,
            trustScore: parsedTrust,
            verifier: verifier.trim() as Address,
          })
      );

      setTxSignature(sig);
      setCreatedCampaignId(campaignId);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
    } catch {
      // toast handled in useFydaoTx
    }
  };

  if (txSignature && createdCampaignId !== null) {
    return (
      <Card className="border-primary/40 bg-linear-to-b from-primary/5 to-card p-8 text-center sm:p-12">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <Rocket className="h-8 w-8" />
        </div>
        <CardTitle className="mt-6 text-2xl font-bold">
          Campaign Successfully Created!
        </CardTitle>
        <CardDescription className="mx-auto mt-2 max-w-md text-base">
          Campaign{" "}
          <span className="font-semibold text-foreground">
            #{createdCampaignId.toString()}
          </span>{" "}
          is now registered on Solana with an AI Trust Score of{" "}
          <span className="font-bold text-primary">
            {aiAuditReport?.trustScore || trustScore}/100
          </span>
          .
        </CardDescription>

        <div className="mx-auto mt-6 max-w-lg rounded-2xl bg-muted/40 p-4 text-left font-mono text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">IPFS CID:</span>
            <span className="truncate max-w-[280px] text-foreground font-semibold">
              {pinnedCid}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">On-Chain Trust Score:</span>
            <span className="text-primary font-bold">
              {aiAuditReport?.trustScore || trustScore} / 100 (
              {aiAuditReport?.rating || "Verified"})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Transaction:</span>
            <a
              href={getExplorerUrl(`/tx/${txSignature}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              {txSignature.slice(0, 16)}... <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status:</span>
            <Badge
              variant="outline"
              className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold"
            >
              Pending DAO Verification &amp; Vote
            </Badge>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button onClick={() => router.push("/explore")} variant="secondary">
            Explore Campaigns
          </Button>
          <Link href={`/campaigns/${createdCampaignId.toString()}`}>
            <Button className="gap-2">
              View Campaign &amp; Propose DAO Vote{" "}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-4 w-4" /> Creator Studio
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          Launch a Campaign
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Create an on-chain stablecoin fundraising campaign governed by
          AI-verified documents, milestone deliverables, and the Arthasetu DAO.
        </p>
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STEPS.map((s) => {
          const isActive = step === s.id;
          const isDone = step > s.id;
          return (
            <div
              key={s.id}
              onClick={() => {
                if (step > s.id) setStep(s.id);
              }}
              className={`flex items-center gap-2.5 rounded-xl border p-2.5 transition-all ${
                isActive
                  ? "border-primary bg-primary/5 shadow-xs"
                  : isDone
                    ? "border-border/80 bg-muted/20 cursor-pointer hover:bg-muted/40"
                    : "border-border/40 opacity-60"
              }`}
            >
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-muted-foreground/30 text-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : s.id}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{s.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {s.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 1: Identity & Branding */}
      {step === 1 && (
        <Card className="border-border/60">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>1. Project Identity &amp; Branding</CardTitle>
              <CardDescription>
                Introduce your initiative or load a verified reference template.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadAssamFloodTemplate}
              className="gap-1.5 text-xs bg-primary/5 border-primary/30 text-primary hover:bg-primary/10 shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Load Example: Assam Flood Relief 2026
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="title">Campaign Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Solana Privacy Relayer Protocol"
                className={errors.title ? "border-destructive" : ""}
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tagline">Short Tagline *</Label>
              <Input
                id="tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Non-custodial zero-knowledge relayer network for SVM transactions"
                className={errors.tagline ? "border-destructive" : ""}
              />
              {errors.tagline && (
                <p className="text-xs text-destructive">{errors.tagline}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select
                  value={category}
                  onValueChange={(val) => setCategory(val as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="logoUrl">Logo / Icon URL</Label>
                <Input
                  id="logoUrl"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://... or ipfs://..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bannerUrl">Banner Image URL</Label>
              <Input
                id="bannerUrl"
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                placeholder="https://images.unsplash.com/..."
              />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Presets:</span>
                {SAMPLE_BANNERS.map((banner, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setBannerUrl(banner)}
                    className="h-7 w-12 overflow-hidden rounded-md border border-border/80 hover:ring-2 hover:ring-primary focus:outline-none"
                  >
                    <Image
                      src={banner}
                      alt="preset banner"
                      width={48}
                      height={28}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>

            <Separator className="my-2" />

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="websiteUrl">Website URL</Label>
                <Input
                  id="websiteUrl"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://yourproject.io"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="twitterUrl">Twitter / X</Label>
                <Input
                  id="twitterUrl"
                  value={twitterUrl}
                  onChange={(e) => setTwitterUrl(e.target.value)}
                  placeholder="@yourhandle"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="githubUrl">GitHub Repo</Label>
                <Input
                  id="githubUrl"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/..."
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-border/40 py-4">
            <div />
            <Button onClick={handleNext} className="gap-1.5">
              Next: Docs &amp; AI Audit <ChevronRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 2: Documents & Privacy AI Audit */}
      {step === 2 && (
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-primary" /> 2. Supporting
                  Documents &amp; Privacy AI Audit
                </CardTitle>
                <CardDescription>
                  Upload whitepapers, budget breakdowns, or pitch decks. Our
                  privacy-preserving engine scans documents with zero data
                  retention, checks for AI-generation/authenticity, and
                  calculates an on-chain Trust Score.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Upload Box */}
            <div className="rounded-2xl border-2 border-dashed border-border/80 bg-muted/20 p-6 text-center hover:border-primary/50 transition-colors">
              <Upload className="mx-auto h-9 w-9 text-muted-foreground" />
              <h3 className="mt-2 text-sm font-semibold">
                Upload Whitepaper, Budget Sheet, Pitch Deck, or Specs
              </h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                Files are hashed with SHA-256 in your browser. Supports PDF, MD,
                TXT, JSON, DOCX, CSV.
              </p>
              <div className="mt-4 flex justify-center">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isUploadingDocs}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 pointer-events-none"
                    disabled={isUploadingDocs}
                  >
                    <Plus className="h-4 w-4" />{" "}
                    {isUploadingDocs
                      ? "Processing..."
                      : "Select Document Files"}
                  </Button>
                </label>
              </div>
            </div>

            {/* Document List */}
            {documents.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Attached Document Fingerprints ({documents.length})
                </h4>
                <div className="grid gap-2">
                  {documents.map((doc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl border border-border/80 bg-card p-3 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-semibold truncate">{doc.name}</p>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground font-mono">
                            <span>SHA-256: {doc.sha256.slice(0, 10)}...{doc.sha256.slice(-6)}</span>
                            <span>· {(doc.size / 1024).toFixed(1)} KB</span>
                            {doc.ipfsCid && (
                              <a
                                href={doc.ipfsUrl || `https://gateway.pinata.cloud/ipfs/${doc.ipfsCid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-0.5"
                              >
                                Pinata: {doc.ipfsCid.slice(0, 10)}... <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="secondary"
                          className="capitalize text-[10px]"
                        >
                          {doc.category.replace("_", " ")}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => removeDocument(idx)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Privacy Mode Selector & AI Audit Action */}
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-secondary/10 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                    <Sparkles className="h-4 w-4" /> Privacy-First AI Trust Verification
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Analyzes cross-document consistency, verifies budget math, redacts PII, and generates a Merkle-bound Trust Score.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForceLocalPrivacy(!forceLocalPrivacy)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border font-mono transition-colors flex items-center gap-1.5 ${
                      forceLocalPrivacy
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Shield className="h-3 w-3" />
                    {forceLocalPrivacy ? "Mode: 100% Air-Gapped Local" : "Mode: Zero-Retention Cloud"}
                  </button>

                  <Button
                    type="button"
                    onClick={handleTriggerAiScan}
                    disabled={isScanningAi}
                    className="gap-2 bg-primary text-primary-foreground font-bold shadow-sm"
                  >
                    <Cpu className="h-4 w-4" />
                    {isScanningAi
                      ? "Scanning In-Memory..."
                      : aiAuditReport
                        ? "Re-Run Audit"
                        : "Run AI Audit & Scoring"}
                  </Button>
                </div>
              </div>

              {isScanningAi && (
                <div className="space-y-2 pt-2 animate-pulse">
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>
                      Evaluating authenticity &amp; deliverable verifiability...
                    </span>
                    <span>Analyzing in-memory</span>
                  </div>
                  <Progress value={65} className="h-1.5" />
                </div>
              )}

              {/* AI Report Card */}
              {aiAuditReport && !isScanningAi && (
                <div className="space-y-4 pt-2 border-t border-border/40">
                  {/* Cryptographic Privacy & Attestation Banner */}
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 pb-2">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-primary" /> Cryptographic Integrity &amp; Privacy Attestation
                      </span>
                      <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary capitalize">
                        {aiAuditReport.privacyMode === "local_air_gapped" ? "100% Air-Gapped Local" : "Stateless Zero-Retention"}
                      </Badge>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 text-[11px] font-mono">
                      <div className="space-y-1">
                        <span className="text-muted-foreground">Document Merkle Root:</span>
                        <p className="font-semibold text-foreground truncate bg-background/60 p-1.5 rounded border border-border/40">
                          {aiAuditReport.docMerkleRoot || "00".repeat(32)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground">Canonical SHA-256 Audit Hash:</span>
                        <p className="font-semibold text-primary truncate bg-background/60 p-1.5 rounded border border-border/40">
                          {aiAuditReport.auditHash || "0x..."}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        🛡️ <strong className="text-foreground">{aiAuditReport.redactionsCount?.totalRedacted ?? 0}</strong> sensitive tokens redacted in-memory
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        📊 Linguistic Human Score: <strong className="text-foreground">{aiAuditReport.stylometricMetrics?.burstinessScore ?? 75}/100</strong>
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        {aiAuditReport.budgetAnalysis?.isBalanced ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">✓ Budget Math Balanced (0% variance)</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">⚠️ Budget variance detected</span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                    <div className="rounded-xl bg-card border border-border/60 p-3 text-center">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Trust Score
                      </span>
                      <p className="text-2xl font-extrabold text-primary tabular-nums mt-0.5">
                        {aiAuditReport.trustScore}{" "}
                        <span className="text-xs text-muted-foreground font-normal">
                          / 100
                        </span>
                      </p>
                      <Badge
                        variant="outline"
                        className="mt-1 text-[10px] border-primary/40 bg-primary/10 text-primary"
                      >
                        {aiAuditReport.rating}
                      </Badge>
                    </div>

                    <div className="rounded-xl bg-card border border-border/60 p-3 text-center">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Authenticity
                      </span>
                      <p className="text-2xl font-extrabold text-foreground tabular-nums mt-0.5">
                        {aiAuditReport.subScores.authenticityScore}%
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        Consistency
                      </span>
                    </div>

                    <div className="rounded-xl bg-card border border-primary/30 bg-primary/5 p-3 text-center">
                      <span className="text-[10px] text-primary uppercase font-bold">
                        Story Alignment
                      </span>
                      <p className="text-2xl font-extrabold text-primary tabular-nums mt-0.5">
                        {aiAuditReport.subScores.storyDocumentAlignmentScore ?? 85}%
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        Doc Cross-Check
                      </span>
                    </div>

                    <div className="rounded-xl bg-card border border-border/60 p-3 text-center">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Feasibility
                      </span>
                      <p className="text-2xl font-extrabold text-foreground tabular-nums mt-0.5">
                        {aiAuditReport.subScores.feasibilityScore}%
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        Budget Scope
                      </span>
                    </div>

                    <div className="rounded-xl bg-card border border-border/60 p-3 text-center">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        AI Content Risk
                      </span>
                      <p className="text-2xl font-extrabold text-foreground tabular-nums mt-0.5">
                        {aiAuditReport.aiGeneratedProbability}%
                      </p>
                      <Badge
                        variant="outline"
                        className={`mt-1 text-[10px] ${
                          aiAuditReport.aiGeneratedRisk === "Low"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30"
                            : aiAuditReport.aiGeneratedRisk === "Medium"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                              : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30"
                        }`}
                      >
                        {aiAuditReport.aiGeneratedRisk} Risk
                      </Badge>
                    </div>
                  </div>

                  {/* Story vs Document Alignment Findings */}
                  {((aiAuditReport.storyAlignmentFindings && aiAuditReport.storyAlignmentFindings.length > 0) ||
                    (aiAuditReport.storyDiscrepancies && aiAuditReport.storyDiscrepancies.length > 0)) && (
                    <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <Cpu className="h-4 w-4 text-primary" /> Story vs. Document Cross-Examination
                        </span>
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                          Alignment: {aiAuditReport.subScores.storyDocumentAlignmentScore ?? 85}%
                        </Badge>
                      </div>

                      {aiAuditReport.storyAlignmentFindings && aiAuditReport.storyAlignmentFindings.length > 0 && (
                        <div className="space-y-1">
                          {aiAuditReport.storyAlignmentFindings.map((f, i) => (
                            <p key={i} className="flex items-start gap-1.5 text-muted-foreground">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                              <span>{f}</span>
                            </p>
                          ))}
                        </div>
                      )}

                      {aiAuditReport.storyDiscrepancies && aiAuditReport.storyDiscrepancies.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-border/40">
                          {aiAuditReport.storyDiscrepancies.map((d, i) => (
                            <p key={i} className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                              <span>{d}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Strengths & Warnings */}
                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-xl bg-card/60 border border-border/60 p-3 space-y-1.5">
                      <span className="font-semibold text-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />{" "}
                        Key Strengths
                      </span>
                      <ul className="space-y-1 text-muted-foreground">
                        {aiAuditReport.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-primary">•</span>{" "}
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl bg-card/60 border border-border/60 p-3 space-y-1.5">
                      <span className="font-semibold text-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />{" "}
                        Risk Warnings &amp; Notes
                      </span>
                      <ul className="space-y-1 text-muted-foreground">
                        {aiAuditReport.riskWarnings.length > 0 ? (
                          aiAuditReport.riskWarnings.map((w, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-amber-500">•</span>{" "}
                              <span>{w}</span>
                            </li>
                          ))
                        ) : (
                          <li className="text-muted-foreground italic">
                            No critical risk flags detected.
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {/* AI Suggested Milestones action */}
                  {aiAuditReport.suggestedMilestones &&
                    aiAuditReport.suggestedMilestones.length > 0 && (
                      <div className="flex items-center justify-between rounded-xl bg-primary/10 border border-primary/20 p-3 text-xs">
                        <div className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-primary" />
                          <div>
                            <span className="font-semibold text-foreground">
                              AI-Crafted Milestone Roadmap Available
                            </span>
                            <p className="text-[11px] text-muted-foreground">
                              Auto-generated{" "}
                              {aiAuditReport.suggestedMilestones.length}{" "}
                              structured milestone tranches matching your
                              budget.
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={applySuggestedMilestones}
                          className="gap-1.5 font-semibold text-xs"
                        >
                          <Layers className="h-3.5 w-3.5" /> Apply Milestones
                        </Button>
                      </div>
                    )}
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-border/40 py-4">
            <Button variant="outline" onClick={handleBack} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={handleNext} className="gap-1.5">
              Next: Story &amp; Milestones <ChevronRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 3: Story & Roadmap */}
      {step === 3 && (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>3. Project Story &amp; Milestone Roadmap</CardTitle>
            <CardDescription>
              Detail your technical roadmap. Escrowed stablecoins will be
              released per milestone tranche only upon verifier co-signing and
              DAO approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">
                  Full Project Story &amp; Architecture (Markdown) *
                </Label>
                <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-muted/40 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setStoryTab("write")}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      storyTab === "write"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Write (Markdown)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStoryTab("preview")}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      storyTab === "preview"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Preview
                  </button>
                </div>
              </div>

              {storyTab === "write" ? (
                <Textarea
                  id="description"
                  rows={8}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Write an in-depth story explaining the vision, roadmap, and how escrowed funds will be allocated..."
                  className={
                    errors.description
                      ? "border-destructive font-mono text-xs"
                      : "font-mono text-xs"
                  }
                />
              ) : (
                <div className="rounded-xl border border-border/80 bg-card p-4 min-h-[180px] max-h-[300px] overflow-y-auto">
                  <MarkdownContent content={description} />
                </div>
              )}

              {errors.description && (
                <p className="text-xs text-destructive">{errors.description}</p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" /> Planned
                    Milestone Tranches ({milestones.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Supports 1 single milestone or phased multiple tranches.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {aiAuditReport?.suggestedMilestones?.length && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={applySuggestedMilestones}
                      className="gap-1 text-xs text-primary hover:bg-primary/10"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> AI Suggest
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addMilestone}
                    className="gap-1 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Tranche
                  </Button>
                </div>
              </div>

              {milestones.length === 1 && (
                <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-muted-foreground flex items-center justify-between">
                  <span>
                    ℹ️ <strong>Single Milestone Campaign:</strong> 100% of
                    escrow funds will be disbursed in one release upon
                    completion and DAO approval.
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addMilestone}
                    className="h-6 text-xs text-blue-600 dark:text-blue-400"
                  >
                    <Split className="h-3 w-3 mr-1" /> Split into 2
                  </Button>
                </div>
              )}

              <div className="space-y-3">
                {milestones.map((ms, idx) => (
                  <div
                    key={idx}
                    className="relative rounded-xl border border-border/80 bg-muted/20 p-4 transition-colors hover:border-border"
                  >
                    <div className="flex items-center justify-between pb-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        Tranche #{ms.id}
                      </Badge>
                      {milestones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMilestone(idx)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Milestone Title</Label>
                        <Input
                          value={ms.title}
                          onChange={(e) =>
                            updateMilestone(idx, { title: e.target.value })
                          }
                          placeholder="e.g. Core Program Deployment"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tranche Amount (USDC)</Label>
                        <Input
                          value={ms.targetAmountUsdc}
                          onChange={(e) =>
                            updateMilestone(idx, {
                              targetAmountUsdc: e.target.value,
                            })
                          }
                          placeholder="5000"
                          inputMode="numeric"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="mt-2 space-y-1">
                      <Label className="text-xs">
                        Deliverable Description &amp; Verifiable Criteria
                      </Label>
                      <Input
                        value={ms.description}
                        onChange={(e) =>
                          updateMilestone(idx, { description: e.target.value })
                        }
                        placeholder="Expected deliverable proofs (git commits, test reports, live URL) to be verified"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
              {errors.milestones && (
                <p className="text-xs text-destructive">{errors.milestones}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-border/40 py-4">
            <Button variant="outline" onClick={handleBack} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={handleNext} className="gap-1.5">
              Next: Funding &amp; Verifier <ChevronRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 4: Funding & Verifier */}
      {step === 4 && (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>4. Target Funding &amp; Designated Verifier</CardTitle>
            <CardDescription>
              Configure the fundraising goal and assign the designated verifier
              address required to co-sign milestone deliverable proofs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="targetFundingUsdc">
                  Total Funding Target (USDC) *
                </Label>
                <Input
                  id="targetFundingUsdc"
                  value={targetFundingUsdc}
                  onChange={(e) => setTargetFundingUsdc(e.target.value)}
                  placeholder="25000"
                  inputMode="numeric"
                  className={
                    errors.targetFundingUsdc ? "border-destructive" : ""
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Donations flow directly into the non-custodial campaign escrow
                  ATA.
                </p>
                {errors.targetFundingUsdc && (
                  <p className="text-xs text-destructive">
                    {errors.targetFundingUsdc}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label htmlFor="trustScore">
                    On-Chain Trust Score (AI Generated)
                  </Label>
                  <span className="font-mono text-xs font-bold text-primary">
                    {aiAuditReport ? aiAuditReport.trustScore : trustScore}/100
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="trustScore"
                    value={
                      aiAuditReport ? aiAuditReport.trustScore : trustScore
                    }
                    onChange={(e) =>
                      setTrustScore(Number(e.target.value) || 75)
                    }
                    inputMode="numeric"
                    min="0"
                    max="100"
                    disabled={!!aiAuditReport}
                    className="font-mono"
                  />
                  {aiAuditReport && (
                    <Badge
                      variant="outline"
                      className="bg-primary/10 text-primary border-primary/30 shrink-0"
                    >
                      AI Locked
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {aiAuditReport
                    ? "Cryptographically bound from your privacy document audit."
                    : "Baseline credibility score recorded on Solana."}
                </p>
              </div>
            </div>

            <Separator className="my-2" />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="verifier">
                  Designated Verifier Solana Address *
                </Label>
                {address && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-primary hover:bg-primary/10"
                    onClick={() => setVerifier(address)}
                  >
                    Use My Connected Wallet
                  </Button>
                )}
              </div>
              <Input
                id="verifier"
                value={verifier}
                onChange={(e) => setVerifier(e.target.value)}
                placeholder="e.g. 7YkP9... (Base58 Solana address)"
                className={
                  errors.verifier
                    ? "border-destructive font-mono text-xs"
                    : "font-mono text-xs"
                }
              />
              <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Why is a
                  Designated Verifier required?
                </div>
                <p>
                  To prevent unauthorized or fraudulent milestone claims, the
                  Arthasetu program requires the designated verifier to
                  cryptographically co-sign each milestone deliverable proof CID
                  before DAO governance can vote to release funds.
                </p>
              </div>
              {errors.verifier && (
                <p className="text-xs text-destructive">{errors.verifier}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-border/40 py-4">
            <Button variant="outline" onClick={handleBack} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={handleNext} className="gap-1.5">
              Next: Review &amp; Launch <ChevronRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 5: Review & Launch */}
      {step === 5 && (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>5. Review &amp; Launch Campaign</CardTitle>
            <CardDescription>
              Review your campaign configuration and AI audit summary.
              Submitting will upload the metadata to IPFS and initialize your
              on-chain campaign escrow PDA on Solana.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Preview Card */}
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
              <div className="relative h-36 w-full bg-muted">
                {bannerUrl ? (
                  <Image
                    src={bannerUrl}
                    alt="banner preview"
                    fill
                    sizes="400px"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-r from-primary/20 to-secondary" />
                )}
                <div className="absolute bottom-3 left-4 flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="backdrop-blur-md bg-background/80 capitalize"
                  >
                    {category}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  >
                    Pending DAO Approval
                  </Badge>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {title || "Untitled Campaign"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {tagline || "No tagline provided"}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-border/40 pt-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Goal:</span>
                    <p className="font-semibold text-foreground font-mono">
                      {Number(targetFundingUsdc).toLocaleString()} USDC
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      AI Trust Score:
                    </span>
                    <p className="font-semibold text-primary font-mono">
                      {aiAuditReport ? aiAuditReport.trustScore : trustScore} /
                      100
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Milestones:</span>
                    <p className="font-semibold text-foreground font-mono">
                      {milestones.length} Tranche
                      {milestones.length > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit & Documents Summary */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <FileCheck2 className="h-4 w-4 text-primary" /> Verified
                  Supporting Documents ({documents.length})
                </span>
                {aiAuditReport && (
                  <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary">
                    Merkle Verified
                  </Badge>
                )}
              </div>

              {aiAuditReport && (
                <div className="rounded-lg bg-background/60 p-2.5 border border-border/40 space-y-1 font-mono text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Document Merkle Root:</span>
                    <span className="text-foreground font-semibold">{aiAuditReport.docMerkleRoot.slice(0, 16)}...{aiAuditReport.docMerkleRoot.slice(-8)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Audit Binding Hash:</span>
                    <span className="text-primary font-semibold">{aiAuditReport.auditHash.slice(0, 18)}...</span>
                  </div>
                </div>
              )}

              {documents.length > 0 ? (
                <div className="space-y-1 font-mono text-[11px] text-muted-foreground">
                  {documents.map((d, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="truncate max-w-[240px] text-foreground">
                        {d.name}
                      </span>
                      <span>SHA-256: {d.sha256.slice(0, 12)}...</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground italic">
                  No external document files attached.
                </p>
              )}
            </div>

            {/* Verifier Summary */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-1 text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" /> Designated
                Verifier
              </span>
              <p className="font-mono text-muted-foreground break-all">
                {verifier}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-border/40 py-4">
            <Button variant="outline" onClick={handleBack} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              onClick={handleLaunch}
              disabled={isSending}
              className="gap-2 bg-primary text-primary-foreground font-bold shadow-md hover:bg-primary/90"
            >
              <Rocket className="h-4 w-4" />
              {isSending
                ? "Broadcasting to Solana..."
                : "Sign & Launch Campaign"}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
