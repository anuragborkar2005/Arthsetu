import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useCluster } from "@/app/components/cluster-context";
import { useSolanaClient } from "@/app/lib/solana-client-context";
import {
  useDaoConfig,
  useFydaoTx,
  useFydaoWallet,
  useGovernanceTokenState,
  useMintInfo,
  useTokenBalance,
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
import { formatCompact, truncate } from "@/app/lib/fydao/format";
import { parseTokenAmount } from "@/app/lib/fydao/amount";
import { GENESIS_AUTHORITY, USDC_MINT, getClusterUsdcMint } from "@/app/lib/fydao/constants";
import type { Address } from "@solana/kit";
import { ConnectGate } from "./shared";

function saveSecret(key: string, secret: Uint8Array) {
  try {
    localStorage.setItem(key, btoa(String.fromCharCode(...secret)));
  } catch {
    // ignore quota / private-mode errors
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

export function AdminView() {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const { address, signer } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();
  const { data: daoConfig, isLoading } = useDaoConfig();
  const { data: govTokenState } = useGovernanceTokenState();

  const [govMint, setGovMint] = useState<MintState | null>(() =>
    typeof window === "undefined" ? null : loadMint("fydao:govMint", cluster),
  );
  const [mockUsdc, setMockUsdc] = useState<MintState | null>(() =>
    typeof window === "undefined" ? null : loadMint("fydao:usdcMint", cluster),
  );
  const [params, setParams] = useState(DAO_PARAMS);
  const [govMeta, setGovMeta] = useState({
    name: "fydao governance",
    symbol: "FYDAO",
    uri: "",
  });
  const [mintAmount, setMintAmount] = useState("1000");

  const govMintAddress = govMint?.address;
  const mockUsdcAddress =
    cluster === "localnet" ? (mockUsdc?.address as Address | undefined) : undefined;

  const stablecoinMint: Address | undefined =
    daoConfig?.stablecoinMint ??
    (cluster === "localnet" ? mockUsdcAddress : getClusterUsdcMint(cluster));

  const { data: govMintInfo } = useMintInfo(govMintAddress);
  const { data: treasuryBalance } = useTokenBalance(
    daoConfig?.authority ?? null,
    daoConfig?.stablecoinMint ?? null,
  );

  const isGenesis = address === GENESIS_AUTHORITY;
  const effectiveGovMint: Address | undefined =
    daoConfig?.governanceMint ?? (govMintAddress as Address | undefined);

  const createGovMint = async () => {
    if (!signer) return;
    let result: CreatedMint | undefined;
    await run("Creating governance mint", async () => {
      result = await createMintWithAuthority(client, signer, GENESIS_AUTHORITY, 6);
      return result.instructions;
    });
    if (result) {
      setGovMint({ address: result.mintAddress, key: result.privateKey });
      saveMint("fydao:govMint", cluster, {
        address: result.mintAddress,
        key: result.privateKey,
      });
    }
  };

  const createMockUsdc = async () => {
    if (!signer || cluster !== "localnet") return;
    let result: CreatedMint | undefined;
    await run("Creating mock USDC mint", async () => {
      result = await createMintWithAuthority(client, signer, GENESIS_AUTHORITY, 6);
      return result.instructions;
    });
    if (result) {
      setMockUsdc({ address: result.mintAddress, key: result.privateKey });
      saveMint("fydao:usdcMint", cluster, {
        address: result.mintAddress,
        key: result.privateKey,
      });
    }
  };

  const createTreasury = async () => {
    if (!signer || !stablecoinMint) return;
    await run("Creating treasury account", async () => {
      const [treasury] = await findAta(GENESIS_AUTHORITY, stablecoinMint);
      const info = await client.rpc.getAccountInfo(treasury).send();
      if (info.value) return [];
      return [await createAtaInstruction(signer, GENESIS_AUTHORITY, stablecoinMint)];
    });
  };

  const initDao = async () => {
    if (!signer || !effectiveGovMint || !stablecoinMint) return;
    const [treasury] = await findAta(GENESIS_AUTHORITY, stablecoinMint);
    const votingDelay = BigInt(params.votingDelaySecs || "0");
    const votingPeriod = BigInt(params.votingPeriodSecs || "0");
    const timelockDelay = BigInt(params.timelockDelaySecs || "0");
    const proposalThreshold = parseTokenAmount(params.proposalThresholdTokens, 6) ?? 0n;
    const maxGovernanceSupply = parseTokenAmount(params.maxGovernanceSupplyTokens, 6) ?? 0n;
    await run("Initializing DAO", () =>
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
      }),
    );
  };

  const initGovToken = async () => {
    if (!signer || !effectiveGovMint) return;
    await run("Initializing governance token", () =>
      initializeGovernanceTokenActions({
        authority: signer,
        currentMintAuthority: signer,
        governanceMint: effectiveGovMint,
        name: govMeta.name.trim() || "fydao governance",
        symbol: govMeta.symbol.trim() || "FYDAO",
        uri: govMeta.uri.trim(),
      }),
    );
  };

  const mintGovTokens = async () => {
    if (!signer || !effectiveGovMint) return;
    const amount = parseTokenAmount(mintAmount, 6);
    if (!amount || amount <= 0n) return;
    const [ata] = await findAta(signer.address, effectiveGovMint);
    await run("Minting governance tokens", async () => {
      const info = await client.rpc.getAccountInfo(ata).send();
      const instructions = [];
      if (!info.value) {
        instructions.push(await createAtaInstruction(signer, signer.address, effectiveGovMint));
      }
      instructions.push(
        ...(await mintGovernanceTokensActions({
          authority: signer,
          governanceMint: effectiveGovMint,
          amount,
        })),
      );
      return instructions;
    });
  };

  const airdropMockUsdc = async () => {
    if (!signer || !mockUsdcAddress) return;
    const amount = parseTokenAmount("100000", 6);
    if (!amount) return;
    await run("Minting mock USDC", async () => {
      const [ata] = await findAta(signer.address, mockUsdcAddress);
      const info = await client.rpc.getAccountInfo(ata).send();
      const instructions = [];
      if (!info.value) {
        instructions.push(await createAtaInstruction(signer, signer.address, mockUsdcAddress));
      }
      instructions.push(await mintToInstruction(signer, signer.address, mockUsdcAddress, amount));
      return instructions;
    });
  };

  const togglePause = async () => {
    if (!signer || !daoConfig) return;
    await run(daoConfig.paused ? "Resuming DAO" : "Pausing DAO", () =>
      setPausedActions({
        authority: signer,
        paused: !daoConfig.paused,
      }),
    );
  };

  const acceptAuthority = async () => {
    if (!signer) return;
    await run("Accepting authority", () =>
      acceptAuthorityActions({ pendingAuthority: signer }),
    );
  };

  if (isLoading && daoConfig === undefined) {
    return <p className="text-sm text-muted">Loading DAO state...</p>;
  }

  const pendingAuthority =
    daoConfig && daoConfig.pendingAuthority !== "11111111111111111111111111111111"
      ? daoConfig.pendingAuthority
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Setup &amp; Admin</h2>
          <p className="text-sm text-muted">
            Deploy the DAO and manage protocol settings. Genesis-only actions are
            enforced by the program.
          </p>
        </div>
        {daoConfig && (
          <Badge variant={daoConfig.paused ? "destructive" : "secondary"}>
            {daoConfig.paused ? "Paused" : "Live"}
          </Badge>
        )}
      </div>

      {!isGenesis && !daoConfig && (
        <Card className="px-4">
          <CardContent className="px-0 py-4 text-sm text-muted">
            DAO setup requires the genesis authority{" "}
            <span className="font-mono">{truncate(GENESIS_AUTHORITY)}</span>. Your
            wallet <span className="font-mono">{truncate(address ?? "none")}</span>{" "}
            cannot initialize it.
          </CardContent>
        </Card>
      )}

      {/* Step 1: mints */}
      <Card className="px-4">
        <CardHeader className="px-0">
          <CardTitle className="text-base">1 · Token mints</CardTitle>
        </CardHeader>
        <CardContent className="px-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Governance mint</p>
              <p className="font-mono text-xs text-muted">
                {effectiveGovMint
                  ? truncate(effectiveGovMint)
                  : "not created yet"}
              </p>
              {govMintInfo && (
                <p className="text-xs text-muted">
                  decimals {govMintInfo.data.decimals} · supply{" "}
                  {formatCompact(govMintInfo.data.supply, govMintInfo.data.decimals)}
                </p>
              )}
            </div>
            {!daoConfig && !govMintAddress && (
              <Button
                size="sm"
                variant="secondary"
                onClick={createGovMint}
                disabled={isSending || !signer || !isGenesis}
              >
                Create governance mint
              </Button>
            )}
            {govMintAddress && !daoConfig && (
              <Badge variant="outline">mint ready</Badge>
            )}
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Stablecoin mint</p>
              <p className="font-mono text-xs text-muted">
                {cluster === "localnet"
                  ? (mockUsdcAddress ? truncate(mockUsdcAddress) : "not created yet")
                  : USDC_MINT}
              </p>
              <p className="text-xs text-muted">
                {cluster === "localnet"
                  ? "Create a mock USDC on localnet to test donations."
                  : "Real USDC (token-2022 compatible SPL) on this cluster."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {cluster === "localnet" && !mockUsdcAddress && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={createMockUsdc}
                  disabled={isSending || !signer || !isGenesis}
                >
                  Create mock USDC
                </Button>
              )}
              {cluster === "localnet" && mockUsdcAddress && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={airdropMockUsdc}
                  disabled={isSending || !signer}
                >
                  Mint 100k test USDC
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: initialize DAO */}
      {!daoConfig && (
        <Card className="px-4">
          <CardHeader className="px-0">
            <CardTitle className="text-base">2 · Initialize DAO</CardTitle>
          </CardHeader>
          <CardContent className="px-0 space-y-4">
            <p className="text-sm text-muted">
              Creates the DAO config and the treasury (genesis authority&apos;s
              stablecoin ATA). Voting/timelock defaults are pre-filled.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <LabelField label="Voting delay (s)" value={params.votingDelaySecs}
                onChange={(v) => setParams((p) => ({ ...p, votingDelaySecs: v }))} />
              <LabelField label="Voting period (s)" value={params.votingPeriodSecs}
                onChange={(v) => setParams((p) => ({ ...p, votingPeriodSecs: v }))} />
              <LabelField label="Timelock delay (s)" value={params.timelockDelaySecs}
                onChange={(v) => setParams((p) => ({ ...p, timelockDelaySecs: v }))} />
              <LabelField label="Quorum (bps)" value={params.quorumBps}
                onChange={(v) => setParams((p) => ({ ...p, quorumBps: v }))} />
              <LabelField label="Proposal threshold (tokens)" value={params.proposalThresholdTokens}
                onChange={(v) => setParams((p) => ({ ...p, proposalThresholdTokens: v }))} />
              <LabelField label="Max governance supply (tokens)" value={params.maxGovernanceSupplyTokens}
                onChange={(v) => setParams((p) => ({ ...p, maxGovernanceSupplyTokens: v }))} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={createTreasury}
                variant="secondary"
                disabled={isSending || !signer || !stablecoinMint}
              >
                Create treasury ATA
              </Button>
              <Button
                onClick={initDao}
                disabled={
                  isSending || !signer || !isGenesis || !effectiveGovMint || !stablecoinMint
                }
              >
                Initialize DAO
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: governance token metadata + minting */}
      {daoConfig && (
        <Card className="px-4">
          <CardHeader className="px-0">
            <CardTitle className="text-base">
              {govTokenState ? "3 · Governance token" : "3 · Initialize governance token"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 space-y-4">
            {govTokenState ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Governance token initialized</p>
                  <p className="font-mono text-xs text-muted">
                    {truncate(govTokenState.mint)}
                  </p>
                  <p className="text-xs text-muted">
                    Minted {formatCompact(govTokenState.totalMinted, 6)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={mintAmount}
                    onChange={(e) => setMintAmount(e.target.value)}
                    className="max-w-28"
                    inputMode="numeric"
                    placeholder="tokens"
                  />
                  <Button
                    size="sm"
                    onClick={mintGovTokens}
                    disabled={isSending || !signer || !effectiveGovMint}
                  >
                    Mint to self
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <LabelField label="Name" value={govMeta.name}
                    onChange={(v) => setGovMeta((m) => ({ ...m, name: v }))} />
                  <LabelField label="Symbol" value={govMeta.symbol}
                    onChange={(v) => setGovMeta((m) => ({ ...m, symbol: v }))} />
                  <LabelField label="Metadata URI" value={govMeta.uri}
                    onChange={(v) => setGovMeta((m) => ({ ...m, uri: v }))} />
                </div>
                <Button
                  onClick={initGovToken}
                  disabled={isSending || !signer || !isGenesis || !effectiveGovMint}
                >
                  Initialize governance token
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: admin controls */}
      {daoConfig && (
        <Card className="px-4">
          <CardHeader className="px-0">
            <CardTitle className="text-base">4 · Admin controls</CardTitle>
          </CardHeader>
          <CardContent className="px-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Protocol paused</p>
                <p className="text-xs text-muted">
                  Pausing halts donations, milestone releases, and emergency
                  withdrawals.
                </p>
              </div>
              <Button
                size="sm"
                variant={daoConfig.paused ? "secondary" : "destructive"}
                onClick={togglePause}
                disabled={isSending || !signer || !isGenesis}
              >
                {daoConfig.paused ? "Resume DAO" : "Pause DAO"}
              </Button>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Transfer authority</p>
                <p className="text-xs text-muted">
                  Authority changes are executed through a governance proposal
                  with the &ldquo;Transfer authority&rdquo; action.
                </p>
              </div>
              {pendingAuthority && (
                <Badge variant="outline">
                  pending: {truncate(pendingAuthority)}
                </Badge>
              )}
              {pendingAuthority === address && (
                <Button size="sm" onClick={acceptAuthority} disabled={isSending || !signer}>
                  Accept authority
                </Button>
              )}
            </div>

            {treasuryBalance && (
              <>
                <Separator />
                <p className="text-sm text-muted">
                  Treasury: {formatCompact(treasuryBalance.amount, treasuryBalance.decimals)}{" "}
                  USDC
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LabelField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" />
    </div>
  );
}

export function AdminGate() {
  return (
    <ConnectGate>
      <AdminView />
    </ConnectGate>
  );
}
