"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, Smartphone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Input, Notice } from "../../../components/ui";
import { api } from "../../../lib/api";

type Settings = {
  countryCode: string;
  currencyCode: string;
  timezone: string;
  locale: string;
  dateFormat: string;
  accentColor: string;
  taxConfig: Record<string, unknown>;
  serviceConfig: Record<string, unknown>;
  orderTypes: string[];
  receiptConfig: Record<string, unknown>;
};
type Organization = {
  name: string;
  businessType: string;
  phone: string | null;
  businessSettings: Settings;
};
type Device = {
  id: string;
  displayName: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastIpAddress: string | null;
  current: boolean;
  lastUserName: string | null;
};
type Devices = { maxDevices: number; items: Device[] };

function readableDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const organization = useQuery({
    queryKey: ["organization"],
    queryFn: () => api<Organization>("/organization"),
  });
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => api<Devices>("/devices"),
  });
  const [form, setForm] = useState<Settings | null>(null);
  const [profile, setProfile] = useState({
    name: "",
    businessType: "CAFE",
    phone: "",
  });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">(
    "success",
  );
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState("");

  useEffect(() => {
    if (!organization.data) return;
    setForm(organization.data.businessSettings);
    setProfile({
      name: organization.data.name,
      businessType: organization.data.businessType,
      phone: organization.data.phone ?? "",
    });
  }, [organization.data]);

  async function saveProfile() {
    setSaving(true);
    setMessage("");
    try {
      await api("/onboarding/business", {
        method: "PUT",
        body: JSON.stringify(profile),
      });
      setMessageTone("success");
      setMessage("Business profile saved.");
      await queryClient.invalidateQueries({ queryKey: ["organization"] });
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the business profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setMessage("");
    try {
      await api("/onboarding/settings", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setMessageTone("success");
      setMessage("Business settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["organization"] });
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error ? error.message : "Unable to save settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeDevice(device: Device) {
    if (
      !window.confirm(
        `Remove ${device.displayName}? It will be signed out immediately.`,
      )
    )
      return;
    setRemoving(device.id);
    setMessage("");
    try {
      const result = await api<{ currentSessionRevoked: boolean }>(
        `/devices/${device.id}/revoke`,
        { method: "POST" },
      );
      if (result.currentSessionRevoked) {
        sessionStorage.removeItem("csrf");
        router.replace("/login");
        return;
      }
      setMessageTone("success");
      setMessage("Device removed. A new device can now use this place.");
      await queryClient.invalidateQueries({ queryKey: ["devices"] });
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error ? error.message : "Unable to remove device.",
      );
    } finally {
      setRemoving("");
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="page-title">
          <h1>Settings & devices</h1>
          <p>Regional defaults and devices allowed to access this business</p>
        </div>
      </header>
      {message && <Notice tone={messageTone}>{message}</Notice>}
      {organization.error && <Notice>{organization.error.message}</Notice>}
      {organization.data && (
        <Card>
          <h2>Business profile</h2>
          <p className="muted">
            These details are visible throughout your workspace and can be
            updated from a phone or computer.
          </p>
          <div className="form-grid">
            <Input
              required
              label="Business name"
              value={profile.name}
              onChange={(event) =>
                setProfile({ ...profile, name: event.target.value })
              }
            />
            <label className="field">
              <span>Business type</span>
              <select
                value={profile.businessType}
                onChange={(event) =>
                  setProfile({ ...profile, businessType: event.target.value })
                }
              >
                <option value="CAFE">Cafe</option>
                <option value="RESTAURANT">Restaurant</option>
                <option value="BAKERY">Bakery</option>
                <option value="FAST_FOOD">Fast-food outlet</option>
                <option value="CLOUD_KITCHEN">Cloud kitchen</option>
                <option value="JUICE_BAR">Juice bar</option>
                <option value="FOOD_TRUCK">Food truck</option>
              </select>
              <small />
            </label>
            <Input
              label="Phone"
              value={profile.phone}
              onChange={(event) =>
                setProfile({ ...profile, phone: event.target.value })
              }
            />
          </div>
          <Button onClick={saveProfile} disabled={saving}>
            {saving ? "Saving..." : "Save business profile"}
          </Button>
        </Card>
      )}
      {form && (
        <Card>
          <h2>Business settings</h2>
          <div className="form-grid">
            <Input
              label="Country"
              value={form.countryCode}
              onChange={(event) =>
                setForm({
                  ...form,
                  countryCode: event.target.value.toUpperCase(),
                })
              }
            />
            <Input
              label="Currency"
              value={form.currencyCode}
              onChange={(event) =>
                setForm({
                  ...form,
                  currencyCode: event.target.value.toUpperCase(),
                })
              }
            />
            <Input
              label="Timezone"
              value={form.timezone}
              onChange={(event) =>
                setForm({ ...form, timezone: event.target.value })
              }
            />
            <Input
              label="Date format"
              value={form.dateFormat}
              onChange={(event) =>
                setForm({ ...form, dateFormat: event.target.value })
              }
            />
            <Input
              label="Accent colour"
              type="color"
              value={form.accentColor}
              onChange={(event) =>
                setForm({ ...form, accentColor: event.target.value })
              }
            />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </Button>
        </Card>
      )}
      <Card className="section-card">
        <div className="section-heading">
          <div>
            <h2>Registered devices</h2>
            <p className="muted">
              A device uses one place only after a successful sign-in. Removing
              it signs out every user on that device.
            </p>
          </div>
          <span className="usage-badge">
            {devices.data?.items.length ?? 0} /{" "}
            {devices.data?.maxDevices ?? "-"} used
          </span>
        </div>
        {devices.error && <Notice>{devices.error.message}</Notice>}
        {devices.isLoading && <p>Loading devices...</p>}
        <div className="device-list">
          {devices.data?.items.map((device) => (
            <article className="device-item" key={device.id}>
              <div className="device-icon">
                {/Android|iPhone|iPad/i.test(device.displayName) ? (
                  <Smartphone />
                ) : (
                  <Laptop />
                )}
              </div>
              <div className="device-copy">
                <strong>
                  {device.displayName}{" "}
                  {device.current && (
                    <span className="current-badge">This device</span>
                  )}
                </strong>
                <span>
                  {device.lastUserName
                    ? `Last used by ${device.lastUserName}`
                    : "Registered device"}
                </span>
                <small>
                  Last active {readableDate(device.lastSeenAt)}
                  {device.lastIpAddress ? ` - ${device.lastIpAddress}` : ""}
                </small>
              </div>
              <Button
                className="danger-button"
                disabled={removing === device.id}
                onClick={() => removeDevice(device)}
              >
                <Trash2 size={16} />{" "}
                {removing === device.id ? "Removing..." : "Remove"}
              </Button>
            </article>
          ))}
        </div>
        {devices.data && !devices.data.items.length && (
          <p className="muted">No active devices are registered.</p>
        )}
      </Card>
    </>
  );
}
