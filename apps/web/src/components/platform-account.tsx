"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { Button, Card, Input, Notice } from "./ui";
type Detail = {
  users: { name: string; email: string; phone: string }[];
  branches: { id: string; name: string; isActive: boolean }[];
  devices: { id: string; displayName: string }[];
  modules: { enabled: boolean; module: { name: string } }[];
  subscriptions: {
    id: string;
    status: string;
    startsAt: string;
    endsAt: string | null;
    plan: { name: string };
  }[];
};
export function PlatformAccount({ id }: { id: string }) {
  const detail = useQuery({
    queryKey: ["account-detail", id],
    queryFn: () => api<Detail>(`/platform/organizations/${id}`, {}, true),
  });
  const activity = useQuery({
    queryKey: ["account-activity", id],
    queryFn: () =>
      api<
        {
          id: string;
          action: string;
          reason: string | null;
          createdAt: string;
        }[]
      >(`/platform/organizations/${id}/activity`, {}, true),
  });
  const [reason, setReason] = useState("");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="billing-stack">
      {detail.error && <Notice>{detail.error.message}</Notice>}
      {detail.data && (
        <Card>
          <h2>Business details</h2>
          {detail.data.users.map((u) => (
            <p key={u.email}>
              {u.name} · {u.email} · {u.phone}
            </p>
          ))}
          <h3>Branches</h3>
          {detail.data.branches.map((b) => (
            <p key={b.id}>
              {b.name} · {b.isActive ? "Active" : "Inactive"}
            </p>
          ))}
          <h3>Registered devices</h3>
          {detail.data.devices.map((d) => (
            <p key={d.id}>{d.displayName}</p>
          ))}
          <p>
            Modules:{" "}
            {detail.data.modules
              .filter((m) => m.enabled)
              .map((m) => m.module.name)
              .join(", ") || "None enabled"}
          </p>
          <h3>Subscription history</h3>
          {detail.data.subscriptions.map((s) => (
            <p key={s.id}>
              {s.plan.name} · {s.status} ·{" "}
              {new Date(s.startsAt).toLocaleDateString()} –{" "}
              {s.endsAt
                ? new Date(s.endsAt).toLocaleDateString()
                : "No end recorded"}
            </p>
          ))}
        </Card>
      )}
      <Card>
        <h2>Owner activation / recovery</h2>
        <p>
          Create a single-use link valid for 30 minutes. Share it privately with
          the owner. Issuing another link invalidates the previous one.
        </p>
        <form
          className="billing-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            setUrl("");
            try {
              const result = await api<{ url: string }>(
                `/platform/organizations/${id}/recovery-link`,
                { method: "POST", body: JSON.stringify({ reason }) },
                true,
              );
              setUrl(result.url);
              await activity.refetch();
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Unable to issue link.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            label="Recovery reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
          />
          <Button disabled={busy}>Generate private recovery link</Button>
        </form>
        {url && (
          <Input
            label="Copy this private one-time link"
            value={url}
            readOnly
            onFocus={(e) => e.target.select()}
          />
        )}
        {message && <Notice>{message}</Notice>}
      </Card>
      <Card>
        <h2>Recent account activity</h2>
        {activity.error && <Notice>{activity.error.message}</Notice>}
        {activity.data?.slice(0, 20).map((a) => (
          <p key={a.id}>
            {new Date(a.createdAt).toLocaleString()} · {a.action}
            {a.reason ? ` · ${a.reason}` : ""}
          </p>
        ))}
      </Card>
    </div>
  );
}
