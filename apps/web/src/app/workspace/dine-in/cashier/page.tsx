"use client";
import { useEffect, useState } from "react";
import { Button, Card, Input } from "../../../../components/ui";
import { api } from "../../../../lib/api";

export default function CashierDineInPage() {
  const [branchId, setBranchId] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [registers, setRegisters] = useState<any[]>([]);
  const [orderId, setOrderId] = useState("");
  const [registerId, setRegisterId] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api<any[]>("/branches")
      .then((x) => setBranchId(x[0]?.id ?? ""))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!branchId) return;
    Promise.all([
      api<any[]>(`/phase4/dine-in/orders?branchId=${branchId}`),
      api<any[]>(`/pos/registers?branchId=${branchId}`),
    ])
      .then(([o, r]) => {
        setOrders(o);
        setRegisters(r.filter((x) => !x.closedAt));
        setOrderId(o[0]?.id ?? "");
        setRegisterId(r.find((x) => !x.closedAt)?.id ?? "");
        setAmount(String(o[0]?.totalMinor ?? 0));
      })
      .catch((e) => setError(e.message));
  }, [branchId]);
  async function settle() {
    try {
      const result = await api<any>(
        `/phase4/dine-in/orders/${orderId}/settle`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            registerId,
            payments: [{ method: "CASH", amountMinor: Number(amount) }],
          }),
        },
      );
      setMessage(
        `Settled ${result.receipt?.receiptNumber ?? "order"}; receipt ready`,
      );
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Dine-in cashier</h1>
      <Card>
        <div className="grid gap-3">
          <label>
            Open order
            <select
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setAmount(
                  String(
                    orders.find((o) => o.id === e.target.value)?.totalMinor ??
                      0,
                  ),
                );
              }}
            >
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.table?.name} · PKR {(o.totalMinor / 100).toFixed(2)} ·{" "}
                  {o.tickets?.some((t: any) => t.status !== "READY")
                    ? "Preparing"
                    : "Ready"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Register
            <select
              value={registerId}
              onChange={(e) => setRegisterId(e.target.value)}
            >
              {registers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Tender amount"
            aria-label="Tender amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button disabled={!orderId || !registerId} onClick={settle}>
            Settle order
          </Button>
          {!orders.length && <p>Loading open orders…</p>}
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
        </div>
      </Card>
    </main>
  );
}
