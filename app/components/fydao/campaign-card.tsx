import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCluster } from "@/app/components/cluster-context";
import { useSolanaClient } from "@/app/lib/solana-client-context";
import {
  useDaoConfig,
  useFydaoTx,
  useFydaoWallet,
  useMilestones,
} from "@/app/lib/hooks/use-fydao";
import {
  claimRefundActions,
  donateActions,
} from "@/app/lib/fydao/actions";
import { parseTokenAmount, rawToDecimal } from "@/app/lib/fydao/amount";
import { truncate } from "@/app/lib/fydao/format";
import type { Address } from "@solana/kit";
import type { Campaign } from "@/app/generated/fydao/accounts";
import { CampaignStatusBadge } from "./status-badge";
import { ProposeMilestoneDialog } from "./milestone-dialog";
import { CreateProposalDialog } from "./create-proposal-dialog";

const DECIMALS = 6;

export function CampaignCard({
  campaign,
}: {
  campaign: { address: string; account: Campaign };
}) {
  const { getExplorerUrl } = useCluster();
  const client = useSolanaClient();
  const { address, signer } = useFydaoWallet();
  const { run, isSending } = useFydaoTx();
  const { data: daoConfig } = useDaoConfig();
  const { data: allMilestones } = useMilestones();
  const [donation, setDonation] = useState("");
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);

  const c = campaign.account;
  const stablecoinMint = daoConfig?.stablecoinMint;
  const milestones = (allMilestones ?? []).filter((m) => m.account.campaign === campaign.address);
  const isCreator = address === c.creator;
  const isLive = c.isLive && !c.emergencyWithdrawn;

  const donate = async () => {
    if (!signer || !stablecoinMint) return;
    const raw = parseTokenAmount(donation, DECIMALS);
    if (!raw || raw <= 0n) return;
    await run("Donating", () =>
      donateActions({
        rpc: client.rpc,
        donor: signer,
        campaign: campaign.address as Address,
        stablecoinMint,
        amount: raw,
      }),
    );
    setDonation("");
  };

  const claimRefund = async () => {
    if (!signer || !stablecoinMint) return;
    await run("Claiming refund", () =>
      claimRefundActions({
        donor: signer,
        campaign: campaign.address as Address,
        stablecoinMint,
      }),
    );
  };

  const releasedPct =
    c.totalDeposited > 0n
      ? Number((c.totalReleased * 10000n) / c.totalDeposited) / 100
      : 0;

  return (
    <Card className="px-4">
      <CardHeader className="px-0">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">
              Campaign #{c.campaignId.toString()}
            </CardTitle>
            <p className="text-xs text-muted">
              Created by{" "}
              <a
                className="font-mono underline-offset-2 hover:underline"
                href={getExplorerUrl(`/address/${c.creator}`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {truncate(c.creator)}
              </a>
            </p>
          </div>
          <CampaignStatusBadge
            isLive={c.isLive}
            emergencyWithdrawn={c.emergencyWithdrawn}
          />
        </div>
      </CardHeader>

      <CardContent className="px-0 space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <p className="text-xs text-muted">Trust score</p>
            <p className="font-medium tabular-nums">{c.trustScore.toString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Verifier</p>
            <p className="font-mono text-xs">
              {truncate(c.verifier)}
              {c.verifier === address && (
                <span className="ml-1 text-green-600 dark:text-green-400">you</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Milestones</p>
            <p className="font-medium tabular-nums">
              {milestones.filter((m) => m.account.released).length}/
              {c.milestoneCount.toString()} released
            </p>
          </div>
        </div>

        {c.metadataCid && (
          <p className="break-all rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs text-muted">
            metadata: {c.metadataCid}
          </p>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Raised</span>
            <span className="tabular-nums">
              {rawToDecimal(c.totalDeposited, DECIMALS)} USDC
            </span>
          </div>
          <Progress value={releasedPct} />
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{releasedPct.toFixed(1)}% released</span>
            <span className="tabular-nums">
              {rawToDecimal(c.totalReleased, DECIMALS)} USDC paid out
            </span>
          </div>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted">Milestones</p>
          {milestones.length === 0 && (
            <p className="text-sm text-muted">
              No milestones proposed yet
              {isCreator && c.isLive && " — propose the first one below."}
            </p>
          )}
          <ul className="space-y-1">
            {milestones.map((m) => (
              <li
                key={m.address}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    #{m.account.milestoneId.toString()} ·{" "}
                    {rawToDecimal(m.account.amount, DECIMALS)} USDC
                  </p>
                  <p className="truncate font-mono text-xs text-muted">
                    {m.account.proofCid}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    m.account.released
                      ? "bg-green-500/15 text-green-600 dark:text-green-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  }
                >
                  {m.account.released ? "Released" : "Pending"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        {isLive && signer && (
          <div className="flex gap-2">
            <Input
              value={donation}
              onChange={(e) => setDonation(e.target.value)}
              placeholder="Donate (USDC)"
              inputMode="decimal"
              className="max-w-40"
            />
            <Button onClick={donate} disabled={isSending}>
              Donate
            </Button>
          </div>
        )}

        {c.emergencyWithdrawn && (
          <p className="text-sm text-muted">
            This campaign was emergency-withdrawn. Donors can claw back their
            share of the remaining escrow.
          </p>
        )}
      </CardContent>

      <CardFooter className="px-0 flex-wrap gap-2">
        {isCreator && c.isLive && (
          <Button size="sm" variant="secondary" onClick={() => setMilestoneOpen(true)}>
            Propose milestone
          </Button>
        )}
        {!c.isLive && (
          <Button size="sm" variant="secondary" onClick={() => setApprovalOpen(true)}>
            Propose approval
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setReleaseOpen(true)}>
          Propose release
        </Button>
        {c.emergencyWithdrawn && (
          <Button size="sm" variant="destructive" onClick={claimRefund} disabled={!signer}>
            Claim refund
          </Button>
        )}
      </CardFooter>

      {milestoneOpen && (
        <ProposeMilestoneDialog
          campaign={c}
          campaignAddress={campaign.address as Address}
          onClose={() => setMilestoneOpen(false)}
        />
      )}
      {approvalOpen && (
        <CreateProposalDialog
          open={approvalOpen}
          onOpenChange={setApprovalOpen}
          campaigns={[{ address: campaign.address, account: c }]}
          defaultKind="ApproveCampaign"
          defaultCampaign={campaign.address}
        />
      )}
      {releaseOpen && (
        <CreateProposalDialog
          open={releaseOpen}
          onOpenChange={setReleaseOpen}
          campaigns={[{ address: campaign.address, account: c }]}
          milestones={milestones}
          defaultKind="ReleaseMilestone"
          defaultCampaign={campaign.address}
        />
      )}
    </Card>
  );
}
