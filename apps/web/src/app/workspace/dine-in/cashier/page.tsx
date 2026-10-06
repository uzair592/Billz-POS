"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input } from "../../../../components/ui";
import { api } from "../../../../lib/api";

const paid = (order: any) =>
  (order?.payments ?? []).reduce(
    (total: number, payment: any) => total + payment.amountMinor,
    0,
  );
const outstanding = (order: any) =>
  Math.max(0, (order?.totalMinor ?? 0) - paid(order));

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
  const [splitLabels, setSplitLabels] = useState("A, B");
  const [splitShareId, setSplitShareId] = useState("");

  useEffect(() => {
    api<any[]>("/branches")
      .then((branches) => setBranchId(branches[0]?.id ?? ""))
      .catch((reason) => setError(reason.message));
  }, []);
  useEffect(() => {
    if (!branchId) return;
    Promise.all([
      api<any[]>(`/phase4/dine-in/orders?branchId=${branchId}`),
      api<any[]>(`/pos/registers?branchId=${branchId}`),
    ])
      .then(([nextOrders, nextRegisters]) => {
        setOrders(nextOrders);
        setRegisters(nextRegisters.filter((register) => !register.closedAt));
        setOrderId(nextOrders[0]?.id ?? "");
        setRegisterId(
          nextRegisters.find((register) => !register.closedAt)?.id ?? "",
        );
        setAmount((outstanding(nextOrders[0]) / 100).toFixed(2));
      })
      .catch((reason) => setError(reason.message));
  }, [branchId]);

  const selectedOrder = orders.find((order) => order.id === orderId);
  const remainingMinor = outstanding(selectedOrder);
  const openShares = (selectedOrder?.shares ?? []).filter(
    (share: any) => share.status === "OPEN",
  );
  const isSplit = (selectedOrder?.shares ?? []).some(
    (share: any) => share.status !== "VOID",
  );

  const reload = async (id: string) => {
    const [nextOrders, nextRegisters] = await Promise.all([
      api<any[]>(`/phase4/dine-in/orders?branchId=${id}`),
      api<any[]>(`/pos/registers?branchId=${id}`),
    ]);
    setOrders(nextOrders);
    setRegisters(nextRegisters.filter((register) => !register.closedAt));
    setOrderId((current) => current || (nextOrders[0]?.id ?? ""));
    setRegisterId(
      (current) =>
        current || nextRegisters.find((r: any) => !r.closedAt)?.id || "",
    );
  };

  async function splitBill() {
    setPending(true);
    setError("");
    try {
      const labels = splitLabels
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean);
      const base = Math.floor(remainingMinor / labels.length);
      const shares = labels.map((label, index) => ({
        label,
        totalMinor:
          index === labels.length - 1
            ? remainingMinor - base * (labels.length - 1)
            : base,
      }));
      await api(`/phase4/dine-in/orders/${orderId}/split`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ shares }),
      });
      setMessage("Bill split into shares; settle each share separately.");
      await reload(branchId);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setPending(false);
    }
  }

  async function settleShare() {
    setPending(true);
    setError("");
    try {
      const share = openShares.find((s: any) => s.id === splitShareId);
      const result = await api<any>(`/phase4/shares/${splitShareId}/settle`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          registerId,
          payments: [{ method: tenderMethod, amountMinor: share.totalMinor }],
        }),
      });
      setMessage(
        `Share ${share.label} settled${
          result.receipt ? `; order closed with ${result.receipt.receiptNumber}` : ""
        }`,
      );
      setCommand(null);
      await reload(branchId);
    } catch (reason: any) {
      setError(`Share was not settled. Retry safely: ${reason.message}`);
    } finally {
      setPending(false);
    }
  }

  async function settle() {
    const amountMinor = Math.round(Number(amount) * 100);
    const body =
      command?.orderId === orderId
        ? command.body
        : {
            registerId,
            payments:
              amountMinor > 0 ? [{ method: tenderMethod, amountMinor }] : [],
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
    } catch (reason: any) {
      setError(`Settlement was not confirmed. Retry safely: ${reason.message}`);
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
              onChange={(event) => {
                if (command) return;
                const next = orders.find(
                  (order) => order.id === event.target.value,
                );
                setOrderId(event.target.value);
                setAmount((outstanding(next) / 100).toFixed(2));
              }}
            >
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.table?.name} · PKR{" "}
                  {(order.totalMinor / 100).toFixed(2)} ·{" "}
                  {order.tickets?.some(
                    (ticket: any) => ticket.status !== "READY",
                  )
                    ? "Preparing"
                    : "Ready"}
                </option>
              ))}
            </select>
          </label>
          {selectedOrder && (
            <div className="rounded border p-3">
              {selectedOrder.items.map((item: any) => (
                <p key={item.id}>
                  {item.quantity}× {item.nameSnapshot} · PKR{" "}
                  {(item.lineTotalMinor / 100).toFixed(2)}
                </p>
              ))}
              <p>Tax: PKR {(selectedOrder.taxMinor / 100).toFixed(2)}</p>
              <p>
                Deposits/payments: PKR {(paid(selectedOrder) / 100).toFixed(2)}
              </p>
              <strong>
                Remaining: PKR {(remainingMinor / 100).toFixed(2)}
              </strong>
              {isSplit && (
                <p className="mt-2">
                  Split into{" "}
                  {(selectedOrder.shares ?? [])
                    .map(
                      (share: any) =>
                        `${share.label} ${share.status} PKR ${(
                          share.totalMinor / 100
                        ).toFixed(2)}`,
                    )
                    .join(" · ")}
                </p>
              )}
            </div>
          )}
          <label>
            Register
            <select
              value={registerId}
              onChange={(event) => {
                if (!command) setRegisterId(event.target.value);
              }}
            >
              {registers.map((register) => (
                <option key={register.id} value={register.id}>
                  Open register {register.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Tender amount (PKR)"
            aria-label="Tender amount in PKR"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={amount}
            disabled={remainingMinor === 0}
            onChange={(event) => {
              if (!command) setAmount(event.target.value);
            }}
          />
          <label>
            Tender method
            <select
              value={tenderMethod}
              disabled={remainingMinor === 0}
              onChange={(event) => {
                if (!command) setTenderMethod(event.target.value);
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
            disabled={pending || !orderId || !registerId || isSplit}
            onClick={settle}
          >
            {pending
              ? "Settling…"
              : command
                ? "Retry same settlement"
                : remainingMinor === 0
                  ? "Complete prepaid order"
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
          {!orders.length && <p>No open dine-in orders.</p>}
          {selectedOrder && !isSplit && remainingMinor > 0 && (
            <>
              <hr className="my-4" />
              <label>
                Split into shares (comma separated labels)
                <input
                  value={splitLabels}
                  onChange={(event) => setSplitLabels(event.target.value)}
                />
              </label>
              <Button disabled={pending} onClick={splitBill}>
                {pending ? "Splitting…" : "Split bill evenly"}
              </Button>
            </>
          )}
          {isSplit && (
            <>
              <hr className="my-4" />
              <label>
                Open share
                <select
                  value={splitShareId}
                  onChange={(event) => setSplitShareId(event.target.value)}
                >
                  <option value="">Select a share</option>
                  {openShares.map((share: any) => (
                    <option key={share.id} value={share.id}>
                      {share.label} · PKR {(share.totalMinor / 100).toFixed(2)}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={pending || !splitShareId}
                onClick={settleShare}
              >
                {pending ? "Settling…" : "Settle selected share"}
              </Button>
            </>
          )}
          {!registers.length && <p>No open register for this branch.</p>}
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
        </div>
      </Card>
    </main>
  );
}
