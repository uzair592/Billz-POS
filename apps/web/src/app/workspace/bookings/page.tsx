"use client";
import { useEffect, useState } from "react";
import { Button, Card, Input } from "../../../components/ui";
import { api } from "../../../lib/api";
export default function BookingsPage() {
  const [branchId, setBranchId] = useState("");
  const [tables, setTables] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [kind, setKind] = useState("RESERVATION");
  const [tableId, setTableId] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [party, setParty] = useState("2");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [deposit, setDeposit] = useState("0.00");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const refresh = async (id: string) => {
    const [t, b] = await Promise.all([
      api<any[]>(`/phase4/tables?branchId=${id}`),
      api<any[]>(`/phase4/bookings?branchId=${id}`),
    ]);
    setTables(t);
    setBookings(b);
    setTableId(t[0]?.id ?? "");
  };
  useEffect(() => {
    api<any[]>("/branches")
      .then((x) => {
        setBranchId(x[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (branchId) refresh(branchId).catch((e) => setError(e.message));
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
          details: {},
        }),
      });
      setName("");
      await refresh(branchId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">
        Reservations and service bookings
      </h1>
      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
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
              onChange={(e) => setTableId(e.target.value)}
            >
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.capacity} seats
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Customer name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
          <Input
            label="Party size"
            type="number"
            min="1"
            value={party}
            onChange={(e) => setParty(e.target.value)}
          />
          <Input
            label="Deposit (PKR)"
            type="number"
            min="0"
            step="0.01"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
          <Input
            label="Starts"
            type="datetime-local"
            value={starts}
            onChange={(e) => setStarts(e.target.value)}
          />
          <Input
            label="Ends"
            type="datetime-local"
            value={ends}
            onChange={(e) => setEnds(e.target.value)}
          />
        </div>
        <Button disabled={pending || !name || !starts || !ends} onClick={save}>
          {pending ? "Saving…" : "Create booking"}
        </Button>
      </Card>
      <Card>
        <h2>Upcoming</h2>
        {!bookings.length ? (
          <p>No bookings yet.</p>
        ) : (
          bookings.map((b) => (
            <p key={b.id}>
              <strong>{b.kind}</strong> · {b.customerName} ·{" "}
              {b.table?.name ?? "Unassigned"} ·{" "}
              {new Date(b.startsAt).toLocaleString()} · deposit PKR{" "}
              {(b.depositMinor / 100).toFixed(2)} · {b.status}
            </p>
          ))
        )}
      </Card>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
