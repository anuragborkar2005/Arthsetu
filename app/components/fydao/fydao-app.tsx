"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DaoOverview } from "./dao-overview";
import { CampaignsGate } from "./campaigns-view";
import { ProposalsView } from "./proposals-view";
import { AdminGate } from "./admin-view";
import { ConnectGate } from "./shared";

export function FydaoApp() {
  const [tab, setTab] = useState("overview");

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="w-full justify-start sm:w-auto">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        <TabsTrigger value="governance">Governance</TabsTrigger>
        <TabsTrigger value="admin">Admin</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        <DaoOverview />
      </TabsContent>

      <TabsContent value="campaigns" className="mt-6">
        <CampaignsGate />
      </TabsContent>

      <TabsContent value="governance" className="mt-6">
        <ConnectGate>
          <ProposalsView />
        </ConnectGate>
      </TabsContent>

      <TabsContent value="admin" className="mt-6">
        <AdminGate />
      </TabsContent>
    </Tabs>
  );
}
