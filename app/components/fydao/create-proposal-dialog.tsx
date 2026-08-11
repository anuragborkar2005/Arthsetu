import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDaoConfig, useFydaoTx, useFydaoWallet } from "@/app/lib/hooks/use-fydao";
import { useSolanaClient } from "@/app/lib/solana-client-context";
import { createProposalActions } from "@/app/lib/fydao/actions";
import { parseTokenAmount, rawToDecimal } from "@/app/lib/fydao/amount";
import { ACTION_LABELS } from "@/app/lib/fydao/constants";
import type { Address } from "@solana/kit";
import type { Campaign, Milestone } from "@/app/generated/fydao/accounts";
import type { ProposalActionArgs } from "@/app/generated/fydao/types";

type Kind = ProposalActionArgs["__kind"];
const KINDS: Kind[] = [
  "ApproveCampaign",
  "ReleaseMilestone",
  "EmergencyWithdraw",
  "TransferAuthority",
];

export function CreateProposalDialog({
  open,
  onOpenChange,
  campaigns,
  milestones = [],
  defaultKind = "ApproveCampaign",
  defaultCampaign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaigns: Array<{ address: string; account: Campaign }>;
  milestones?: Array<{ address: string; account: Milestone }>;
  defaultKind?: Kind;
  defaultCampaign?: string;
}) {
  const { signer } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();
  const client = useSolanaClient();
  const { data: daoConfig } = useDaoConfig();
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [campaign, setCampaign] = useState<string>(defaultCampaign ?? "");
  const [milestone, setMilestone] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [newAuthority, setNewAuthority] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setKind(defaultKind);
      setCampaign(defaultCampaign ?? "");
      setMilestone("");
      setAmount("");
      setNewAuthority("");
      setError(null);
    }
  }

  const submit = async () => {
    if (!signer || !daoConfig) return;
    setError(null);

    let action: ProposalActionArgs;
    switch (kind) {
      case "ApproveCampaign": {
        if (!campaign) {
          setError("Pick a campaign to approve.");
          return;
        }
        action = { __kind: "ApproveCampaign", campaign: campaign as Address };
        break;
      }
      case "ReleaseMilestone": {
        if (!campaign) {
          setError("Pick a campaign.");
          return;
        }
        if (!milestone) {
          setError("Pick a milestone.");
          return;
        }
        action = {
          __kind: "ReleaseMilestone",
          campaign: campaign as Address,
          milestoneId: BigInt(milestone),
        };
        break;
      }
      case "EmergencyWithdraw": {
        if (!campaign) {
          setError("Pick a campaign.");
          return;
        }
        const raw = parseTokenAmount(amount, 6);
        if (!raw || raw <= 0n) {
          setError("Enter a valid amount.");
          return;
        }
        action = {
          __kind: "EmergencyWithdraw",
          campaign: campaign as Address,
          amount: raw,
        };
        break;
      }
      case "TransferAuthority": {
        if (!newAuthority.trim()) {
          setError("Enter the new authority address.");
          return;
        }
        action = {
          __kind: "TransferAuthority",
          newAuthority: newAuthority.trim() as Address,
        };
        break;
      }
    }

    try {
      await run("Creating proposal", () =>
        createProposalActions({
          rpc: client.rpc,
          proposer: signer,
          governanceMint: daoConfig.governanceMint,
          proposalId: daoConfig.nextProposalId,
          description: description.trim(),
          action,
        }),
      );
      onOpenChange(false);
    } catch {
      // error surfaced via toast
    }
  };

  const selectedCampaign = campaigns.find((c) => c.address === campaign)?.account;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create proposal</DialogTitle>
          <DialogDescription>
            A governance proposal needs to pass and clear the timelock before it
            is executed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prop-desc">Description</Label>
            <Input
              id="prop-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What should the DAO do?"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Action</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {ACTION_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {kind !== "TransferAuthority" && (
            <div className="space-y-1.5">
              <Label>Campaign</Label>
              <Select value={campaign} onValueChange={(v) => setCampaign(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.address} value={c.address}>
                      Campaign #{c.account.campaignId.toString()} (
                      {c.account.creator.slice(0, 6)}...)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "ReleaseMilestone" && (
            <div className="space-y-1.5">
              <Label>Milestone</Label>
              <Select value={milestone} onValueChange={(v) => setMilestone(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select milestone" />
                </SelectTrigger>
                <SelectContent>
                  {milestones
                    .filter((m) => m.account.campaign === campaign)
                    .map((m) => (
                      <SelectItem key={m.address} value={m.account.milestoneId.toString()}>
                        #{m.account.milestoneId.toString()} ·{" "}
                        {rawToDecimal(m.account.amount, 6)} USDC
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "EmergencyWithdraw" && (
            <div className="space-y-1.5">
              <Label htmlFor="ew-amount">Amount (USDC)</Label>
              <Input
                id="ew-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                inputMode="decimal"
              />
            </div>
          )}

          {kind === "TransferAuthority" && (
            <div className="space-y-1.5">
              <Label htmlFor="new-auth">New authority address</Label>
              <Input
                id="new-auth"
                value={newAuthority}
                onChange={(e) => setNewAuthority(e.target.value)}
                placeholder="Base58 address"
              />
            </div>
          )}

          {selectedCampaign && (
            <p className="text-xs text-muted">
              Campaign #{selectedCampaign.campaignId.toString()} ·{" "}
              {rawToDecimal(selectedCampaign.totalDeposited, 6)} USDC raised.
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isSending || !signer || !daoConfig}>
            {isSending ? "Signing..." : "Create proposal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
