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
  const [tenderMethod, setTenderMethod] = useState("CASH");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [command, setCommand] = useState<{
    key: string;
    orderId: string;
    body: any;
  } | null>(null);
  const [receiptOrderId, setReceiptOrderId] = useState("");
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
    const body =
      command?.orderId === orderId
        ? command.body
        : {
            registerId,
            payments: [{ method: tenderMethod, amountMinor: Number(amount) }],
          };
    const frozen =
      command?.orderId === orderId
        ? command
        : { key: crypto.randomUUID(), orderId, body };
    setCommand(frozen);
    setPending(true);
    setError("");
    try {
      const result = await api<any>(
        `/phase4/dine-in/orders/${orderId}/settle`,
        {
          method: "POST",
          headers: { "Idempotency-Key": frozen.key },
          body: JSON.stringify(frozen.body),
        },
      );
      setMessage(
        `Settled ${result.receipt?.receiptNumber ?? "order"}; receipt ready`,
      );
      setReceiptOrderId(orderId);
      setCommand(null);
    } catch (e: any) {
      setError(`Settlement was not confirmed. Retry safely: ${e.message}`);
    } finally {
      setPending(false);
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
                if (command) return;
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
              onChange={(e) => {
                if (!command) setRegisterId(e.target.value);
              }}
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
            onChange={(e) => {
              if (!command) setAmount(e.target.value);
            }}
          />
          <label>
            Tender method
            <select
              value={tenderMethod}
              onChange={(e) => {
                if (!command) setTenderMethod(e.target.value);
              }}
            >
              <option value="CASH">Cash</option>
              <option value="MANUAL_CARD">Manual card terminal</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="JAZZCASH">JazzCash</option>
              <option value="EASYPAISA">Easypaisa</option>
            </select>
          </label>
          <Button
            disabled={pending || !orderId || !registerId}
            onClick={settle}
          >
            {pending
              ? "Settling…"
              : command
                ? "Retry same settlement"
                : "Settle order"}
          </Button>
          {receiptOrderId && (
            <a
              className="button"
              href={`/api/v1/pos/orders/${receiptOrderId}/receipt?format=html`}
              target="_blank"
              rel="noreferrer"
            >
              Open receipt
            </a>
          )}
          {!orders.length && <p>Loading open orders…</p>}
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
        </div>
      </Card>
    </main>
  );
}
