import { BillingView } from "../../../components/billing-view";
export default function BillingPage() {
  return (
    <>
      <header className="page-title">
        <h1>Subscription & billing</h1>
        <p>Review your subscription, invoices and manual payment receipts.</p>
      </header>
      <BillingView />
    </>
  );
}
