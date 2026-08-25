"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "../components/navbar";
import { GridBackground } from "../components/grid-background";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCluster } from "@/app/components/cluster-context";
import { useSolanaClient } from "@/app/lib/solana-client-context";
import {
  useDaoConfig,
  useFydaoTx,
  useFydaoWallet,
  useGovernanceTokenState,
  useMintInfo,
  useTokenBalance,
  useSolBalance,
} from "@/app/lib/hooks/use-fydao";
import {
  acceptAuthorityActions,
  initializeDaoActions,
  initializeGovernanceTokenActions,
  mintGovernanceTokensActions,
  setPausedActions,
} from "@/app/lib/fydao/actions";
import {
  createAtaInstruction,
  createMintWithAuthority,
  mintToInstruction,
  type CreatedMint,
} from "@/app/lib/fydao/mints";
import { findAta } from "@/app/lib/fydao/pdas";
import {
  formatCompact,
  truncate,
  formatDuration,
} from "@/app/lib/fydao/format";
import { parseTokenAmount, rawToDecimal } from "@/app/lib/fydao/amount";
import {
  GENESIS_AUTHORITY,
  USDC_MINT,
  getClusterUsdcMint,
} from "@/app/lib/fydao/constants";
import { lamports, type Address } from "@solana/kit";
import { ConnectGate } from "../components/fydao/shared";
import {
  ShieldAlert,
  ShieldCheck,
  Coins,
  Settings2,
  Lock,
  Unlock,
  AlertTriangle,
  ExternalLink,
  Flame,
  KeyRound,
  RefreshCw,
  Sliders,
  Sparkles,
  Zap,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

function saveSecret(key: string, secret: Uint8Array) {
  try {
    localStorage.setItem(key, btoa(String.fromCharCode(...secret)));
  } catch {
    // ignore
  }
}

function loadSecret(key: string): Uint8Array | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function saveMint(prefix: string, cluster: string, mint: MintState) {
  try {
    localStorage.setItem(`${prefix}:addr:${cluster}`, mint.address);
    saveSecret(`${prefix}:key:${cluster}`, mint.key);
  } catch {
    // ignore
  }
}

function loadMint(prefix: string, cluster: string): MintState | null {
  try {
    const address = localStorage.getItem(`${prefix}:addr:${cluster}`);
    const key = loadSecret(`${prefix}:key:${cluster}`);
    if (!address || !key) return null;
    return { address: address as Address, key };
  } catch {
    return null;
  }
}

type MintState = { address: Address; key: Uint8Array };

const DAO_PARAMS = {
  votingDelaySecs: "0",
  votingPeriodSecs: "604800",
  quorumBps: "4000",
  proposalThresholdTokens: "100",
  maxGovernanceSupplyTokens: "1000000",
  timelockDelaySecs: "3600",
};

export default function ProtocolAdminPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <ConnectGate>
          <AdminDashboard />
        </ConnectGate>
      </main>
    </div>
  );
}

function AdminDashboard() {
  const { cluster, getExplorerUrl } = useCluster();
  const client = useSolanaClient();
  const { address, signer } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();
  const { data: daoConfig, isLoading } = useDaoConfig();
  const { data: govTokenState } = useGovernanceTokenState();

  const [activeTab, setActiveTab] = useState("bootstrap");
  const [govMint, setGovMint] = useState<MintState | null>(() =>
    typeof window === "undefined" ? null : loadMint("fydao:govMint", cluster)
  );
  const [mockUsdc, setMockUsdc] = useState<MintState | null>(() =>
    typeof window === "undefined" ? null : loadMint("fydao:usdcMint", cluster)
  );
  const [params, setParams] = useState(DAO_PARAMS);
  const [govMeta, setGovMeta] = useState({
    name: "Arthasetu Governance",
    symbol: "ARTHA",
    uri: "https://ipfs.io/ipfs/bafkreih...",
  });
  const [mintAmount, setMintAmount] = useState("10000");
  const [faucetRecipient, setFaucetRecipient] = useState(address || "");
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  const govMintAddress = govMint?.address;
  const mockUsdcAddress =
    cluster === "localnet"
      ? (mockUsdc?.address as Address | undefined)
      : undefined;

  const stablecoinMint: Address | undefined =
    daoConfig?.stablecoinMint ??
    (cluster === "localnet" ? mockUsdcAddress : getClusterUsdcMint(cluster));

  const { data: govMintInfo } = useMintInfo(govMintAddress);
  const { data: treasuryBalance } = useTokenBalance(
    daoConfig?.authority ?? null,
    daoConfig?.stablecoinMint ?? null
  );
  const { data: solBalance, mutate: refreshSol } = useSolBalance(address);

  const isGenesis = address === GENESIS_AUTHORITY;
  const isAuthority = address === daoConfig?.authority || isGenesis;
  const effectiveGovMint: Address | undefined =
    daoConfig?.governanceMint ?? (govMintAddress as Address | undefined);

  // Auto-validate cached mints against active cluster to detect wiped validators
  useEffect(() => {
    let active = true;
    if (govMintAddress) {
      client.rpc
        .getAccountInfo(govMintAddress)
        .send()
        .then((info) => {
          if (active && !info.value) {
            localStorage.removeItem(`fydao:govMint:addr:${cluster}`);
            localStorage.removeItem(`fydao:govMint:key:${cluster}`);
            setGovMint(null);
          }
        })
        .catch(() => {});
    }
    if (mockUsdcAddress) {
      client.rpc
        .getAccountInfo(mockUsdcAddress)
        .send()
        .then((info) => {
          if (active && !info.value) {
            localStorage.removeItem(`fydao:usdcMint:addr:${cluster}`);
            localStorage.removeItem(`fydao:usdcMint:key:${cluster}`);
            setMockUsdc(null);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [cluster, client, govMintAddress, mockUsdcAddress]);

  const airdropSol = async () => {
    if (!address) return;
    const loading = toast.loading("Requesting 5 SOL airdrop...");
    try {
      await client.rpc
        .requestAirdrop(address as Address, lamports(5_000_000_000n), {
          commitment: "confirmed",
        })
        .send();
      toast.success("Airdropped 5 SOL to wallet!", { id: loading });
      refreshSol();
    } catch (err: any) {
      toast.error(
        err?.message ||
          "Airdrop failed. If on localnet, ensure validator is running with --rpc-port 8899.",
        { id: loading }
      );
    }
  };

  const clearStaleCache = () => {
    try {
      localStorage.removeItem(`fydao:govMint:addr:${cluster}`);
      localStorage.removeItem(`fydao:govMint:key:${cluster}`);
      localStorage.removeItem(`fydao:usdcMint:addr:${cluster}`);
      localStorage.removeItem(`fydao:usdcMint:key:${cluster}`);
      setGovMint(null);
      setMockUsdc(null);
      toast.success("Cleared local cached mint addresses!");
    } catch {
      // ignore
    }
  };

  const createGovMint = async (): Promise<MintState | null> => {
    if (!signer) return null;
    let result: CreatedMint | undefined;
    await run("Creating Governance SPL Mint", async () => {
      result = await createMintWithAuthority(
        client,
        signer,
        GENESIS_AUTHORITY,
        6
      );
      return result.instructions;
    });
    if (result) {
      const state: MintState = {
        address: (result as CreatedMint).mintAddress,
        key: (result as CreatedMint).privateKey,
      };
      setGovMint(state);
      saveMint("fydao:govMint", cluster, state);
      toast.success("Governance mint initialized!");
      return state;
    }
    return null;
  };

  const createMockUsdc = async (): Promise<MintState | null> => {
    if (!signer || cluster !== "localnet") return null;
    let result: CreatedMint | undefined;
    await run("Creating Mock USDC Mint on Localnet", async () => {
      result = await createMintWithAuthority(
        client,
        signer,
        GENESIS_AUTHORITY,
        6
      );
      return result.instructions;
    });
    if (result) {
      const state: MintState = {
        address: (result as CreatedMint).mintAddress,
        key: (result as CreatedMint).privateKey,
      };
      setMockUsdc(state);
      saveMint("fydao:usdcMint", cluster, state);
      toast.success("Mock USDC mint created!");
      return state;
    }
    return null;
  };

  const createTreasury = async () => {
    if (!signer || !stablecoinMint) {
      toast.error("Please create or select a valid stablecoin mint first.");
      return;
    }
    const mintCheck = await client.rpc
      .getAccountInfo(stablecoinMint)
      .send()
      .catch(() => ({ value: null }));
    if (!mintCheck.value) {
      toast.error(
        `Stablecoin mint ${stablecoinMint} is not initialized on this cluster. On Localnet, please click 'Create Mock USDC Mint' first!`
      );
      return;
    }
    await run("Creating DAO Treasury Token Account", async () => {
      const [treasury] = await findAta(GENESIS_AUTHORITY, stablecoinMint);
      const info = await client.rpc
        .getAccountInfo(treasury)
        .send()
        .catch(() => ({ value: null }));
      if (info.value) {
        toast.info("Treasury token account already exists!");
        return [];
      }
      return [
        await createAtaInstruction(signer, GENESIS_AUTHORITY, stablecoinMint),
      ];
    });
  };

  const initDao = async () => {
    if (!signer) return;
    if (!effectiveGovMint) {
      toast.error("Please create the governance mint first!");
      return;
    }
    if (!stablecoinMint) {
      toast.error("Please create the mock USDC mint first!");
      return;
    }

    const govCheck = await client.rpc
      .getAccountInfo(effectiveGovMint)
      .send()
      .catch(() => ({ value: null }));
    if (!govCheck.value) {
      toast.error(
        "Governance mint does not exist on this cluster. Click 'Create Governance Mint' first."
      );
      return;
    }
    const usdcCheck = await client.rpc
      .getAccountInfo(stablecoinMint)
      .send()
      .catch(() => ({ value: null }));
    if (!usdcCheck.value) {
      toast.error(
        "Stablecoin mint does not exist on this cluster. Click 'Create Mock USDC' first."
      );
      return;
    }

    const [treasury] = await findAta(GENESIS_AUTHORITY, stablecoinMint);
    const treasuryCheck = await client.rpc
      .getAccountInfo(treasury)
      .send()
      .catch(() => ({ value: null }));
    if (!treasuryCheck.value) {
      toast.error(
        "Treasury token account does not exist. Click 'Create Treasury ATA' first."
      );
      return;
    }

    const votingDelay = BigInt(params.votingDelaySecs || "0");
    const votingPeriod = BigInt(params.votingPeriodSecs || "0");
    const timelockDelay = BigInt(params.timelockDelaySecs || "0");
    const proposalThreshold =
      parseTokenAmount(params.proposalThresholdTokens, 6) ?? 0n;
    const maxGovernanceSupply =
      parseTokenAmount(params.maxGovernanceSupplyTokens, 6) ?? 0n;

    await run("Initializing Arthasetu DAO Config PDA", () =>
      initializeDaoActions({
        authority: signer,
        governanceMint: effectiveGovMint,
        stablecoinMint,
        treasuryTokenAccount: treasury,
        votingDelay,
        votingPeriod,
        quorumBps: Math.max(0, Math.min(10_000, Number(params.quorumBps) || 0)),
        proposalThreshold,
        maxGovernanceSupply,
        timelockDelay,
      })
    );
  };

  // 1-Click Auto Bootstrap Wizard
  const handleAutoBootstrap = async () => {
    if (!signer || !isGenesis) {
      toast.error("Only the Genesis Authority can bootstrap the protocol.");
      return;
    }

    setIsBootstrapping(true);
    try {
      // 0. Ensure wallet is funded with SOL
      const balance = await client.rpc
        .getBalance(address as Address)
        .send()
        .catch(() => ({ value: 0n }));
      if (balance.value < 100_000_000n) {
        toast.info("Funding wallet with 5 SOL for local setup fees...");
        try {
          await client.rpc
            .requestAirdrop(address as Address, lamports(5_000_000_000n), {
              commitment: "confirmed",
            })
            .send();
          refreshSol();
        } catch {
          // ignore
        }
      }
      // 1. Create Governance Mint if needed (verify on-chain existence)
      let currentGov = govMint;
      let govExists = false;
      if (currentGov) {
        const check = await client.rpc
          .getAccountInfo(currentGov.address)
          .send()
          .catch(() => ({ value: null }));
        if (check.value) govExists = true;
      }
      if (!govExists) {
        toast.info("Step 1/4: Creating fresh Governance Token Mint...");
        currentGov = await createGovMint();
        if (!currentGov) throw new Error("Failed to create governance mint");
      }

      // 2. Create Mock USDC if on localnet (verify on-chain existence)
      let currentUsdc = mockUsdc;
      let effectiveStablecoin: Address;
      if (cluster === "localnet") {
        let usdcExists = false;
        if (currentUsdc) {
          const check = await client.rpc
            .getAccountInfo(currentUsdc.address)
            .send()
            .catch(() => ({ value: null }));
          if (check.value) usdcExists = true;
        }
        if (!usdcExists) {
          toast.info("Step 2/4: Creating fresh Mock USDC Mint...");
          currentUsdc = await createMockUsdc();
          if (!currentUsdc) throw new Error("Failed to create mock USDC mint");
        }
        effectiveStablecoin = currentUsdc!.address;
      } else {
        effectiveStablecoin = getClusterUsdcMint(cluster);
      }

      // 3. Create Treasury ATA
      toast.info("Step 3/4: Initializing Treasury Token Account...");
      const [treasury] = await findAta(GENESIS_AUTHORITY, effectiveStablecoin);
      const treasuryInfo = await client.rpc
        .getAccountInfo(treasury)
        .send()
        .catch(() => ({ value: null }));
      if (!treasuryInfo.value) {
        await run("Creating Treasury Token Account", async () => [
          await createAtaInstruction(
            signer,
            GENESIS_AUTHORITY,
            effectiveStablecoin
          ),
        ]);
      }

      // 4. Initialize DAO Program
      toast.info("Step 4/4: Initializing DAO Governor PDA...");
      const votingDelay = BigInt(params.votingDelaySecs || "0");
      const votingPeriod = BigInt(params.votingPeriodSecs || "0");
      const timelockDelay = BigInt(params.timelockDelaySecs || "0");
      const proposalThreshold =
        parseTokenAmount(params.proposalThresholdTokens, 6) ?? 0n;
      const maxGovernanceSupply =
        parseTokenAmount(params.maxGovernanceSupplyTokens, 6) ?? 0n;

      await run("Bootstrapping DAO Constitution", () =>
        initializeDaoActions({
          authority: signer,
          governanceMint: currentGov!.address,
          stablecoinMint: effectiveStablecoin,
          treasuryTokenAccount: treasury,
          votingDelay,
          votingPeriod,
          quorumBps: Math.max(
            0,
            Math.min(10_000, Number(params.quorumBps) || 0)
          ),
          proposalThreshold,
          maxGovernanceSupply,
          timelockDelay,
        })
      );

      toast.success("🎉 Arthasetu Protocol successfully bootstrapped!");
    } catch (err: any) {
      toast.error(err?.message || "Bootstrap failed");
    } finally {
      setIsBootstrapping(false);
    }
  };

  const initGovToken = async () => {
    if (!signer || !effectiveGovMint) return;
    await run("Initializing Metaplex Metadata CPI for Governance Token", () =>
      initializeGovernanceTokenActions({
        authority: signer,
        currentMintAuthority: signer,
        governanceMint: effectiveGovMint,
        name: govMeta.name.trim() || "Arthasetu Governance",
        symbol: govMeta.symbol.trim() || "ARTHA",
        uri: govMeta.uri.trim(),
      })
    );
  };

  const mintGovTokens = async () => {
    if (!signer || !effectiveGovMint) return;
    const amount = parseTokenAmount(mintAmount, 6);
    if (!amount || amount <= 0n) return;
    const [ata] = await findAta(signer.address, effectiveGovMint);
    await run("Minting Governance Tokens to Operator ATA", async () => {
      const info = await client.rpc
        .getAccountInfo(ata)
        .send()
        .catch(() => ({ value: null }));
      const instructions = [];
      if (!info.value) {
        instructions.push(
          await createAtaInstruction(signer, signer.address, effectiveGovMint)
        );
      }
      instructions.push(
        ...(await mintGovernanceTokensActions({
          authority: signer,
          governanceMint: effectiveGovMint,
          amount,
        }))
      );
      return instructions;
    });
  };

  const airdropMockUsdc = async () => {
    if (!signer || !mockUsdcAddress) return;
    const target = (faucetRecipient || address || "") as Address;
    const amount = parseTokenAmount("100000", 6);
    if (!amount) return;
    await run("Minting 100,000 Test USDC", async () => {
      const [ata] = await findAta(target, mockUsdcAddress);
      const info = await client.rpc
        .getAccountInfo(ata)
        .send()
        .catch(() => ({ value: null }));
      const instructions = [];
      if (!info.value) {
        instructions.push(
          await createAtaInstruction(signer, target, mockUsdcAddress)
        );
      }
      instructions.push(
        await mintToInstruction(signer, target, mockUsdcAddress, amount)
      );
      return instructions;
    });
    toast.success("Airdropped 100,000 test USDC!");
  };

  const togglePause = async () => {
    if (!signer || !daoConfig) return;
    await run(
      daoConfig.paused
        ? "Resuming Protocol Operations"
        : "Tripping Emergency Circuit Breaker (Pause)",
      () =>
        setPausedActions({
          authority: signer,
          paused: !daoConfig.paused,
        })
    );
  };

  const acceptAuthority = async () => {
    if (!signer) return;
    await run("Accepting Protocol Authority", () =>
      acceptAuthorityActions({ pendingAuthority: signer })
    );
  };

  const pendingAuthority =
    daoConfig &&
    daoConfig.pendingAuthority !== "11111111111111111111111111111111"
      ? daoConfig.pendingAuthority
      : null;

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-card via-card to-primary/5 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Settings2 className="h-4 w-4" /> Protocol Administration &amp;
              Operations
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Arthasetu System Console
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
              Bootstrap DAO constitutional parameters, initialize token
              metadata, mint test stablecoins, and manage the protocol emergency
              circuit breaker.
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/80 p-4 font-mono text-xs space-y-1.5 shrink-0 backdrop-blur-sm">
            <p className="text-muted-foreground">Connected Key:</p>
            <p className="font-bold text-foreground">
              {truncate(address || "")}
            </p>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-muted-foreground">SOL Balance:</span>
              <span className="font-bold text-foreground">
                {solBalance !== undefined
                  ? (Number(solBalance) / 1e9).toFixed(3) + " SOL"
                  : "—"}
              </span>
            </div>
            <div className="pt-1 flex items-center justify-between gap-2">
              {isGenesis ? (
                <Badge className="bg-green-600 text-white font-sans text-[10px]">
                  Genesis Authority (Root)
                </Badge>
              ) : isAuthority ? (
                <Badge className="bg-primary text-primary-foreground font-sans text-[10px]">
                  Protocol Authority
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-muted-foreground font-sans text-[10px]"
                >
                  Read-Only Audit Mode
                </Badge>
              )}
              {(cluster === "localnet" || cluster === "devnet") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={airdropSol}
                  className="h-6 text-[10px] px-2 gap-1 border-primary/40 text-primary hover:bg-primary/10"
                >
                  <Zap className="h-3 w-3" /> Airdrop 5 SOL
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-6 pt-6 border-t border-border/40">
          <div>
            <span className="text-xs text-muted-foreground">
              Circuit Breaker
            </span>
            <div className="mt-1">
              {daoConfig ? (
                <Badge variant={daoConfig.paused ? "destructive" : "secondary"}>
                  {daoConfig.paused
                    ? "Paused (Emergency)"
                    : "Live (Operational)"}
                </Badge>
              ) : (
                <Badge variant="outline">Uninitialized</Badge>
              )}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">
              Genesis Authority
            </span>
            <p className="font-mono text-xs font-bold text-foreground mt-1">
              {truncate(GENESIS_AUTHORITY)}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">
              Active Cluster
            </span>
            <p className="font-bold text-sm text-primary capitalize mt-0.5">
              {cluster}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Treasury Balance
              </span>
              {cluster === "localnet" && (
                <button
                  type="button"
                  onClick={clearStaleCache}
                  className="text-[10px] text-primary hover:underline"
                  title="Clear cached mint keys from local storage"
                >
                  Reset Cache
                </button>
              )}
            </div>
            <p className="text-sm font-bold tabular-nums text-foreground mt-0.5">
              {treasuryBalance
                ? `${formatCompact(treasuryBalance.amount, treasuryBalance.decimals)} USDC`
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* 1-Click Bootstrap Quick Banner (if DAO not initialized) */}
      {!daoConfig && isGenesis && (
        <Card className="border-primary/40 bg-gradient-to-r from-primary/10 via-card to-primary/5 p-6 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1 max-w-xl">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="text-base font-bold">
                  1-Click Complete Protocol Bootstrap
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Automatically creates the governance mint, sets up the
                stablecoin mint, initializes the treasury ATA, and broadcasts
                the on-chain DAO constitution in one unified flow.
              </p>
            </div>
            <Button
              onClick={handleAutoBootstrap}
              disabled={isBootstrapping || isSending}
              className="bg-primary text-primary-foreground font-bold shadow-md hover:bg-primary/90 text-xs h-10 px-5 gap-2 shrink-0"
            >
              <Zap className="h-4 w-4" />{" "}
              {isBootstrapping
                ? "Bootstrapping on Solana..."
                : "⚡ 1-Click Protocol Bootstrap"}
            </Button>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full space-y-6"
      >
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="bootstrap" className="text-xs">
            1 · Bootstrap &amp; Config
          </TabsTrigger>
          <TabsTrigger value="tokens" className="text-xs">
            2 · Tokenomics
          </TabsTrigger>
          <TabsTrigger value="faucet" className="text-xs">
            3 · Test Faucet
          </TabsTrigger>
          <TabsTrigger value="emergency" className="text-xs">
            4 · Emergency &amp; Handover
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Bootstrap & Config */}
        <TabsContent value="bootstrap" className="space-y-6">
          {!daoConfig ? (
            <Card className="border-primary/40 p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Step-by-Step
                  Manual Initialization
                </h3>
                <p className="text-xs text-muted-foreground">
                  Configure each on-chain parameter individually.
                </p>
              </div>
              <Separator />

              <div className="grid gap-4 sm:grid-cols-3 text-xs">
                <div className="space-y-1.5">
                  <Label>Voting Delay (seconds)</Label>
                  <Input
                    value={params.votingDelaySecs}
                    onChange={(e) =>
                      setParams((p) => ({
                        ...p,
                        votingDelaySecs: e.target.value,
                      }))
                    }
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Voting Period (seconds)</Label>
                  <Input
                    value={params.votingPeriodSecs}
                    onChange={(e) =>
                      setParams((p) => ({
                        ...p,
                        votingPeriodSecs: e.target.value,
                      }))
                    }
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Timelock Delay (seconds)</Label>
                  <Input
                    value={params.timelockDelaySecs}
                    onChange={(e) =>
                      setParams((p) => ({
                        ...p,
                        timelockDelaySecs: e.target.value,
                      }))
                    }
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Quorum (basis points, 4000 = 40%)</Label>
                  <Input
                    value={params.quorumBps}
                    onChange={(e) =>
                      setParams((p) => ({ ...p, quorumBps: e.target.value }))
                    }
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Proposal Threshold (tokens)</Label>
                  <Input
                    value={params.proposalThresholdTokens}
                    onChange={(e) =>
                      setParams((p) => ({
                        ...p,
                        proposalThresholdTokens: e.target.value,
                      }))
                    }
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Governance Token Supply</Label>
                  <Input
                    value={params.maxGovernanceSupplyTokens}
                    onChange={(e) =>
                      setParams((p) => ({
                        ...p,
                        maxGovernanceSupplyTokens: e.target.value,
                      }))
                    }
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                {!govMintAddress && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={createGovMint}
                    disabled={isSending || !signer || !isGenesis}
                    className="text-xs"
                  >
                    1. Create Governance Mint
                  </Button>
                )}
                {cluster === "localnet" && !mockUsdcAddress && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={createMockUsdc}
                    disabled={isSending || !signer || !isGenesis}
                    className="text-xs"
                  >
                    2. Create Mock USDC
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={createTreasury}
                  disabled={isSending || !signer || !stablecoinMint}
                  className="text-xs"
                >
                  3. Create Treasury ATA
                </Button>
                <Button
                  size="sm"
                  onClick={initDao}
                  disabled={
                    isSending ||
                    !signer ||
                    !isGenesis ||
                    !effectiveGovMint ||
                    !stablecoinMint
                  }
                  className="text-xs"
                >
                  4. Initialize DAO Program
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="border-border/60 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-600" /> Active
                    DAO Constitution
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Parameters stored on-chain in the canonical Governor PDA.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="bg-green-500/10 text-green-600 border-green-500/20 text-xs"
                >
                  Initialized ✓
                </Badge>
              </div>
              <Separator />

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-mono">
                <div className="rounded-xl bg-muted/20 border p-3">
                  <span className="text-muted-foreground font-sans text-[11px]">
                    Voting Period
                  </span>
                  <p className="font-bold text-foreground mt-0.5">
                    {formatDuration(daoConfig.votingPeriod)}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/20 border p-3">
                  <span className="text-muted-foreground font-sans text-[11px]">
                    Timelock Delay
                  </span>
                  <p className="font-bold text-foreground mt-0.5">
                    {formatDuration(daoConfig.timelockDelay)}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/20 border p-3">
                  <span className="text-muted-foreground font-sans text-[11px]">
                    Quorum
                  </span>
                  <p className="font-bold text-foreground mt-0.5">
                    {(daoConfig.quorumBps / 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-xl bg-muted/20 border p-3">
                  <span className="text-muted-foreground font-sans text-[11px]">
                    Proposal Threshold
                  </span>
                  <p className="font-bold text-foreground mt-0.5">
                    {rawToDecimal(daoConfig.proposalThreshold, 6)} Tokens
                  </p>
                </div>
                <div className="rounded-xl bg-muted/20 border p-3">
                  <span className="text-muted-foreground font-sans text-[11px]">
                    Max Supply Cap
                  </span>
                  <p className="font-bold text-foreground mt-0.5">
                    {rawToDecimal(daoConfig.maxGovernanceSupply, 6)} Tokens
                  </p>
                </div>
                <div className="rounded-xl bg-muted/20 border p-3">
                  <span className="text-muted-foreground font-sans text-[11px]">
                    Treasury Account
                  </span>
                  <p className="font-bold text-foreground truncate mt-0.5">
                    {truncate(daoConfig.treasury)}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Tab 2: Tokenomics & Metaplex */}
        <TabsContent value="tokens" className="space-y-6">
          <Card className="border-border/60 p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <Coins className="h-4 w-4 text-primary" /> Governance Token
                ($ARTHA) Management
              </h3>
              <p className="text-xs text-muted-foreground">
                Manage the SPL Governance Token and Metaplex Metadata CPI.
              </p>
            </div>
            <Separator />

            {govTokenState ? (
              <div className="space-y-4 text-xs">
                <div className="rounded-xl bg-muted/30 border p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Governance Mint:
                    </span>
                    <span className="font-mono font-bold">
                      {govTokenState.mint}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Minted:</span>
                    <span className="font-bold tabular-nums text-primary">
                      {rawToDecimal(govTokenState.totalMinted, 6)} Tokens
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Label>
                    Mint Additional Governance Tokens (Capped by Constitution)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={mintAmount}
                      onChange={(e) => setMintAmount(e.target.value)}
                      placeholder="10000"
                      className="max-w-xs text-xs"
                    />
                    <Button
                      size="sm"
                      onClick={mintGovTokens}
                      disabled={isSending || !signer || !effectiveGovMint}
                      className="text-xs"
                    >
                      Mint to Operator Wallet
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Token Name</Label>
                    <Input
                      value={govMeta.name}
                      onChange={(e) =>
                        setGovMeta((m) => ({ ...m, name: e.target.value }))
                      }
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Symbol</Label>
                    <Input
                      value={govMeta.symbol}
                      onChange={(e) =>
                        setGovMeta((m) => ({ ...m, symbol: e.target.value }))
                      }
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Metaplex Metadata URI</Label>
                    <Input
                      value={govMeta.uri}
                      onChange={(e) =>
                        setGovMeta((m) => ({ ...m, uri: e.target.value }))
                      }
                      className="text-xs"
                    />
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={initGovToken}
                  disabled={
                    isSending || !signer || !isGenesis || !effectiveGovMint
                  }
                  className="text-xs gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Initialize Metaplex Token
                  Metadata
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Tab 3: Test Faucet */}
        <TabsContent value="faucet" className="space-y-6">
          <Card className="border-border/60 p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Test Stablecoin Faucet
              </h3>
              <p className="text-xs text-muted-foreground">
                Mint test USDC stablecoins for localnet testing, campaign
                donations, and milestone simulation.
              </p>
            </div>
            <Separator />

            {cluster === "localnet" ? (
              <div className="space-y-4 text-xs">
                {!mockUsdcAddress ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={createMockUsdc}
                    disabled={isSending || !signer || !isGenesis}
                    className="text-xs"
                  >
                    Create Mock USDC SPL Mint
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-muted/20 border p-3 flex justify-between items-center">
                      <span className="text-muted-foreground">
                        Mock USDC Mint:
                      </span>
                      <span className="font-mono font-bold">
                        {mockUsdcAddress}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Recipient Solana Address</Label>
                      <Input
                        value={faucetRecipient}
                        onChange={(e) => setFaucetRecipient(e.target.value)}
                        placeholder="Recipient Base58 address"
                        className="font-mono text-xs"
                      />
                    </div>

                    <Button
                      size="sm"
                      onClick={airdropMockUsdc}
                      disabled={isSending || !signer}
                      className="text-xs gap-1.5"
                    >
                      <Zap className="h-3.5 w-3.5" /> Mint 100,000 Test USDC
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-muted/30 p-4 text-xs space-y-2">
                <p className="font-semibold text-foreground">
                  Devnet / Mainnet Stablecoin
                </p>
                <p className="text-muted-foreground">
                  On this cluster, Arthasetu binds directly to canonical USDC (
                  <span className="font-mono text-foreground">
                    {getClusterUsdcMint(cluster)}
                  </span>
                  ). Use the official Circle or Solana devnet faucet to receive
                  test tokens.
                </p>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Tab 4: Emergency & Handover */}
        <TabsContent value="emergency" className="space-y-6">
          <Card className="border-destructive/40 p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" /> Emergency Circuit Breaker
              </h3>
              <p className="text-xs text-muted-foreground">
                Pausing the protocol immediately halts all campaign donations,
                milestone releases, and non-governance fund movements.
              </p>
            </div>
            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <p className="font-semibold text-foreground">
                  Status:{" "}
                  {daoConfig?.paused
                    ? "PAUSED (Emergency Active)"
                    : "OPERATIONAL (Live)"}
                </p>
                <p className="text-muted-foreground">
                  Only the protocol authority (
                  <span className="font-mono">
                    {truncate(daoConfig?.authority || "")}
                  </span>
                  ) can toggle this state.
                </p>
              </div>

              {daoConfig && (
                <Button
                  size="sm"
                  variant={daoConfig.paused ? "secondary" : "destructive"}
                  onClick={togglePause}
                  disabled={isSending || !signer || !isGenesis}
                  className="text-xs"
                >
                  {daoConfig.paused
                    ? "Resume Protocol Operations"
                    : "Halt Protocol (Trip Circuit Breaker)"}
                </Button>
              )}
            </div>

            {pendingAuthority && (
              <div className="rounded-xl bg-muted/30 border p-4 space-y-2 text-xs pt-4">
                <p className="font-semibold text-foreground">
                  Pending Authority Handover
                </p>
                <p className="text-muted-foreground">
                  New authority nominated:{" "}
                  <span className="font-mono font-bold text-foreground">
                    {pendingAuthority}
                  </span>
                </p>
                {pendingAuthority === address && (
                  <Button
                    size="sm"
                    onClick={acceptAuthority}
                    disabled={isSending || !signer}
                    className="text-xs mt-2"
                  >
                    Claim &amp; Accept Authority
                  </Button>
                )}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
