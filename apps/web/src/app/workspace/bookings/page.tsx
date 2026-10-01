"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Button, Card, Input } from "../../../components/ui";
import { api } from "../../../lib/api";

type DepositCommand = { signature: string; key: string; body: string };
const money = (minor: number) => `PKR ${(minor / 100).toFixed(2)}`;

export default function BookingsPage() {
  const [branchId, setBranchId] = useState("");
  const [tables, setTables] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [kind, setKind] = useState("RESERVATION");
  const [tableId, setTableId] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [party, setParty] = useState("2");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [deposit, setDeposit] = useState("0.00");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0.00");
  const [courier, setCourier] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [depositAction, setDepositAction] = useState("COLLECTION");
  const [depositMethod, setDepositMethod] = useState("CASH");
  const [depositPayment, setDepositPayment] = useState("0.00");
  const [depositReference, setDepositReference] = useState("");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const depositCommand = useRef<DepositCommand | null>(null);
  const applyCommand = useRef<DepositCommand | null>(null);
  const lifecycleCommand = useRef<DepositCommand | null>(null);
  const dispatchCommand = useRef<DepositCommand | null>(null);

  const refresh = async (id: string) => {
    const [nextTables, nextBookings, nextOrders] = await Promise.all([
      api<any[]>(`/phase4/tables?branchId=${id}`),
      api<any[]>(`/phase4/bookings?branchId=${id}`),
      api<any[]>(`/phase4/dine-in/orders?branchId=${id}`).catch(() => []),
    ]);
    setTables(nextTables);
    setBookings(nextBookings);
    setOrders(nextOrders);
    setTableId((current) => current || nextTables[0]?.id || "");
    setSelectedBookingId((current) => current || nextBookings[0]?.id || "");
    setOrderId((current) => current || nextOrders[0]?.id || "");
  };

  useEffect(() => {
    api<any[]>("/branches")
      .then((branches) => setBranchId(branches[0]?.id ?? ""))
      .catch((reason) => setError(reason.message));
  }, []);
  useEffect(() => {
    if (branchId) refresh(branchId).catch((reason) => setError(reason.message));
  }, [branchId]);

  async function save() {
    setPending(true);
    setError("");
    try {
      await api("/phase4/bookings", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          branchId,
          tableId: kind === "WAITLIST" ? undefined : tableId,
          kind,
          customerName: name,
          contact,
          partySize: Number(party),
          startsAt: new Date(starts).toISOString(),
          endsAt: new Date(ends).toISOString(),
          depositMinor: Math.round(Number(deposit) * 100),
          deliveryAddress: kind === "DELIVERY" ? address : undefined,
          deliveryPhone: kind === "DELIVERY" ? phone : undefined,
          deliveryFeeMinor:
            kind === "DELIVERY" ? Math.round(Number(deliveryFee) * 100) : 0,
          details: {},
        }),
      });
      setName("");
      setAddress("");
      await refresh(branchId);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      setPending(false);
    }
  }

  async function recordDeposit() {
    const body = JSON.stringify({
      kind: depositAction,
      method: depositMethod,
      amountMinor: Math.round(Number(depositPayment) * 100),
      reference: depositReference || undefined,
    });
    const signature = `${selectedBookingId}:${body}`;
    if (
      !depositCommand.current ||
      depositCommand.current.signature !== signature
    )
      depositCommand.current = { signature, key: crypto.randomUUID(), body };
    setPending(true);
    setError("");
    try {
      await api(`/phase4/bookings/${selectedBookingId}/deposit-transactions`, {
        method: "POST",
        headers: { "Idempotency-Key": depositCommand.current.key },
        body: depositCommand.current.body,
      });
      depositCommand.current = null;
      setDepositPayment("0.00");
      setDepositReference("");
      await refresh(branchId);
    } catch (reason: any) {
      setError(
        `${reason.message} You may retry the same deposit command safely.`,
      );
    } finally {
      setPending(false);
    }
  }

  async function applyCollectedDeposit() {
    const body = JSON.stringify({ orderId });
    const signature = `${selectedBookingId}:${body}`;
    if (!applyCommand.current || applyCommand.current.signature !== signature)
      applyCommand.current = { signature, key: crypto.randomUUID(), body };
    setPending(true);
    setError("");
    try {
      await api(`/phase4/bookings/${selectedBookingId}/apply-deposit`, {
        method: "POST",
        headers: { "Idempotency-Key": applyCommand.current.key },
        body: applyCommand.current.body,
      });
      applyCommand.current = null;
      await refresh(branchId);
    } catch (reason: any) {
      setError(`${reason.message} You may retry the same application safely.`);
    } finally {
      setPending(false);
    }
  }

  const selectedBooking = bookings.find(
    (booking) => booking.id === selectedBookingId,
  );

  const postFrozen = async (
    ref: MutableRefObject<DepositCommand | null>,
    path: string,
    payload: any,
  ) => {
    const body = JSON.stringify(payload);
    const signature = `${selectedBookingId}:${path}:${body}`;
    if (!ref.current || ref.current.signature !== signature)
      ref.current = { signature, key: crypto.randomUUID(), body };
    setPending(true);
    setError("");
    try {
      await api(`/phase4${path}`, {
        method: "POST",
        headers: { "Idempotency-Key": ref.current.key },
        body: ref.current.body,
      });
      ref.current = null;
      await refresh(branchId);
    } catch (reason: any) {
      setError(`${reason.message} You may retry the same command safely.`);
    } finally {
      setPending(false);
    }
  };

  const transitionBooking = (status: string) =>
    postFrozen(lifecycleCommand, `/bookings/${selectedBookingId}/transition`, {
      status,
      reason: closeReason || undefined,
    });
  const deliveryAction = (action: string) =>
    postFrozen(dispatchCommand, `/bookings/${selectedBookingId}/delivery`, {
      action,
      courierName: courier || undefined,
    });

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">
        Reservations and service bookings
      </h1>
      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            Type
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="RESERVATION">Reservation</option>
              <option value="WAITLIST">Waitlist</option>
              <option value="ADVANCE_TAKEAWAY">Advance takeaway</option>
              <option value="DELIVERY">Delivery</option>
            </select>
          </label>
          <label>
            Table
            <select
              disabled={kind === "WAITLIST"}
              value={tableId}
              onChange={(event) => setTableId(event.target.value)}
            >
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name} · {table.capacity} seats
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Customer name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            label="Contact"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
          />
          <Input
            label="Party size"
            type="number"
            min="1"
            value={party}
            onChange={(event) => setParty(event.target.value)}
          />
          <Input
            label="Requested deposit (PKR)"
            type="number"
            min="0"
            step="0.01"
            value={deposit}
            onChange={(event) => setDeposit(event.target.value)}
          />
          <Input
            label="Starts"
            type="datetime-local"
            value={starts}
            onChange={(event) => setStarts(event.target.value)}
          />
          <Input
            label="Ends"
            type="datetime-local"
            value={ends}
            onChange={(event) => setEnds(event.target.value)}
          />
          {kind === "DELIVERY" && (
            <>
              <Input
                label="Delivery address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
              <Input
                label="Delivery phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <Input
                label="Delivery fee (PKR)"
                type="number"
                min="0"
                step="0.01"
                value={deliveryFee}
                onChange={(event) => setDeliveryFee(event.target.value)}
              />
            </>
          )}
        </div>
        <Button
          disabled={
            pending ||
            !name ||
            !starts ||
            !ends ||
            (kind === "DELIVERY" && !address)
          }
          onClick={save}
        >
          {pending ? "Saving…" : "Create booking"}
        </Button>
      </Card>
      <Card>
        <h2>Upcoming</h2>
        {!bookings.length ? (
          <p>No bookings yet.</p>
        ) : (
          <div className="space-y-2">
            {bookings.map((booking) => (
              <button
                className="block w-full rounded border p-3 text-left"
                key={booking.id}
                onClick={() => {
                  setSelectedBookingId(booking.id);
                  depositCommand.current = null;
                  applyCommand.current = null;
                  lifecycleCommand.current = null;
                  dispatchCommand.current = null;
                }}
                type="button"
              >
                <strong>{booking.kind}</strong> · {booking.customerName} ·{" "}
                {booking.table?.name ?? "Unassigned"} ·{" "}
                {new Date(booking.startsAt).toLocaleString()} · {booking.status}
                <span className="mt-1 block text-sm">
                  Requested {money(booking.depositMinor)} · Collected{" "}
                  {money(booking.collectedDepositMinor)} · Refunded{" "}
                  {money(booking.refundedDepositMinor)} · Applied{" "}
                  {money(booking.appliedDepositMinor)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
      {selectedBooking && (
        <Card>
          <h2>Deposit collection and application</h2>
          <p>
            Requested amount is informational. Only a recorded collection can
            reduce an order balance.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              Action
              <select
                value={depositAction}
                onChange={(event) => {
                  setDepositAction(event.target.value);
                  depositCommand.current = null;
                }}
              >
                <option value="COLLECTION">Collect deposit</option>
                <option value="REFUND">Refund unapplied deposit</option>
              </select>
            </label>
            <label>
              Payment method
              <select
                value={depositMethod}
                onChange={(event) => {
                  setDepositMethod(event.target.value);
                  depositCommand.current = null;
                }}
              >
                <option value="CASH">Cash</option>
                <option value="MANUAL_CARD">Manual card</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="JAZZCASH">JazzCash</option>
                <option value="EASYPAISA">Easypaisa</option>
              </select>
            </label>
            <Input
              label="Amount (PKR)"
              min="0.01"
              step="0.01"
              type="number"
              value={depositPayment}
              onChange={(event) => {
                setDepositPayment(event.target.value);
                depositCommand.current = null;
              }}
            />
            <Input
              label="Reference (optional)"
              value={depositReference}
              onChange={(event) => {
                setDepositReference(event.target.value);
                depositCommand.current = null;
              }}
            />
          </div>
          <Button
            disabled={pending || Number(depositPayment) <= 0}
            onClick={recordDeposit}
          >
            {pending
              ? "Recording…"
              : depositAction === "COLLECTION"
                ? "Record collection"
                : "Record refund"}
          </Button>
          <hr className="my-4" />
          <label>
            Eligible dine-in order
            <select
              value={orderId}
              onChange={(event) => {
                setOrderId(event.target.value);
                applyCommand.current = null;
              }}
            >
              <option value="">Select an order</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  Order #{order.orderNumber} · {order.table?.name ?? "No table"}{" "}
                  · {money(order.totalMinor)}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={pending || !orderId}
            onClick={applyCollectedDeposit}
          >
            Apply collected deposit to order
          </Button>
        </Card>
      )}
      {selectedBooking && (
        <Card>
          <h2>Booking lifecycle</h2>
          <p>
            Status: {selectedBooking.status}. Cancelling or marking a no-show is
            blocked while an unapplied deposit or an unsettled order remains.
          </p>
          <Input
            label="Reason (optional)"
            value={closeReason}
            onChange={(event) => {
              setCloseReason(event.target.value);
              lifecycleCommand.current = null;
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() => transitionBooking("SEATED")}
            >
              Seat guest
            </Button>
            <Button
              disabled={pending}
              onClick={() => transitionBooking("COMPLETED")}
            >
              Complete
            </Button>
            <Button
              disabled={pending}
              onClick={() => transitionBooking("CANCELLED")}
            >
              Cancel booking
            </Button>
            <Button
              disabled={pending}
              onClick={() => transitionBooking("NO_SHOW")}
            >
              Mark no-show
            </Button>
          </div>
          {selectedBooking.kind === "DELIVERY" && (
            <>
              <hr className="my-4" />
              <h2>Delivery dispatch</h2>
              <p>
                Address: {selectedBooking.deliveryAddress ?? "missing"} · Fee{" "}
                {money(selectedBooking.deliveryFeeMinor)} ·{" "}
                {selectedBooking.dispatchedAt
                  ? `Dispatched ${new Date(selectedBooking.dispatchedAt).toLocaleString()}`
                  : "Not dispatched"}
              </p>
              <Input
                label="Courier name"
                value={courier}
                onChange={(event) => {
                  setCourier(event.target.value);
                  dispatchCommand.current = null;
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending}
                  onClick={() => deliveryAction("DISPATCH")}
                >
                  Dispatch
                </Button>
                <Button
                  disabled={pending}
                  onClick={() => deliveryAction("COMPLETE")}
                >
                  Mark delivered
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
