import { Badge } from "@/components/ui/badge";
import { PROPOSAL_STATE_LABELS } from "@/app/lib/fydao/constants";

const PROPOSAL_STYLES: Record<string, string> = {
  Pending: "bg-secondary text-secondary-foreground",
  Active: "bg-primary text-primary-foreground",
  Canceled: "bg-muted text-muted-foreground",
  Defeated: "bg-destructive/10 text-destructive",
  Succeeded: "bg-green-500/15 text-green-600 dark:text-green-400",
  Queued: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Expired: "bg-muted text-muted-foreground",
  Executed: "bg-primary/10 text-primary",
};

export function ProposalStateBadge({ state }: { state: number }) {
  const label = PROPOSAL_STATE_LABELS[state] ?? String(state);
  return (
    <Badge variant="outline" className={PROPOSAL_STYLES[label]}>
      {label}
    </Badge>
  );
}

export function CampaignStatusBadge({
  isLive,
  emergencyWithdrawn,
}: {
  isLive: boolean;
  emergencyWithdrawn: boolean;
}) {
  if (emergencyWithdrawn)
    return (
      <Badge variant="destructive" className="bg-destructive/15">
        Withdrawn
      </Badge>
    );
  if (isLive)
    return (
      <Badge variant="outline" className="bg-green-500/15 text-green-600 dark:text-green-400">
        Live
      </Badge>
    );
  return (
    <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
      Pending approval
    </Badge>
  );
}
