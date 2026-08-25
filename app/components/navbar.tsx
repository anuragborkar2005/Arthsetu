"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { ClusterSelect } from "./cluster-select";
import { WalletButton } from "./wallet-button";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, ShieldCheck, Vote, Compass, HeartHandshake } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const isHome = pathname === "/";
  const isExplore = pathname === "/explore";
  const isGovernance = pathname.startsWith("/governance");
  const isVerifier = pathname === "/verifier";
  const isPortfolio = pathname === "/portfolio";
  const isCreate = pathname === "/campaigns/new";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold shadow-sm">
              अ
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight">
                Arthasetu
              </span>
              <span className="text-[10px] text-muted-foreground leading-none">
                Milestone Crowdfund DAO
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            <Link
              href="/"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                isHome
                  ? "bg-secondary text-secondary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Compass className="h-4 w-4" />
              Overview
            </Link>
            <Link
              href="/explore"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                isExplore
                  ? "bg-secondary text-secondary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Search className="h-4 w-4" />
              Explore
            </Link>
            <Link
              href="/portfolio"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                isPortfolio
                  ? "bg-secondary text-secondary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <HeartHandshake className="h-4 w-4" />
              My Portfolio
            </Link>
            <Link
              href="/governance"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                isGovernance
                  ? "bg-secondary text-secondary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Vote className="h-4 w-4" />
              Governance
            </Link>
            <Link
              href="/verifier"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                isVerifier
                  ? "bg-secondary text-secondary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              Verifier
            </Link>
            <Link
              href="/campaigns/new"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                isCreate
                  ? "bg-secondary text-secondary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <PlusCircle className="h-4 w-4" />
              Create
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/portfolio" className="md:hidden">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="My Portfolio">
              <HeartHandshake className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/campaigns/new" className="md:hidden">
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
              <PlusCircle className="h-3.5 w-3.5" />
              Create
            </Button>
          </Link>
          <ThemeToggle />
          <ClusterSelect />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
