import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Address } from "@solana/kit";
import {
  useCampaigns,
  useDaoConfig,
  useFydaoTx,
  useFydaoWallet,
} from "@/app/lib/hooks/use-fydao";
import { createCampaignActions } from "@/app/lib/fydao/actions";
import { CampaignCard } from "./campaign-card";
import { ConnectGate } from "./shared";

function CreateCampaignDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { signer } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();
  const { data: daoConfig } = useDaoConfig();
  const [metadataCid, setMetadataCid] = useState("");
  const [trustScore, setTrustScore] = useState("50");
  const [verifier, setVerifier] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!signer || !daoConfig) return;
    setError(null);
    if (!metadataCid.trim()) {
      setError("A metadata CID (IPFS) is required.");
      return;
    }
    const trust = BigInt(Math.max(0, Math.min(100, Number(trustScore) || 0)));
    if (!verifier.trim()) {
      setError("A verifier address is required.");
      return;
    }
    try {
      await run("Creating campaign", () =>
        createCampaignActions({
          creator: signer,
          stablecoinMint: daoConfig.stablecoinMint,
          campaignId: daoConfig.campaignCount,
          metadataCid: metadataCid.trim(),
          trustScore: trust,
          verifier: verifier.trim() as Address,
        }),
      );
      onOpenChange(false);
      setMetadataCid("");
      setVerifier("");
    } catch {
      // error surfaced via toast
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create campaign</DialogTitle>
          <DialogDescription>
            Anyone can create a campaign. It only becomes live after the DAO
            approves it via a governance proposal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="meta-cid">Metadata CID (IPFS)</Label>
            <Input
              id="meta-cid"
              value={metadataCid}
              onChange={(e) => setMetadataCid(e.target.value)}
              placeholder="bafybeihdwdcefgh..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trust-score">Trust score (0-100)</Label>
            <Input
              id="trust-score"
              value={trustScore}
              onChange={(e) => setTrustScore(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="verifier">Verifier address</Label>
            <Input
              id="verifier"
              value={verifier}
              onChange={(e) => setVerifier(e.target.value)}
              placeholder="Base58 address that attests milestone proofs"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isSending || !signer || !daoConfig}>
            {isSending ? "Signing..." : "Create campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CampaignsView() {
  const { data: campaigns, isLoading } = useCampaigns();
  const { data: daoConfig } = useDaoConfig();
  const [createOpen, setCreateOpen] = useState(false);

  const live = (campaigns ?? []).filter((c) => c.account.isLive);
  const pending = (campaigns ?? []).filter((c) => !c.account.isLive);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Campaigns</h2>
          <p className="text-sm text-muted">
            Fundraising campaigns backed by stablecoin donations. Milestones are
            released by DAO vote.
          </p>
        </div>
        {daoConfig && (
          <Button onClick={() => setCreateOpen(true)}>New campaign</Button>
        )}
      </div>

      {isLoading && campaigns === undefined && (
        <Card className="p-8 text-center text-sm text-muted">
          Loading campaigns...
        </Card>
      )}

      {campaigns !== undefined && campaigns.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium">No campaigns yet</p>
          <p className="mt-1 text-sm text-muted">
            Create the first fundraising campaign to get started.
          </p>
        </Card>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted">Awaiting DAO approval</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {pending.map((c) => (
              <CampaignCard key={c.address} campaign={c} />
            ))}
          </div>
        </div>
      )}

      {live.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted">Live campaigns</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {live.map((c) => (
              <CampaignCard key={c.address} campaign={c} />
            ))}
          </div>
        </div>
      )}

      {createOpen && (
        <CreateCampaignDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
    </div>
  );
}

export function CampaignsGate() {
  return (
    <ConnectGate>
      <CampaignsView />
    </ConnectGate>
  );
}
