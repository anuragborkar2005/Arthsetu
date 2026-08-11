import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useCampaigns,
  useDaoConfig,
  useMilestones,
  useProposals,
} from "@/app/lib/hooks/use-fydao";
import { ProposalCard } from "./proposal-card";
import { CreateProposalDialog } from "./create-proposal-dialog";

export function ProposalsView() {
  const { data: proposals } = useProposals();
  const { data: campaigns } = useCampaigns();
  const { data: milestones } = useMilestones();
  const { data: daoConfig } = useDaoConfig();
  const [createOpen, setCreateOpen] = useState(false);

  if (!daoConfig) {
    return (
      <Card className="px-4">
        <CardContent className="px-0 py-8 text-center text-sm text-muted">
          The DAO has not been initialized. Run the setup wizard in the Admin
          tab first.
        </CardContent>
      </Card>
    );
  }

  const sorted = (proposals ?? [])
    .slice()
    .sort((a, b) => Number(b.account.proposalId - a.account.proposalId));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Proposals</h2>
          <p className="text-sm text-muted">
            Vote on campaign approvals, milestone releases, and protocol
            changes.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New proposal</Button>
      </div>

      {sorted.length === 0 ? (
        <Card className="px-4">
          <CardContent className="px-0 py-10 text-center">
            <p className="text-sm text-muted">
              No proposals yet. Create the first one to get the DAO moving.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sorted.map((p) => (
            <ProposalCard key={p.address} proposal={p} />
          ))}
        </div>
      )}

      <CreateProposalDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        campaigns={campaigns ?? []}
        milestones={milestones ?? []}
      />
    </div>
  );
}
