"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BillingView } from "../../../../components/billing-view";
import { PlatformAccount } from "../../../../components/platform-account";
import { Button, Card, Input, Notice } from "../../../../components/ui";
import { api } from "../../../../lib/api";
import { useQueryClient } from "@tanstack/react-query";
export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("SUSPENDED");
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="content platform-content">
      <Link href="/platform">← Platform administration</Link>
      <h1>Business account</h1>
      <p>
        <Link href="/platform/plans">Manage plans & prices</Link>
      </p>
      <BillingView organizationId={id} />
      <PlatformAccount id={id} />
      <Card>
        <h2>Account access</h2>
        <p>
          Suspension preserves business records and owner billing access.
          Reactivation still requires a valid subscription.
        </p>
        <form
          className="billing-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              await api(
                `/platform/organizations/${id}/status`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    status,
                    reason,
                    expiresAt:
                      status === "SUSPENDED" && expiresAt
                        ? new Date(expiresAt).toISOString()
                        : undefined,
                  }),
                },
                true,
              );
              await queryClient.invalidateQueries({
                queryKey: ["billing", id],
              });
              setMessage("Account status saved and audited.");
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Unable to update.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>New status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="SUSPENDED">Suspended</option>
              <option value="ACTIVE">Active</option>
            </select>
          </label>
          <Input
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
          />
          {status === "SUSPENDED" && (
            <Input
              label="Automatically lift suspension at (optional)"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          )}
          <Button disabled={busy}>Save access status</Button>
        </form>
        {message && <p role="status">{message}</p>}
      </Card>
    </main>
  );
}
