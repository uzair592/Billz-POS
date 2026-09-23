"use client";
import { useEffect, useState } from "react";
import { Button, Card, Input } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function DineInPage() {
  const [branchId, setBranchId] = useState("");
  const [tables, setTables] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [tableId, setTableId] = useState("");
  const [stationId, setStationId] = useState("");
  const [productId, setProductId] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [command, setCommand] = useState<{ key: string; body: any } | null>(
    null,
  );
  useEffect(() => {
    api<any[]>("/branches")
      .then((xs) => {
        setBranchId(xs[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!branchId) return;
    Promise.all([
      api<any[]>(`/phase4/tables?branchId=${branchId}`),
      api<any[]>(`/phase4/stations?branchId=${branchId}`),
      api<any[]>(`/pos/catalog?branchId=${branchId}`),
    ])
      .then(([t, s, p]) => {
        setTables(t);
        setStations(s);
        setProducts(p);
        setTableId(t[0]?.id ?? "");
        setStationId(s[0]?.id ?? "");
        setProductId(p[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, [branchId]);
  async function open() {
    const body = command?.body ?? {
      branchId,
      tableId,
      stationId,
      items: [{ productId, quantity: 1 }],
    };
    const key = command?.key ?? crypto.randomUUID();
    setCommand({ key, body });
    setPending(true);
    setError("");
    try {
      const data = await api<any>("/phase4/dine-in/orders", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(body),
      });
      setResult(
        `Order ${data.order?.orderNumber ?? data.order?.id} sent to kitchen`,
      );
      setCommand(null);
    } catch (e: any) {
      setError(`Request uncertain. Retry safely: ${e.message}`);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Dine-in waiter</h1>
      <Card>
        <div className="grid gap-3">
          <label>
            Branch
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">Select branch</option>
              {branchId && <option value={branchId}>{branchId}</option>}
            </select>
          </label>
          <label>
            Table
            <select
              value={tableId}
              onChange={(e) => {
                setTableId(e.target.value);
                setCommand(null);
              }}
            >
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kitchen station
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
          <label>
            Menu item
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setCommand(null);
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={pending || !tableId || !productId} onClick={open}>
            {pending
              ? "Sending…"
              : command
                ? "Retry same order"
                : "Send dine-in order"}
          </Button>
          {!tables.length && branchId && (
            <p>Loading available tables and menu…</p>
          )}
          {error && <p role="alert">{error}</p>}
          {result && <p role="status">{result}</p>}
        </div>
      </Card>
    </main>
  );
}
