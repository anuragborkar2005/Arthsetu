import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { useWallet } from "@/app/lib/wallet/context";

export function Stat({
  label,
  value,
  loading,
  sub,
}: {
  label: string;
  value?: ReactNode;
  loading?: boolean;
  sub?: ReactNode;
}) {
  return (
    <Card size="sm" className="px-4">
      <CardContent className="px-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          {loading ? <Skeleton className="h-5 w-16" /> : (value ?? "\u2014")}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function ConnectGate({ children }: { children: ReactNode }) {
  const { status, connect, connectors, isReady } = useWallet();
  if (status === "connected") return <>{children}</>;

  if (!isReady) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm font-medium">Connect your wallet to get started</p>
        <p className="mt-1 text-sm text-muted">Detecting Solana wallets...</p>
        <div className="mt-4 flex justify-center gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-10 text-center">
      <p className="text-sm font-medium">Connect your wallet to get started</p>
      <p className="mt-1 text-sm text-muted">
        {connectors.length === 0
          ? "No wallet extension detected."
          : "Choose a wallet to interact with the DAO."}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        {connectors.map((c) => (
          <Button key={c.id} onClick={() => connect(c.id)} disabled={status === "connecting"}>
            {c.name}
          </Button>
        ))}
      </div>
    </Card>
  );
}
