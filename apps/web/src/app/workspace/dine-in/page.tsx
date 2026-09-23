"use client";
import { useState } from "react";
import { Button, Card, Input } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function DineInPage() {
  const [branchId, setBranchId] = useState(""); const [tableId, setTableId] = useState(""); const [stationId, setStationId] = useState(""); const [productId, setProductId] = useState(""); const [result, setResult] = useState("");
  async function open() { const data = await api<any>("/phase4/dine-in/orders", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ branchId, tableId, stationId, items: [{ productId, quantity: 1 }] }) }); setResult(`Order ${data.order?.orderNumber ?? data.order?.id} sent to kitchen`); }
  return <main className="mx-auto max-w-2xl space-y-4 p-6"><h1 className="text-2xl font-semibold">Dine-in waiter</h1><Card><div className="grid gap-3"><Input aria-label="Branch ID" placeholder="Branch ID" value={branchId} onChange={e=>setBranchId(e.target.value)} /><Input aria-label="Table ID" placeholder="Table ID" value={tableId} onChange={e=>setTableId(e.target.value)} /><Input aria-label="Kitchen station ID" placeholder="Kitchen station ID" value={stationId} onChange={e=>setStationId(e.target.value)} /><Input aria-label="Product ID" placeholder="Product ID" value={productId} onChange={e=>setProductId(e.target.value)} /><Button onClick={open}>Send dine-in order</Button>{result && <p role="status">{result}</p>}</div></Card></main>;
}
