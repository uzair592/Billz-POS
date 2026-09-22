"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, Notice } from "../../components/ui";
import { api } from "../../lib/api";

type Organization = {
  name: string;
  onboardingCompletedAt: string | null;
  businessSettings: { currencyCode: string; timezone: string } | null;
  subscriptions: Array<{
    plan: {
      name: string;
      maxBranches: number;
      maxUsers: number;
      maxDevices: number;
    };
  }>;
  modules: Array<{ module: { name: string } }>;
  _count: { branches: number; users: number; devices: number };
};

export default function WorkspacePage() {
  const query = useQuery({
    queryKey: ["organization"],
    queryFn: () => api<Organization>("/organization"),
  });
  if (query.isLoading) return <p>Loading workspace...</p>;
  if (query.error) return <Notice>{query.error.message}</Notice>;
  const organization = query.data!;
  if (!organization.onboardingCompletedAt)
    return (
      <div className="page-title">
        <h1>Finish setting up {organization.name}</h1>
        <p>
          Your secure workspace is ready. Complete the operating defaults before
          inviting the team.
        </p>
        <Link className="button link-button" href="/onboarding">
          Continue setup
        </Link>
      </div>
    );
  const plan = organization.subscriptions[0]?.plan;
  return (
    <>
      <header className="topbar">
        <div className="page-title">
          <h1>{organization.name}</h1>
          <p>Your live business workspace</p>
        </div>
      </header>
      <div className="grid">
        <Card>
          <div className="label">Subscription</div>
          <div className="metric">{plan?.name ?? "-"}</div>
        </Card>
        <Card>
          <div className="label">Currency</div>
          <div className="metric">
            {organization.businessSettings?.currencyCode ?? "PKR"}
          </div>
        </Card>
        <Card>
          <div className="label">Devices</div>
          <div className="metric">
            {organization._count.devices} / {plan?.maxDevices ?? "-"}
          </div>
          <Link className="text-link" href="/workspace/settings">
            Manage devices
          </Link>
        </Card>
      </div>
      <Card>
        <h2>Business at a glance</h2>
        <p className="muted">
          {organization._count.branches} of {plan?.maxBranches ?? "-"} branches,{" "}
          {organization._count.users} of {plan?.maxUsers ?? "-"} users, and{" "}
          {organization.modules.length} enabled modules.
        </p>
      </Card>
    </>
  );
}
