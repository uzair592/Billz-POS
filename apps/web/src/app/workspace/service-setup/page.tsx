"use client";
import { useEffect, useState } from "react";
import { Button, Card, Input } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function ServiceSetupPage() {
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [tableName, setTableName] = useState("");
  const [stationName, setStationName] = useState("");
  const [error, setError] = useState("");
  const refresh = async (id: string) => {
    const [t, s] = await Promise.all([
      api<any[]>(`/phase4/tables?branchId=${id}`),
      api<any[]>(`/phase4/stations?branchId=${id}`),
    ]);
    setTables(t);
    setStations(s);
  };
  useEffect(() => {
    api<any[]>("/branches")
      .then((x) => {
        setBranches(x);
        setBranchId(x[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (branchId) refresh(branchId).catch((e) => setError(e.message));
  }, [branchId]);
  async function createTable() {
    try {
      await api("/phase4/tables", {
        method: "POST",
        body: JSON.stringify({ branchId, name: tableName, capacity: 2 }),
      });
      setTableName("");
      await refresh(branchId);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function createStation() {
    try {
      await api("/phase4/stations", {
        method: "POST",
        body: JSON.stringify({ branchId, name: stationName }),
      });
      setStationName("");
      await refresh(branchId);
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Table and kitchen setup</h1>
      <label>
        Branch
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2>Tables</h2>
          <Input
            label="Table name"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
          />
          <Button disabled={!tableName} onClick={createTable}>
            Create table
          </Button>
          {tables.map((t) => (
            <p key={t.id}>
              {t.name} · {t.status}
            </p>
          ))}
        </Card>
        <Card>
          <h2>Kitchen stations</h2>
          <Input
            label="Station name"
            value={stationName}
            onChange={(e) => setStationName(e.target.value)}
          />
          <Button disabled={!stationName} onClick={createStation}>
            Create station
          </Button>
          {stations.map((s) => (
            <p key={s.id}>{s.name}</p>
          ))}
        </Card>
      </div>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
