import { useState } from "react";
import { createKeyPairSignerFromBytes, getBase58Encoder } from "@solana/kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFydaoTx, useFydaoWallet } from "@/app/lib/hooks/use-fydao";
import { proposeMilestoneActions } from "@/app/lib/fydao/actions";
import { parseTokenAmount } from "@/app/lib/fydao/amount";
import type { Address } from "@solana/kit";
import type { Campaign } from "@/app/generated/fydao/accounts";

export function ProposeMilestoneDialog({
  campaign,
  campaignAddress,
  onClose,
}: {
  campaign: Campaign;
  campaignAddress: Address;
  onClose: () => void;
}) {
  const { signer, address } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();
  const [proofCid, setProofCid] = useState("");
  const [amount, setAmount] = useState("");
  const [verifierKey, setVerifierKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSelfVerifier = address === campaign.verifier;

  const submit = async () => {
    if (!signer) return;
    setError(null);
    const raw = parseTokenAmount(amount, 6);
    if (!raw || raw <= 0n) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    if (!proofCid.trim()) {
      setError("Proof CID is required.");
      return;
    }
    if (!isSelfVerifier && !verifierKey.trim()) {
      setError("The verifier is a different key — paste its secret key to co-sign.");
      return;
    }
    let verifier = signer;
    if (!isSelfVerifier) {
      try {
        verifier = await createKeyPairSignerFromBytes(
          getBase58Encoder().encode(verifierKey.trim()),
        );
      } catch {
        setError("Invalid verifier secret key.");
        return;
      }
    }
    try {
      await run("Proposing milestone", () =>
        proposeMilestoneActions({
          creator: signer,
          verifier,
          campaign: campaignAddress,
          milestoneId: campaign.milestoneCount,
          proofCid: proofCid.trim(),
          amount: raw,
        }),
      );
      onClose();
    } catch {
      // error surfaced via toast
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propose milestone #{campaign.milestoneCount.toString()}</DialogTitle>
          <DialogDescription>
            The campaign verifier must co-sign to attest the off-chain proof.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="proof-cid">Proof CID (IPFS)</Label>
            <Input
              id="proof-cid"
              value={proofCid}
              onChange={(e) => setProofCid(e.target.value)}
              placeholder="bafybeihdwdcefgh..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ms-amount">Amount (USDC)</Label>
            <Input
              id="ms-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
              inputMode="decimal"
            />
          </div>
          {isSelfVerifier ? (
            <p className="text-xs text-muted">
              Your wallet is the designated verifier, so it will co-sign.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="verifier-key">Verifier secret key (base58)</Label>
              <Input
                id="verifier-key"
                value={verifierKey}
                onChange={(e) => setVerifierKey(e.target.value)}
                placeholder="base58 secret key"
              />
              <p className="text-xs text-muted">
                The verifier for this campaign (
                {campaign.verifier.slice(0, 6)}...) is not your wallet, so its
                key is required to co-sign.
              </p>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isSending || !signer}>
            {isSending ? "Signing..." : "Propose milestone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
