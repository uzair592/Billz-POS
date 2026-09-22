"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Input, Notice } from "../../components/ui";
import { api } from "../../lib/api";

type Organization = {
  name: string;
  businessType: string;
  phone: string | null;
  onboardingStep: number;
  onboardingCompletedAt: string | null;
};
type Branch = {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
};

const regionalSettings = {
  countryCode: "PK",
  currencyCode: "PKR",
  timezone: "Asia/Karachi",
  locale: "en",
  dateFormat: "DD-MM-YYYY",
  accentColor: "#0f766e",
  taxConfig: { enabled: false, rateBasisPoints: 0 },
  serviceConfig: { enabled: false, rateBasisPoints: 0 },
  orderTypes: ["DINE_IN", "TAKEAWAY", "DELIVERY", "QUICK_SALE"],
  receiptConfig: { paperWidth: "80mm" },
};

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const initialized = useRef(false);
  const organization = useQuery({
    queryKey: ["organization"],
    queryFn: () => api<Organization>("/organization"),
  });
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => api<Branch[]>("/branches"),
  });
  const [step, setStep] = useState(1);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [business, setBusiness] = useState({
    name: "",
    businessType: "CAFE",
    phone: "",
  });
  const [branch, setBranch] = useState({
    name: "Main Branch",
    code: "MAIN",
    address: "",
    phone: "",
    timezone: "Asia/Karachi",
    isPrimary: true,
  });

  useEffect(() => {
    if (!organization.data || !branches.data || initialized.current) return;
    initialized.current = true;
    if (organization.data.onboardingCompletedAt) {
      router.replace("/workspace");
      return;
    }
    setBusiness({
      name: organization.data.name,
      businessType: organization.data.businessType,
      phone: organization.data.phone ?? "",
    });
    setStep(
      branches.data.length
        ? 4
        : Math.min(Math.max(organization.data.onboardingStep + 1, 1), 3),
    );
  }, [branches.data, organization.data, router]);

  async function next() {
    setBusy(true);
    setMessage("");
    try {
      if (step === 1)
        await api("/onboarding/business", {
          method: "PUT",
          body: JSON.stringify(business),
        });
      if (step === 2)
        await api("/onboarding/settings", {
          method: "PUT",
          body: JSON.stringify(regionalSettings),
        });
      if (step === 3 && !branches.data?.length) {
        await api("/branches", {
          method: "POST",
          body: JSON.stringify({
            ...branch,
            address: branch.address || undefined,
            phone: branch.phone || undefined,
          }),
        });
        await queryClient.invalidateQueries({ queryKey: ["branches"] });
      }
      if (step === 4) {
        await api("/onboarding/complete", { method: "POST" });
        await queryClient.invalidateQueries({ queryKey: ["organization"] });
        router.replace("/workspace");
        return;
      }
      setStep((value) => value + 1);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save this step.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (organization.isLoading || branches.isLoading)
    return (
      <main className="setup">
        <p>Loading your business profile...</p>
      </main>
    );
  const loadError = organization.error ?? branches.error;
  if (loadError)
    return (
      <main className="setup">
        <Notice>{loadError.message}</Notice>
      </main>
    );

  return (
    <main className="setup">
      <div className="setup-head">
        <div className="brand">
          <span className="brand-mark">C</span> Countertop
        </div>
        <div className="steps" aria-label={`Step ${step} of 4`}>
          {[1, 2, 3, 4].map((value) => (
            <span key={value} className={value <= step ? "done" : ""} />
          ))}
        </div>
        <div className="page-title">
          <h1>
            {
              [
                "",
                "Tell us about the business",
                "Confirm regional defaults",
                "Create your first branch",
                "Review and finish",
              ][step]
            }
          </h1>
          <p>Step {step} of 4. Your progress is saved automatically.</p>
        </div>
      </div>
      <Card>
        {message && <Notice>{message}</Notice>}
        {step === 1 && (
          <div className="form-grid">
            <Input
              required
              label="Business name"
              value={business.name}
              onChange={(event) =>
                setBusiness({ ...business, name: event.target.value })
              }
            />
            <label className="field">
              <span>Business type</span>
              <select
                value={business.businessType}
                onChange={(event) =>
                  setBusiness({ ...business, businessType: event.target.value })
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
              value={business.phone}
              onChange={(event) =>
                setBusiness({ ...business, phone: event.target.value })
              }
            />
          </div>
        )}
        {step === 2 && (
          <div>
            <h2>Pakistan defaults</h2>
            <div className="grid">
              <Card>
                <div className="label">Currency</div>
                <strong>PKR</strong>
              </Card>
              <Card>
                <div className="label">Timezone</div>
                <strong>Asia/Karachi</strong>
              </Card>
              <Card>
                <div className="label">Date</div>
                <strong>DD-MM-YYYY</strong>
              </Card>
            </div>
            <p className="muted">
              Tax and service charges start disabled and can be changed later in
              Settings.
            </p>
          </div>
        )}
        {step === 3 && (
          <div className="form-grid">
            <Input
              required
              label="Branch name"
              value={branch.name}
              onChange={(event) =>
                setBranch({ ...branch, name: event.target.value })
              }
            />
            <Input
              required
              label="Branch code"
              value={branch.code}
              onChange={(event) =>
                setBranch({ ...branch, code: event.target.value.toUpperCase() })
              }
            />
            <Input
              label="Address"
              value={branch.address}
              onChange={(event) =>
                setBranch({ ...branch, address: event.target.value })
              }
            />
            <Input
              label="Phone"
              value={branch.phone}
              onChange={(event) =>
                setBranch({ ...branch, phone: event.target.value })
              }
            />
          </div>
        )}
        {step === 4 && (
          <div>
            <h2>Ready to open the workspace</h2>
            <p className="muted">
              Your business profile, regional settings, and primary branch are
              ready. You can edit them and add employees from any supported
              phone or computer.
            </p>
            {branches.data?.[0] && (
              <p>
                <strong>Primary branch:</strong> {branches.data[0].name}
              </p>
            )}
          </div>
        )}
        <div className="actions">
          {step > 1 && (
            <Button
              type="button"
              className="secondary-button"
              onClick={() => setStep(step - 1)}
            >
              Back
            </Button>
          )}
          <Button onClick={next} disabled={busy}>
            {busy
              ? "Saving..."
              : step === 4
                ? "Finish setup"
                : "Save and continue"}
          </Button>
        </div>
      </Card>
    </main>
  );
}
