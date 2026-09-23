"use client";
import { useEffect, useState } from "react";
import { Button, Card, Input } from "../../../components/ui";
import { api } from "../../../lib/api";
export default function KitchenPage() {
  const [branchId, setBranchId] = useState("");
  const [stations, setStations] = useState<any[]>([]);
  const [stationId, setStationId] = useState("");
  const [tickets, setTickets] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api<any[]>("/branches")
      .then((x) => setBranchId(x[0]?.id ?? ""))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (branchId)
      api<any[]>(`/phase4/stations?branchId=${branchId}`)
        .then((x) => {
          setStations(x);
          setStationId(x[0]?.id ?? "");
        })
        .catch((e) => setError(e.message));
  }, [branchId]);
  useEffect(() => {
    if (branchId && stationId)
      api<any[]>(
        `/phase4/kitchen/tickets?branchId=${branchId}&stationId=${stationId}`,
      )
        .then(setTickets)
        .catch((e) => setError(e.message));
  }, [branchId, stationId]);
  async function ready(t: any) {
    await api(`/phase4/kitchen/tickets/${t.id}/ready`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ expectedVersion: t.version }),
    });
    setTickets((xs) => xs.filter((x) => x.id !== t.id));
    setMessage("Ticket marked ready");
  }
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Kitchen station</h1>
      <Card>
        <div className="grid gap-3">
          <label>
            Station
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {!tickets.length && <p>Loading assigned tickets…</p>}
          {tickets.map((t) => (
            <div key={t.id} className="flex justify-between">
              <span>
                Ticket {t.sequence} · {t.kind}
              </span>
              <Button onClick={() => ready(t)}>Mark ready</Button>
            </div>
          ))}
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
        </div>
      </Card>
    </main>
  );
}
