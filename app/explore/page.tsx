"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "../components/navbar";
import { GridBackground } from "../components/grid-background";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCampaigns, useDaoConfig, useMilestones } from "@/app/lib/hooks/use-fydao";
import { useCampaignMetadata } from "@/app/lib/hooks/use-campaign-metadata";
import { CAMPAIGN_CATEGORIES, resolveIpfsUrl } from "@/app/lib/ipfs";
import { rawToDecimal } from "@/app/lib/fydao/amount";
import { truncate } from "@/app/lib/fydao/format";
import type { Campaign, Milestone } from "@/app/generated/fydao/accounts";
import { CampaignStatusBadge } from "../components/fydao/status-badge";
import {
  Search,
  Filter,
  PlusCircle,
  TrendingUp,
  ShieldCheck,
  Coins,
  ArrowUpDown,
  LayoutGrid,
  List,
  Sparkles,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

export default function ExplorePage() {
  const { data: campaigns, isLoading } = useCampaigns();
  const { data: milestones } = useMilestones();
  const { data: daoConfig } = useDaoConfig();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Metrics summary
  const totalCampaigns = campaigns?.length ?? 0;
  const liveCount = (campaigns ?? []).filter((c) => c.account.isLive && !c.account.emergencyWithdrawn).length;
  const totalRaisedRaw = (campaigns ?? []).reduce((sum, c) => sum + c.account.totalDeposited, 0n);
  const totalReleasedRaw = (campaigns ?? []).reduce((sum, c) => sum + c.account.totalReleased, 0n);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Header & Metrics */}
        <div className="mb-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                <Sparkles className="h-4 w-4" /> Public Escrow Discovery
              </div>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Explore Campaigns
              </h1>
              <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
                Discover transparent on-chain crowdfunding campaigns. Track milestones, verified deliverables, and non-custodial stablecoin escrows on Solana.
              </p>
            </div>

            <Link href="/campaigns/new">
              <Button className="gap-2 bg-primary text-primary-foreground shadow-md hover:bg-primary/90">
                <PlusCircle className="h-4 w-4" /> Launch Campaign
              </Button>
            </Link>
          </div>

          {/* Metric Stats Banner */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="border-border/60 p-4">
              <p className="text-xs text-muted-foreground">Total Campaigns</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{totalCampaigns}</p>
            </Card>
            <Card className="border-border/60 p-4">
              <p className="text-xs text-muted-foreground">Live Escrows</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">{liveCount}</p>
            </Card>
            <Card className="border-border/60 p-4">
              <p className="text-xs text-muted-foreground">Total Raised (USDC)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{rawToDecimal(totalRaisedRaw, 6)}</p>
            </Card>
            <Card className="border-border/60 p-4">
              <p className="text-xs text-muted-foreground">Milestones Released</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{rawToDecimal(totalReleasedRaw, 6)}</p>
            </Card>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="mb-6 space-y-4 rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by campaign title, tagline, creator address, or IPFS CID..."
                className="pl-9 text-xs sm:text-sm h-10"
              />
            </div>

            {/* Sort & Layout Controls */}
            <div className="flex items-center gap-2 shrink-0">
              <Select value={sortBy} onValueChange={(val) => setSortBy(val ?? "newest")}>
                <SelectTrigger className="w-[160px] h-10 text-xs">
                  <div className="flex items-center gap-1.5">
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue placeholder="Sort by" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="most_funded">Most Funded</SelectItem>
                  <SelectItem value="highest_trust">Highest Trust</SelectItem>
                </SelectContent>
              </Select>

              <div className="hidden sm:flex rounded-xl border border-border/80 p-0.5 bg-muted/30">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === "grid" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === "list" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="List view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs border-t border-border/30">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground font-medium mr-1 flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" /> Status:
              </span>
              {[
                { id: "all", label: "All Statuses" },
                { id: "live", label: "Live Funding" },
                { id: "pending", label: "Pending Approval" },
                { id: "high_trust", label: "Trust Score > 75" },
                { id: "withdrawn", label: "Withdrawn" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    statusFilter === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground font-medium mr-1">Category:</span>
              <Select value={categoryFilter} onValueChange={(val) => setCategoryFilter(val ?? "all")}>
                <SelectTrigger className="h-7 text-xs w-[140px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CAMPAIGN_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Campaign List */}
        {isLoading && campaigns === undefined && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="h-72 animate-pulse border-border/40 bg-muted/20" />
            ))}
          </div>
        )}

        {campaigns !== undefined && (
          <CampaignsFilteredGrid
            campaigns={campaigns}
            milestones={milestones ?? []}
            search={search}
            statusFilter={statusFilter}
            categoryFilter={categoryFilter}
            sortBy={sortBy}
            viewMode={viewMode}
          />
        )}
      </main>
    </div>
  );
}

function CampaignsFilteredGrid({
  campaigns,
  milestones,
  search,
  statusFilter,
  categoryFilter,
  sortBy,
  viewMode,
}: {
  campaigns: Array<{ address: string; account: Campaign }>;
  milestones: Array<{ address: string; account: Milestone }>;
  search: string;
  statusFilter: string;
  categoryFilter: string;
  sortBy: string;
  viewMode: "grid" | "list";
}) {
  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      const acc = c.account;

      // Status filter
      if (statusFilter === "live" && (!acc.isLive || acc.emergencyWithdrawn)) return false;
      if (statusFilter === "pending" && acc.isLive) return false;
      if (statusFilter === "high_trust" && acc.trustScore < 75n) return false;
      if (statusFilter === "withdrawn" && !acc.emergencyWithdrawn) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesAddress = c.address.toLowerCase().includes(q);
        const matchesCreator = acc.creator.toLowerCase().includes(q);
        const matchesCid = acc.metadataCid.toLowerCase().includes(q);
        const matchesId = acc.campaignId.toString().includes(q);
        if (!matchesAddress && !matchesCreator && !matchesCid && !matchesId) {
          return false;
        }
      }

      return true;
    });
  }, [campaigns, search, statusFilter]);

  const sorted = useMemo(() => {
    return filtered.slice().sort((a, b) => {
      if (sortBy === "newest") return Number(b.account.campaignId - a.account.campaignId);
      if (sortBy === "oldest") return Number(a.account.campaignId - b.account.campaignId);
      if (sortBy === "most_funded") return Number(b.account.totalDeposited - a.account.totalDeposited);
      if (sortBy === "highest_trust") return Number(b.account.trustScore - a.account.trustScore);
      return 0;
    });
  }, [filtered, sortBy]);

  if (sorted.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed border-border/80">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Search className="h-6 w-6" />
        </div>
        <p className="mt-4 text-base font-semibold">No campaigns matched your filters</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
          Try clearing search filters or create a new campaign to kickstart funding.
        </p>
        <div className="mt-6">
          <Link href="/campaigns/new">
            <Button size="sm" className="gap-1.5">
              <PlusCircle className="h-4 w-4" /> Launch New Campaign
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className={viewMode === "grid" ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3" : "space-y-4"}>
      {sorted.map((c) => (
        <ExplorerCampaignCard
          key={c.address}
          campaign={c}
          milestones={milestones.filter((m) => m.account.campaign === c.address)}
          viewMode={viewMode}
        />
      ))}
    </div>
  );
}

function ExplorerCampaignCard({
  campaign,
  milestones,
  viewMode,
}: {
  campaign: { address: string; account: Campaign };
  milestones: Array<{ address: string; account: Milestone }>;
  viewMode: "grid" | "list";
}) {
  const c = campaign.account;
  const { data: metadata } = useCampaignMetadata(c.metadataCid);
  const releasedPct =
    c.totalDeposited > 0n
      ? Number((c.totalReleased * 10000n) / c.totalDeposited) / 100
      : 0;

  const bannerImg = metadata?.bannerUrl ? resolveIpfsUrl(metadata.bannerUrl) : null;
  const releasedCount = milestones.filter((m) => m.account.released).length;

  if (viewMode === "list") {
    return (
      <Link href={`/campaigns/${c.campaignId.toString()}`}>
        <Card className="border-border/60 hover:border-primary/50 transition-all hover:shadow-sm p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {bannerImg ? (
                <Image
                  src={bannerImg}
                  alt={metadata?.title || "Campaign banner"}
                  width={80}
                  height={56}
                  className="h-14 w-20 rounded-xl object-cover shrink-0"
                />
              ) : (
                <div className="h-14 w-20 rounded-xl bg-gradient-to-br from-primary/20 to-secondary shrink-0 flex items-center justify-center font-bold text-xs text-primary">
                  #{c.campaignId.toString()}
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold truncate text-base hover:text-primary transition-colors">
                    {metadata?.title || `Campaign #${c.campaignId.toString()}`}
                  </span>
                  <CampaignStatusBadge isLive={c.isLive} emergencyWithdrawn={c.emergencyWithdrawn} />
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-lg">
                  {metadata?.tagline || `Creator: ${truncate(c.creator)} · Verifier: ${truncate(c.verifier)}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 shrink-0 text-xs">
              <div className="text-right">
                <span className="text-muted-foreground">Raised</span>
                <p className="font-bold tabular-nums">{rawToDecimal(c.totalDeposited, 6)} USDC</p>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground">Trust Score</span>
                <p className="font-bold tabular-nums text-primary">{c.trustScore.toString()}/100</p>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground">Milestones</span>
                <p className="font-semibold tabular-nums">{releasedCount}/{c.milestoneCount.toString()}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={`/campaigns/${c.campaignId.toString()}`} className="group block">
      <Card className="overflow-hidden border-border/60 hover:border-primary/50 transition-all hover:shadow-md h-full flex flex-col">
        <div className="relative h-36 w-full overflow-hidden bg-muted">
          {bannerImg ? (
            <Image
              src={bannerImg}
              alt={metadata?.title || "Campaign banner"}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/20 via-background to-secondary flex items-center justify-center text-muted-foreground font-mono text-sm">
              Campaign #{c.campaignId.toString()}
            </div>
          )}
          <div className="absolute top-3 right-3">
            <CampaignStatusBadge isLive={c.isLive} emergencyWithdrawn={c.emergencyWithdrawn} />
          </div>
          {metadata?.category && (
            <div className="absolute bottom-3 left-3">
              <Badge variant="secondary" className="backdrop-blur-md bg-background/80 capitalize text-xs">
                {metadata.category}
              </Badge>
            </div>
          )}
        </div>

        <CardContent className="p-4 space-y-4 flex-1 flex flex-col justify-between">
          <div className="space-y-1.5">
            <h3 className="font-bold text-base line-clamp-1 group-hover:text-primary transition-colors">
              {metadata?.title || `Campaign #${c.campaignId.toString()}`}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
              {metadata?.tagline || `On-chain fundraising campaign with ${c.milestoneCount.toString()} milestone phases.`}
            </p>
          </div>

          <div className="space-y-3 pt-2 border-t border-border/40">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Raised in Escrow</span>
                <span className="font-bold tabular-nums">
                  {rawToDecimal(c.totalDeposited, 6)} USDC
                  {metadata?.targetFundingUsdc && (
                    <span className="text-muted-foreground font-normal"> / {metadata.targetFundingUsdc}</span>
                  )}
                </span>
              </div>
              <Progress value={releasedPct} className="h-1.5" />
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/30 p-2 text-center text-xs">
              <div>
                <span className="text-[10px] text-muted-foreground">Trust Score</span>
                <p className="font-bold tabular-nums text-foreground">{c.trustScore.toString()}/100</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">Milestones</span>
                <p className="font-bold tabular-nums text-foreground">{releasedCount}/{c.milestoneCount.toString()}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">Creator</span>
                <p className="font-mono text-[10px] text-foreground truncate">{truncate(c.creator)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
