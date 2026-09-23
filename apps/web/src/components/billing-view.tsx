"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { Button, Card, Input, Notice } from "./ui";

export type PlanVersion = {
  id: string;
  planId: string;
  name: string;
  currency: string;
  monthlyMinor: number;
  maxBranches: number;
  maxUsers: number;
  maxDevices: number;
  graceDays: number;
};
export type Plans = {
  modules: { id: string; name: string }[];
  plans: { id: string; name: string; isActive: boolean }[];
  versions: PlanVersion[];
};
type Settlement = {
  id: string;
  kind: string;
  amountMinor: number;
  method: string;
  reference: string;
  createdAt: string;
};
type Invoice = {
  id: string;
  description: string;
  currency: string;
  totalMinor: number;
  outstandingMinor: number;
  periodStart: string;
  periodEnd: string;
  graceEndsAt: string;
  settlements: Settlement[];
  attachments: { id: string; name: string }[];
};
type Summary = {
  organization: {
    name: string;
    status: string;
    subscriptions: {
      endsAt: string | null;
      graceEndsAt: string | null;
      plan: { name: string; maxDevices: number };
    }[];
  };
  invoices: Invoice[];
};
export const money = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: string) => new Date(value).toLocaleDateString();

export function BillingView({ organizationId }: { organizationId?: string }) {
  const platform = Boolean(organizationId);
  const base = platform ? `/platform/billing/${organizationId}` : "/billing";
  const summary = useQuery({
    queryKey: ["billing", organizationId],
    queryFn: () => api<Summary>(base, {}, platform),
  });
  const plans = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () => api<Plans>("/platform/billing/plans", {}, true),
    enabled: platform,
  });
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [planVersionId, setVersion] = useState("");
  const [invoiceId, setInvoice] = useState("");
  const [kind, setKind] = useState("PAYMENT");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [commandId, setCommandId] = useState(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID() : "",
  );
  async function mutate(path: string, body: unknown, notice: string) {
    setMessage("");
    setSuccess("");
    setBusy(true);
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) }, true);
      setCommandId(crypto.randomUUID());
      setSuccess(notice);
      await summary.refetch();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(invoiceId: string, file: File) {
    if (file.size > 2097152) {
      setMessage("Attachment must be 2 MB or smaller.");
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]!);
      reader.onerror = () => reject(new Error("Unable to read file."));
      reader.readAsDataURL(file);
    });
    await mutate(
      `${base}/invoices/${invoiceId}/attachments`,
      { name: file.name, mimeType: file.type, base64 },
      "Private evidence attached.",
    );
  }
  if (summary.isPending) return <p>Loading billing…</p>;
  if (summary.error) return <Notice>{summary.error.message}</Notice>;
  const data = summary.data!;
  const current = data.organization.subscriptions[0];
  return (
    <div className="billing-stack">
      <Card>
        <h2>{data.organization.name}</h2>
        <p>
          Account: {data.organization.status} ·{" "}
          {current?.plan.name ?? "No subscription"} ·{" "}
          {current?.plan.maxDevices ?? 0} devices
        </p>
        <p>
          {current?.endsAt
            ? `Period ends ${date(current.endsAt)}`
            : "No period end recorded"}
          {current?.graceEndsAt
            ? ` · Grace ends ${date(current.graceEndsAt)}`
            : ""}
        </p>
        <p className="muted">
          Payments shown here are recorded manually by platform administration.
          Contact platform support to arrange renewal or resolve a restriction.
        </p>
      </Card>
      {message && <Notice>{message}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
      {platform && (
        <Card>
          <h2>Issue monthly invoice</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void mutate(
                `${base}/invoices`,
                { commandId, planVersionId },
                "Invoice issued.",
              );
            }}
          >
            <label className="field">
              <span>Plan and price version</span>
              <select
                required
                value={planVersionId}
                onChange={(e) => setVersion(e.target.value)}
              >
                <option value="">Choose a published price</option>
                {plans.data?.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {money(v.monthlyMinor, v.currency)} ·{" "}
                    {v.maxDevices} devices · {v.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            {plans.error && <Notice>{plans.error.message}</Notice>}
            <p className="muted">
              The next calendar month starts at the last invoice’s period end,
              or today for a first invoice. Existing invoices keep their
              original price.
            </p>
            <Button disabled={busy || !planVersionId}>Issue invoice</Button>
          </form>
        </Card>
      )}
      {platform && (
        <Card>
          <h2>Record manual payment or credit</h2>
          <form
            className="billing-form"
            onSubmit={(e) => {
              e.preventDefault();
              const minor = Math.round(Number(amount) * 100);
              if (!Number.isSafeInteger(minor) || minor <= 0) {
                setMessage(
                  "Enter a positive amount with no more than two decimal places.",
                );
                return;
              }
              void mutate(
                `${base}/invoices/${invoiceId}/settlements`,
                {
                  commandId,
                  kind,
                  amountMinor: minor,
                  method: kind === "CREDIT" ? "ADJUSTMENT" : method,
                  reference,
                  reason,
                },
                "Manual entry saved. Activate the paid period when ready.",
              );
            }}
          >
            <label className="field">
              <span>Invoice</span>
              <select
                required
                value={invoiceId}
                onChange={(e) => setInvoice(e.target.value)}
              >
                <option value="">Select unpaid invoice</option>
                {data.invoices
                  .filter((i) => i.outstandingMinor > 0)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.id.slice(0, 8)} ·{" "}
                      {money(i.outstandingMinor, i.currency)} due
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Entry type</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="PAYMENT">Manual payment</option>
                <option value="CREDIT">Credit adjustment</option>
              </select>
            </label>
            <Input
              label="Amount (invoice currency)"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {kind === "PAYMENT" && (
              <label className="field">
                <span>Manual method</span>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {["BANK_TRANSFER", "CASH", "JAZZCASH", "EASYPAISA"].map(
                    (m) => (
                      <option key={m}>{m}</option>
                    ),
                  )}
                </select>
              </label>
            )}
            <Input
              label="Payment / adjustment reference"
              required
              maxLength={200}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <Input
              label="Reason / evidence note"
              required
              minLength={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button disabled={busy || !invoiceId}>
              Record {kind === "CREDIT" ? "credit" : "manual payment"}
            </Button>
          </form>
        </Card>
      )}
      <h2>Invoices & receipts</h2>
      {!data.invoices.length && (
        <Card>
          <p>
            No subscription invoices have been issued. Historical payments have
            not been inferred.
          </p>
        </Card>
      )}
      {data.invoices.map((invoice) => (
        <Card key={invoice.id}>
          <div className="billing-invoice">
            <h3>{invoice.description}</h3>
            <span className="badge">
              {invoice.outstandingMinor === 0 ? "Settled" : "Balance due"}
            </span>
          </div>
          <p className="muted">Invoice {invoice.id}</p>
          <p>
            {date(invoice.periodStart)} – {date(invoice.periodEnd)}
          </p>
          <p>
            Total: {money(invoice.totalMinor, invoice.currency)} · Outstanding:{" "}
            <strong>{money(invoice.outstandingMinor, invoice.currency)}</strong>
          </p>
          {invoice.settlements.map((s) => (
            <div className="billing-receipt" key={s.id}>
              <strong>
                {s.kind === "CREDIT" ? "Credit" : "Manual payment receipt"} ·{" "}
                {money(s.amountMinor, invoice.currency)}
              </strong>
              <p>
                {s.method} · {s.reference} · {date(s.createdAt)}
              </p>
              <small>Receipt {s.id}</small>
            </div>
          ))}
          {invoice.attachments?.map((file) => (
            <p key={file.id}>
              <a href={`/api/v1${base}/attachments/${file.id}`}>
                Download evidence: {file.name}
              </a>
            </p>
          ))}
          {platform && (
            <Input
              label="Attach private payment evidence (PDF, PNG, JPEG; max 2 MB)"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void upload(invoice.id, file).catch(() =>
                    setMessage("Unable to read the file."),
                  );
                e.target.value = "";
              }}
            />
          )}
          {platform && invoice.outstandingMinor === 0 && (
            <Button
              disabled={busy}
              onClick={() =>
                void mutate(
                  `${base}/invoices/${invoice.id}/activate`,
                  {},
                  "Paid subscription period activated. Account suspension, if any, must be lifted separately with a reason.",
                )
              }
            >
              Activate paid period
            </Button>
          )}
        </Card>
      ))}
      <Button className="secondary" onClick={() => window.print()}>
        Print invoices & receipts
      </Button>
    </div>
  );
}
