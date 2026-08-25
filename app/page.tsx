"use client";

import { useMemo } from "react";
import Link from "next/link";
import { GridBackground } from "./components/grid-background";
import { Navbar } from "./components/navbar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useCluster } from "@/app/components/cluster-context";
import {
  useCampaigns,
  useDaoConfig,
  useMilestones,
  useProposals,
  useGovernanceTokenState,
} from "@/app/lib/hooks/use-fydao";
import { rawToDecimal } from "@/app/lib/fydao/amount";
import { truncate, formatCompact } from "@/app/lib/fydao/format";
import { CampaignCard } from "./components/fydao/campaign-card";
import {
  Shield,
  ShieldCheck,
  Coins,
  Milestone as MilestoneIcon,
  PlusCircle,
  Search,
  Vote,
  HeartHandshake,
  ArrowRight,
  Sparkles,
  Lock,
  RefreshCw,
  Layers,
  FileCheck2,
  Clock,
  ExternalLink,
  Users,
  Settings2,
  BookOpen,
} from "lucide-react";

export default function Home() {
  const { cluster, getExplorerUrl } = useCluster();
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();
  const { data: allMilestones } = useMilestones();
  const { data: daoConfig } = useDaoConfig();
  const { data: proposals } = useProposals();
  const { data: govTokenState } = useGovernanceTokenState();

  // Metrics
  const totalCampaigns = (campaigns ?? []).length;
  const liveCampaigns = (campaigns ?? []).filter((c) => c.account.isLive && !c.account.emergencyWithdrawn);
  const totalDepositedRaw = (campaigns ?? []).reduce((sum, c) => sum + c.account.totalDeposited, 0n);
  const totalReleasedRaw = (campaigns ?? []).reduce((sum, c) => sum + c.account.totalReleased, 0n);
  const releasedMilestonesCount = (allMilestones ?? []).filter((m) => m.account.released).length;
  const totalProposalsCount = (proposals ?? []).length;

  const featuredCampaigns = useMemo(() => {
    return (campaigns ?? [])
      .slice()
      .sort((a, b) => Number(b.account.totalDeposited - a.account.totalDeposited))
      .slice(0, 3);
  }, [campaigns]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-16">
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-b from-card via-card/90 to-primary/5 p-8 sm:p-12 shadow-sm">
          <div className="mx-auto max-w-3xl text-center space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary shadow-xs">
              <Shield className="h-3.5 w-3.5" /> Non-Custodial Escrows · Dual-Signer Verification · DAO Governed
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-foreground leading-[1.15]">
              The Trustless Bridge Between{" "}
              <span className="text-primary bg-clip-text">
                Vision &amp; Capital
              </span>{" "}
              on Solana
            </h1>

            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Creators launch campaigns backed by transparent on-chain stablecoin escrows. Funds are released tranche-by-tranche only upon cryptographic deliverable proof co-signed by designated verifiers and voted by the DAO.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link href="/explore">
                <Button size="lg" className="h-12 px-6 gap-2 bg-primary text-primary-foreground font-bold shadow-md hover:bg-primary/90 text-sm">
                  <Search className="h-4 w-4" /> Explore Campaigns
                </Button>
              </Link>
              <Link href="/campaigns/new">
                <Button size="lg" variant="outline" className="h-12 px-6 gap-2 font-bold text-sm border-border/80 hover:bg-muted">
                  <PlusCircle className="h-4 w-4" /> Launch a Campaign
                </Button>
              </Link>
            </div>
          </div>

          {/* Live Protocol Metrics Strip */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mt-10 pt-8 border-t border-border/40 text-center">
            <div>
              <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Total Escrow Raised</span>
              <p className="text-2xl sm:text-3xl font-extrabold tabular-nums text-foreground mt-0.5">
                {rawToDecimal(totalDepositedRaw, 6)} USDC
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Active Campaigns</span>
              <p className="text-2xl sm:text-3xl font-extrabold tabular-nums text-primary mt-0.5">
                {liveCampaigns.length} <span className="text-sm text-muted-foreground font-normal">of {totalCampaigns}</span>
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Milestones Delivered</span>
              <p className="text-2xl sm:text-3xl font-extrabold tabular-nums text-green-600 dark:text-green-400 mt-0.5">
                {releasedMilestonesCount} Released
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">DAO Governance</span>
              <p className="text-2xl sm:text-3xl font-extrabold tabular-nums text-foreground mt-0.5">
                {totalProposalsCount} Proposals
              </p>
            </div>
          </div>
        </section>

        {/* How It Works (The 4-Step Lifecycle) */}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              How Arthasetu Protects Every Dollar
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              A battle-tested architecture designed to prevent rug-pulls, fake milestones, and buy-vote-dump attacks.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border/80 bg-card p-5 space-y-3 relative overflow-hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                1
              </div>
              <h3 className="font-bold text-base">Launch &amp; Pin IPFS Roadmap</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Creator initializes an on-chain Campaign PDA, designates a trusted third-party verifier, and pins roadmap tranches to IPFS.
              </p>
            </Card>

            <Card className="border-border/80 bg-card p-5 space-y-3 relative overflow-hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                2
              </div>
              <h3 className="font-bold text-base">Non-Custodial Escrow</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Donors deposit USDC into the Campaign&apos;s smart contract vault. Backer contributions are recorded in on-chain Donation PDAs.
              </p>
            </Card>

            <Card className="border-border/80 bg-card p-5 space-y-3 relative overflow-hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                3
              </div>
              <h3 className="font-bold text-base">Dual-Signer Attestation</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Deliverable artifacts (commits, tests, audit URLs) are verified. Creator &amp; Verifier co-sign the on-chain Milestone PDA.
              </p>
            </Card>

            <Card className="border-border/80 bg-card p-5 space-y-3 relative overflow-hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                4
              </div>
              <h3 className="font-bold text-base">Timelocked DAO Release</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                DAO voters approve tranche releases. Once the timelock elapses, funds are atomically released to the creator.
              </p>
            </Card>
          </div>
        </section>

        {/* Featured Live Campaigns */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Featured Campaigns
              </h2>
              <p className="text-xs text-muted-foreground">
                Top crowdfunding initiatives actively raising on Solana.
              </p>
            </div>

            <Link href="/explore">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                View All Campaigns <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          {featuredCampaigns.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-border/80">
              <p className="text-sm text-muted-foreground">No campaigns launched yet. Be the first creator!</p>
              <div className="mt-4">
                <Link href="/campaigns/new">
                  <Button size="sm">Launch Campaign</Button>
                </Link>
              </div>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {featuredCampaigns.map((c) => (
                <CampaignCard
                  key={c.address}
                  campaign={c}
                />
              ))}
            </div>
          )}
        </section>

        {/* Ecosystem Portal Hub Cards */}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-1.5">
            <h2 className="text-2xl font-bold tracking-tight">
              Explore Arthasetu Portals
            </h2>
            <p className="text-xs text-muted-foreground">
              Navigate to specialized workspaces for creators, donors, attestation verifiers, and governance participants.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/explore" className="group block">
              <Card className="h-full border-border/80 bg-card p-5 space-y-3 transition-all hover:border-primary/50 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Search className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-foreground flex items-center justify-between">
                  Campaign Explorer <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                </h3>
                <p className="text-xs text-muted-foreground">
                  Browse verified projects with real-time status filters, category pills, trust score ratings, and view toggles.
                </p>
              </Card>
            </Link>

            <Link href="/portfolio" className="group block">
              <Card className="h-full border-border/80 bg-card p-5 space-y-3 transition-all hover:border-primary/50 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <HeartHandshake className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-foreground flex items-center justify-between">
                  Backer Portfolio &amp; Recourse <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                </h3>
                <p className="text-xs text-muted-foreground">
                  Track your backed campaigns, view cryptographic receipts, and scan for automated M4 emergency refund clawbacks.
                </p>
              </Card>
            </Link>

            <Link href="/verifier" className="group block">
              <Card className="h-full border-border/80 bg-card p-5 space-y-3 transition-all hover:border-primary/50 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-foreground flex items-center justify-between">
                  Milestone Verifier Portal <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                </h3>
                <p className="text-xs text-muted-foreground">
                  Review off-chain deliverable evidence, package proof CIDs to IPFS, and co-sign milestone release attestations.
                </p>
              </Card>
            </Link>

            <Link href="/governance" className="group block">
              <Card className="h-full border-border/80 bg-card p-5 space-y-3 transition-all hover:border-primary/50 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Vote className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-foreground flex items-center justify-between">
                  DAO Governor Hub <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                </h3>
                <p className="text-xs text-muted-foreground">
                  Vote with escrow-locked tokens, track live quorum gauges, monitor timelocks, and trigger atomic executions.
                </p>
              </Card>
            </Link>

            <Link href="/campaigns/new" className="group block">
              <Card className="h-full border-border/80 bg-card p-5 space-y-3 transition-all hover:border-primary/50 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <PlusCircle className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-foreground flex items-center justify-between">
                  Campaign Creator Studio <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                </h3>
                <p className="text-xs text-muted-foreground">
                  4-step wizard to create non-custodial campaigns, define milestones, designate verifiers, and pin metadata to IPFS.
                </p>
              </Card>
            </Link>

            <Link href="/admin" className="group block">
              <Card className="h-full border-border/80 bg-card p-5 space-y-3 transition-all hover:border-primary/50 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Settings2 className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-foreground flex items-center justify-between">
                  Protocol Admin Console <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                </h3>
                <p className="text-xs text-muted-foreground">
                  Protocol bootstrapping, Metaplex metadata setup, test stablecoin faucets, and emergency circuit breakers.
                </p>
              </Card>
            </Link>
          </div>
        </section>

        {/* Security & Cryptographic Shield */}
        <section className="rounded-3xl border border-border/80 bg-muted/20 p-8 sm:p-10 space-y-6">
          <div className="max-w-2xl space-y-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs font-semibold">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Security &amp; Trust Matrix
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Architected for Maximum Capital Security
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Arthasetu implements 6 formal security guarantees (Audit M1–M6) across all smart contracts on Solana.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-1.5 shadow-xs">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-primary" /> Non-Custodial Vaults (M2)
              </span>
              <p className="text-muted-foreground leading-relaxed">
                Funds reside in Associated Token Accounts owned strictly by Program Derived Addresses, immune to single-key drains.
              </p>
            </div>

            <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-1.5 shadow-xs">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <FileCheck2 className="h-3.5 w-3.5 text-primary" /> Dual-Signer Verification (M5)
              </span>
              <p className="text-muted-foreground leading-relaxed">
                Milestone release PDAs strictly enforce co-signatures from both the Creator and the Designated Verifier.
              </p>
            </div>

            <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-1.5 shadow-xs">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 text-primary" /> Donor Refund Recourse (M4)
              </span>
              <p className="text-muted-foreground leading-relaxed">
                In an emergency drain, donors retain on-chain rights to claim pro-rata refunds via DonationRecord PDAs.
              </p>
            </div>

            <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-1.5 shadow-xs">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-primary" /> Vote Token Escrows (M3)
              </span>
              <p className="text-muted-foreground leading-relaxed">
                Voters lock tokens in per-voter escrows during votes, neutralizing flash-loan and buy-vote-dump exploits.
              </p>
            </div>

            <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-1.5 shadow-xs">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" /> Timelocked Execution Delay (M6)
              </span>
              <p className="text-muted-foreground leading-relaxed">
                Passed proposals require a constitutional timelock buffer before permissionless triggers can execute.
              </p>
            </div>

            <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-1.5 shadow-xs">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-primary" /> Two-Step Authority Handover (M1)
              </span>
              <p className="text-muted-foreground leading-relaxed">
                Authority transitions require explicit nomination followed by acceptance by the new key.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/40 pt-8 pb-12 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-mono">
            <span className="font-bold text-foreground">Arthasetu Protocol</span> · Built on Solana SVM &amp; Anchor
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link href="/explore" className="hover:text-foreground transition-colors">Explore</Link>
            <Link href="/portfolio" className="hover:text-foreground transition-colors">Portfolio</Link>
            <Link href="/governance" className="hover:text-foreground transition-colors">Governance</Link>
            <Link href="/verifier" className="hover:text-foreground transition-colors">Verifier</Link>
            <Link href="/admin" className="hover:text-foreground transition-colors">Admin</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
