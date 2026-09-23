"use client";
import { useEffect, useState } from "react";
import { Button, Card } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function KitchenPage() {
  const [branchId, setBranchId] = useState("");
  const [stations, setStations] = useState<any[]>([]);
  const [stationId, setStationId] = useState("");
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [command, setCommand] = useState<{ key: string; ticket: any } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  useEffect(() => {
    api<any[]>("/branches")
      .then((x) => setBranchId(x[0]?.id ?? ""))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!branchId) return;
    api<any[]>(`/phase4/stations?branchId=${branchId}`)
      .then((x) => {
        setStations(x);
        setStationId(x[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, [branchId]);
  useEffect(() => {
    if (!branchId || !stationId) return;
    const refresh = () => {
      setLoading(true);
      api<any[]>(
        `/phase4/kitchen/tickets?branchId=${branchId}&stationId=${stationId}`,
      )
        .then((x) => {
          setTickets(x);
          setError("");
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [branchId, stationId]);
  async function ready(ticket: any) {
    const frozen: { key: string; ticket: any } =
      command?.ticket.id === ticket.id
        ? command!
        : { key: crypto.randomUUID(), ticket };
    setCommand(frozen);
    setPending(true);
    setError("");
    try {
      await api(`/phase4/kitchen/tickets/${ticket.id}/ready`, {
        method: "POST",
        headers: { "Idempotency-Key": frozen.key },
        body: JSON.stringify({ expectedVersion: frozen.ticket.version }),
      });
      setTickets((xs) => xs.filter((x) => x.id !== ticket.id));
      setMessage("Ticket marked ready");
      setCommand(null);
    } catch (e: any) {
      setError(`Update was not confirmed. Retry safely: ${e.message}`);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Kitchen station</h1>
      <Card>
        <div className="grid gap-3">
          <label>
            Station
            <select
              value={stationId}
              onChange={(e) => {
                setStationId(e.target.value);
                setCommand(null);
              }}
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {loading && <p>Loading assigned tickets…</p>}
          {!loading && !tickets.length && (
            <p>No pending tickets for this station.</p>
          )}
          {tickets.map((ticket) => (
            <article key={ticket.id} className="card">
              <strong>
                Ticket {ticket.sequence} · {ticket.kind} · {ticket.status}
              </strong>
              <ul>
                {(Array.isArray(ticket.items) ? ticket.items : []).map(
                  (item: any, index: number) => (
                    <li key={`${ticket.id}-${index}`}>
                      <strong>
                        {item.quantity}× {item.nameSnapshot}
                      </strong>
                      {item.modifiers?.length ? (
                        <span>
                          {" "}
                          ·{" "}
                          {item.modifiers
                            .map((modifier: any) => modifier.name)
                            .join(", ")}
                        </span>
                      ) : null}
                      {item.notesSnapshot ? (
                        <p>Note: {item.notesSnapshot}</p>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
              <Button disabled={pending} onClick={() => ready(ticket)}>
                {pending && command?.ticket.id === ticket.id
                  ? "Saving…"
                  : command?.ticket.id === ticket.id
                    ? "Retry update"
                    : "Mark ready"}
              </Button>
            </article>
          ))}
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
        </div>
      </Card>
    </main>
  );
}
