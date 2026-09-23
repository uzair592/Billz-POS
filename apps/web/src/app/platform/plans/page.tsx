"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Input, Notice } from "../../../components/ui";
import { money, type Plans } from "../../../components/billing-view";
import { api } from "../../../lib/api";
export default function PlansPage() {
  const plans = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () => api<Plans>("/platform/billing/plans", {}, true),
  });
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setSuccess("");
    const input = {
      planId: form.get("planId") || undefined,
      name: form.get("name"),
      currency: form.get("currency"),
      monthlyMinor: Math.round(Number(form.get("price")) * 100),
      maxBranches: Number(form.get("maxBranches")),
      maxUsers: Number(form.get("maxUsers")),
      maxDevices: Number(form.get("maxDevices")),
      graceDays: Number(form.get("graceDays")),
      moduleIds: form.getAll("moduleIds").length
        ? form.getAll("moduleIds")
        : undefined,
    };
    try {
      await api(
        "/platform/billing/plans",
        { method: "POST", body: JSON.stringify(input) },
        true,
      );
      await plans.refetch();
      setSuccess(
        "Price version published. Existing invoices and subscriptions are unchanged.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="content platform-content">
      <Link href="/platform">← Platform administration</Link>
      <h1>Plans & prices</h1>
      <p>
        Publish a new version for future invoices. All prices are entered by the
        administrator.
      </p>
      {message && <Notice>{message}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
      {plans.error && <Notice>{plans.error.message}</Notice>}
      <Card>
        <h2>Publish price version</h2>
        <form className="billing-form" onSubmit={submit}>
          <label className="field">
            <span>Plan</span>
            <select name="planId">
              <option value="">Create a new plan</option>
              {plans.data?.plans
                .filter((p) => p.isActive)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <Input
            required
            label="Version name"
            name="name"
            minLength={2}
            maxLength={100}
          />
          <Input
            required
            label="Currency"
            name="currency"
            defaultValue="PKR"
            pattern="[A-Z]{3}"
            maxLength={3}
          />
          <Input
            required
            label="Monthly price"
            name="price"
            type="number"
            min="0"
            step="0.01"
          />
          {[
            ["maxBranches", "Branch limit", "1"],
            ["maxUsers", "User limit", "5"],
            ["maxDevices", "Device limit", "3"],
            ["graceDays", "Grace days", "0"],
          ].map(([name, label, value]) => (
            <Input
              key={name}
              label={label!}
              name={name}
              type="number"
              min={name === "graceDays" ? 0 : 1}
              max={name === "graceDays" ? 90 : 10000}
              step="1"
              defaultValue={value}
              required
            />
          ))}
          <Button disabled={busy}>Publish version</Button>
          <fieldset>
            <legend>Included modules</legend>
            {plans.data?.modules.map((module) => (
              <label key={module.id}>
                <input
                  type="checkbox"
                  name="moduleIds"
                  value={module.id}
                  defaultChecked
                />
                {module.name}
              </label>
            ))}
            <p className="muted">
              Only modules available in this phase can be included.
            </p>
          </fieldset>
        </form>
      </Card>
      <div className="billing-stack">
        <Card>
          <h2>Available plans</h2>
          {plans.data?.plans.map((p) => (
            <p key={p.id}>
              {p.name} · {p.isActive ? "Active" : "Inactive"}{" "}
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setMessage("");
                  try {
                    await api(
                      `/platform/billing/plans/${p.id}/status`,
                      {
                        method: "POST",
                        body: JSON.stringify({ isActive: !p.isActive }),
                      },
                      true,
                    );
                    await plans.refetch();
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Unable to update plan.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {p.isActive ? "Deactivate" : "Activate"}
              </Button>
            </p>
          ))}
        </Card>
        {plans.data?.versions.map((v) => (
          <Card key={v.id}>
            <h2>{v.name}</h2>
            <p>
              {money(v.monthlyMinor, v.currency)} / month · {v.maxDevices}{" "}
              devices · {v.maxBranches} branches · {v.maxUsers} users
            </p>
            <p>{v.graceDays} grace days</p>
            <small>{v.id}</small>
          </Card>
        ))}
      </div>
    </main>
  );
}
