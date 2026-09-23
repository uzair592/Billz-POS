"use client";

import { createOrganizationSchema } from "@cafe-pos/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CircleDollarSign, LogOut, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BillingMetrics } from "../../components/billing-metrics";
import { useEffect, useState } from "react";
import { Button, Card, Input, Notice } from "../../components/ui";
import { ApiError, api } from "../../lib/api";

type Dashboard = {
  totalBusinesses: number;
  activeBusinesses: number;
  suspendedBusinesses: number;
  totalBranches: number;
  totalUsers: number;
  expiringSubscriptions: number;
};
type Plan = {
  id: string;
  name: string;
  maxBranches: number;
  maxUsers: number;
  maxDevices: number;
};
type Catalog = { plans: Plan[]; modules: Array<{ id: string; name: string }> };
type Organization = {
  id: string;
  name: string;
  status: string;
  _count: { branches: number; users: number };
  subscriptions: Array<{ plan: Plan }>;
};
type CreatedOrganization = { id: string; ownerId: string };

const emptyForm = {
  name: "",
  businessType: "CAFE",
  email: "",
  phone: "",
  ownerName: "",
  ownerUsername: "",
  temporaryPassword: "",
  planId: "",
  initialBranchName: "Main Branch",
  timezone: "Asia/Karachi",
  currencyCode: "PKR",
  graceDays: 0,
  moduleIds: [] as string[],
};
type FormField = keyof typeof emptyForm;
type FieldErrors = Partial<Record<FormField, string>>;

export default function PlatformPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [renewalBefore, setRenewalBefore] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const stats = useQuery({
    queryKey: ["platform-stats"],
    queryFn: () => api<Dashboard>("/platform/dashboard", {}, true),
  });
  const organizations = useQuery({
    queryKey: [
      "platform-organizations",
      search,
      statusFilter,
      planFilter,
      renewalBefore,
      dueOnly,
      cursor,
    ],
    queryFn: () =>
      api<{ items: Organization[]; nextCursor: string | null }>(
        `/platform/organizations?search=${encodeURIComponent(search)}&status=${statusFilter}&planName=${encodeURIComponent(planFilter)}&renewalBefore=${renewalBefore}&dueOnly=${dueOnly}${cursor ? "&cursor=" + cursor : ""}`,
        {},
        true,
      ),
  });
  const catalog = useQuery({
    queryKey: ["platform-catalog"],
    queryFn: () => api<Catalog>("/platform/catalog", {}, true),
  });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (catalog.data && !form.planId) {
      setForm((current) => ({
        ...current,
        planId: catalog.data!.plans[0]?.id ?? "",
        moduleIds: catalog.data!.modules.map((module) => module.id),
      }));
    }
  }, [catalog.data, form.planId]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setSuccess("");
    setFieldErrors({});
    const validation = createOrganizationSchema.safeParse(form);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      setFieldErrors(
        Object.fromEntries(
          Object.entries(errors).map(([field, messages]) => [
            field,
            messages?.[0] ?? "Check this value",
          ]),
        ) as FieldErrors,
      );
      setMessage("Please review the fields marked in red below.");
      return;
    }
    setBusy(true);
    try {
      await api<CreatedOrganization>(
        "/platform/organizations",
        { method: "POST", body: JSON.stringify(validation.data) },
        true,
      );
      setSuccess(
        `${validation.data.name} was created. The owner can sign in with “${validation.data.ownerUsername}” or “${validation.data.email}” and the temporary password you entered.`,
      );
      setForm({
        ...emptyForm,
        planId: catalog.data?.plans[0]?.id ?? "",
        moduleIds: catalog.data?.modules.map((module) => module.id) ?? [],
      });
      setShowForm(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["platform-organizations"] }),
      ]);
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(error.fields).map(([field, messages]) => [
              field,
              messages[0] ?? "Check this value",
            ]),
          ) as FieldErrors,
        );
      }
      setMessage(
        error instanceof Error ? error.message : "Unable to create business.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/platform/auth/logout", { method: "POST" }, true);
    sessionStorage.removeItem("platform_csrf");
    router.push("/platform/login");
  }

  return (
    <main className="content platform-content">
      <header className="topbar">
        <div className="page-title">
          <h1>Platform overview</h1>
          <Link href="/platform/plans">Plans & prices</Link>
          <p>Business accounts, plans, users, and device allowances</p>
        </div>
        <div className="topbar-actions">
          <Button onClick={() => setShowForm((value) => !value)}>
            <Plus size={17} /> Create business
          </Button>
          <button
            className="icon-button"
            onClick={logout}
            aria-label="Sign out"
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>
      {success && <Notice tone="success">{success}</Notice>}
      {stats.isLoading ? (
        <p>Loading…</p>
      ) : stats.error ? (
        <Notice>{stats.error.message}</Notice>
      ) : (
        <div className="grid">
          <Card>
            <Building2 />
            <div className="label">Businesses</div>
            <div className="metric">{stats.data?.totalBusinesses}</div>
          </Card>
          <Card>
            <Users />
            <div className="label">Users</div>
            <div className="metric">{stats.data?.totalUsers}</div>
          </Card>
          <Card>
            <CircleDollarSign />
            <div className="label">Expiring soon</div>
            <div className="metric">{stats.data?.expiringSubscriptions}</div>
          </Card>
        </div>
      )}
      {showForm && (
        <Card>
          <h2>Create a café or restaurant</h2>
          <p className="muted">
            The owner will sign in with their username or email. No organization
            URL is required.
          </p>
          {message && <Notice>{message}</Notice>}
          <form onSubmit={create}>
            <div className="form-grid">
              <Input
                required
                label="Business name"
                error={fieldErrors.name}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
              <label className="field">
                <span>Business type</span>
                <select
                  aria-invalid={Boolean(fieldErrors.businessType)}
                  value={form.businessType}
                  onChange={(event) =>
                    setForm({ ...form, businessType: event.target.value })
                  }
                >
                  <option value="CAFE">Café</option>
                  <option value="RESTAURANT">Restaurant</option>
                  <option value="BAKERY">Bakery</option>
                  <option value="FAST_FOOD">Fast-food outlet</option>
                  <option value="CLOUD_KITCHEN">Cloud kitchen</option>
                  <option value="JUICE_BAR">Juice bar</option>
                  <option value="FOOD_TRUCK">Food truck</option>
                </select>
                <small>{fieldErrors.businessType}</small>
              </label>
              <Input
                required
                label="Owner name"
                error={fieldErrors.ownerName}
                value={form.ownerName}
                onChange={(event) =>
                  setForm({ ...form, ownerName: event.target.value })
                }
              />
              <Input
                required
                label="Owner username"
                error={fieldErrors.ownerUsername}
                value={form.ownerUsername}
                onChange={(event) =>
                  setForm({
                    ...form,
                    ownerUsername: event.target.value.toLowerCase(),
                  })
                }
              />
              <Input
                required
                label="Owner email"
                error={fieldErrors.email}
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value.toLowerCase() })
                }
              />
              <Input
                required
                label="Phone"
                error={fieldErrors.phone}
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
              />
              <Input
                required
                label="Temporary password"
                error={fieldErrors.temporaryPassword}
                type="password"
                minLength={12}
                title="At least 12 characters with uppercase, lowercase, and a number"
                value={form.temporaryPassword}
                onChange={(event) =>
                  setForm({ ...form, temporaryPassword: event.target.value })
                }
              />
              <label className="field">
                <span>Subscription plan</span>
                <select
                  required
                  aria-invalid={Boolean(fieldErrors.planId)}
                  value={form.planId}
                  onChange={(event) =>
                    setForm({ ...form, planId: event.target.value })
                  }
                >
                  {catalog.data?.plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · {plan.maxDevices} devices · {plan.maxUsers}{" "}
                      users
                    </option>
                  ))}
                </select>
                <small>{fieldErrors.planId}</small>
              </label>
            </div>
            <fieldset>
              <legend>Available modules</legend>
              {catalog.data?.modules.map((module) => (
                <label key={module.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={form.moduleIds.includes(module.id)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        moduleIds: event.target.checked
                          ? [...form.moduleIds, module.id]
                          : form.moduleIds.filter((id) => id !== module.id),
                      })
                    }
                  />{" "}
                  {module.name}
                </label>
              ))}
            </fieldset>
            <div className="form-grid">
              <Input
                label="Initial branch name"
                value={form.initialBranchName}
                onChange={(e) =>
                  setForm({ ...form, initialBranchName: e.target.value })
                }
                error={fieldErrors.initialBranchName}
              />
              <Input
                label="Timezone"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                error={fieldErrors.timezone}
              />
              <Input
                label="Currency"
                value={form.currencyCode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    currencyCode: e.target.value.toUpperCase(),
                  })
                }
                error={fieldErrors.currencyCode}
              />
              <Input
                label="Grace days"
                type="number"
                min={0}
                max={90}
                value={form.graceDays}
                onChange={(e) =>
                  setForm({ ...form, graceDays: Number(e.target.value) })
                }
                error={fieldErrors.graceDays}
              />
            </div>
            <div className="actions">
              <Button
                type="button"
                className="secondary-button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
              <Button disabled={busy}>
                {busy ? "Creating account…" : "Create account"}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Card>
        <BillingMetrics />
        <h2>Businesses</h2>
        <div className="billing-form">
          <Input
            label="Plan name"
            value={planFilter}
            onChange={(e) => {
              setPlanFilter(e.target.value);
              setCursor(undefined);
            }}
          />
          <Input
            label="Renewal on or before"
            type="date"
            value={renewalBefore}
            onChange={(e) => {
              setRenewalBefore(e.target.value);
              setCursor(undefined);
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={dueOnly}
              onChange={(e) => {
                setDueOnly(e.target.checked);
                setCursor(undefined);
              }}
            />{" "}
            Outstanding invoices only
          </label>
          <Input
            label="Search businesses"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="field">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option>ACTIVE</option>
              <option>SUSPENDED</option>
              <option>DEACTIVATED</option>
            </select>
          </label>
        </div>
        {organizations.error && <Notice>{organizations.error.message}</Notice>}
        <div className="actions">
          {cursor && (
            <Button onClick={() => setCursor(undefined)}>First page</Button>
          )}
          {organizations.data?.nextCursor && (
            <Button onClick={() => setCursor(organizations.data!.nextCursor!)}>
              Next page
            </Button>
          )}
        </div>
        <div className="table-wrap desktop-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Devices</th>
                <th>Branches</th>
                <th>Users</th>
              </tr>
            </thead>
            <tbody>
              {organizations.data?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/platform/organizations/${item.id}`}>
                      <strong>{item.name}</strong>
                    </Link>
                  </td>
                  <td>{item.status}</td>
                  <td>{item.subscriptions[0]?.plan.name ?? "—"}</td>
                  <td>{item.subscriptions[0]?.plan.maxDevices ?? "—"}</td>
                  <td>{item._count.branches}</td>
                  <td>{item._count.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-list">
          {organizations.data?.items.map((item) => (
            <article className="mobile-list-item" key={item.id}>
              <div>
                <Link href={`/platform/organizations/${item.id}`}>
                  <strong>{item.name}</strong>
                </Link>
                <span>
                  {item.status} ·{" "}
                  {item.subscriptions[0]?.plan.name ?? "No plan"}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Devices</dt>
                  <dd>{item.subscriptions[0]?.plan.maxDevices ?? "—"}</dd>
                </div>
                <div>
                  <dt>Branches</dt>
                  <dd>{item._count.branches}</dd>
                </div>
                <div>
                  <dt>Users</dt>
                  <dd>{item._count.users}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </Card>
    </main>
  );
}
