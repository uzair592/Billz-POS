"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, Notice } from "./ui";
import { money } from "./billing-view";
export function BillingMetrics() {
  const query = useQuery({
    queryKey: ["billing-metrics"],
    queryFn: () =>
      api<{
        currencies: Record<
          string,
          {
            collectionsMinor: number;
            creditsMinor: number;
            outstandingMinor: number;
            monthlyRecurringMinor: number;
          }
        >;
        overdueInvoices: number;
        definition: string;
      }>("/platform/billing/metrics", {}, true),
  });
  if (query.error) return <Notice>{query.error.message}</Notice>;
  return (
    <Card>
      <h2>Subscription billing</h2>
      {query.isPending ? (
        <p>Loading billing totals…</p>
      ) : (
        <>
          <p>
            {query.data!.overdueInvoices} invoices with an outstanding balance
            due
          </p>
          {Object.entries(query.data!.currencies).map(([currency, totals]) => (
            <p key={currency}>
              {currency}: manual collections{" "}
              {money(totals.collectionsMinor, currency)} · Credits{" "}
              {money(totals.creditsMinor, currency)} · Outstanding{" "}
              {money(totals.outstandingMinor, currency)} · Monthly recurring{" "}
              {money(totals.monthlyRecurringMinor, currency)}
            </p>
          ))}
          <p className="muted">{query.data!.definition}</p>
        </>
      )}
    </Card>
  );
}
