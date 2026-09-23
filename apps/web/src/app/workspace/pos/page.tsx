"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Input, Notice } from "../../../components/ui";
import { api } from "../../../lib/api";

type Branch = { id: string; name: string };
type Product = { id: string; name: string; taxRateBps: number; prices: Array<{ priceMinor: number }>; variants: Array<{ id: string; name: string; priceMinor: number }> };

export default function PosPage() {
  const [branchId, setBranchId] = useState("");
  const [cart, setCart] = useState<Array<{ productId: string; name: string; quantity: number; priceMinor: number }>>([]);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [message, setMessage] = useState("");
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<Branch[]>("/branches") });
  const catalog = useQuery({ queryKey: ["pos-catalog", branchId], queryFn: () => api<Product[]>(`/pos/catalog?branchId=${branchId}`), enabled: Boolean(branchId) });
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0), [cart]);
  const open = useMutation({ mutationFn: () => api<{ id: string }>("/pos/registers/open", { method: "POST", body: JSON.stringify({ branchId, openingFloatMinor: Number(openingFloat) || 0 }) }), onSuccess: () => setMessage("Register opened. Add items and complete a sale."), onError: (e: Error) => setMessage(e.message) });
  const sale = useMutation({ mutationFn: () => api<{ receipt: { receiptNumber: string } }>("/pos/orders", { method: "POST", body: JSON.stringify({ branchId, orderType: "TAKEAWAY", items: cart.map(item => ({ productId: item.productId, quantity: item.quantity })), payments: [{ method: "CASH", amountMinor: total }] }) }), onSuccess: result => { setCart([]); setMessage(`Sale completed: ${result.receipt.receiptNumber}`); }, onError: (e: Error) => setMessage(e.message) });
  if (branches.isLoading) return <p>Loading branches...</p>;
  return <>
    <header className="topbar"><div className="page-title"><h1>Point of sale</h1><p>Quick sale, takeaway and receipt-safe totals</p></div></header>
    {message && <Notice>{message}</Notice>}
    <div className="grid">
      <Card><h2>Register</h2><label className="label">Branch</label><select className="input" value={branchId} onChange={e => setBranchId(e.target.value)}><option value="">Select branch</option>{branches.data?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><Input label="Opening float (minor units)" value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} inputMode="numeric" /><Button disabled={!branchId || open.isPending} onClick={() => open.mutate()}>Open register</Button></Card>
      <Card><h2>Cart</h2>{cart.length === 0 ? <p className="muted">Tap a product to add it.</p> : cart.map(item => <div className="row" key={item.productId}><span>{item.name} × {item.quantity}</span><strong>{item.priceMinor * item.quantity}</strong></div>)}<hr /><div className="row"><strong>Total</strong><strong>{total} minor units</strong></div><Button disabled={!branchId || !cart.length || sale.isPending} onClick={() => sale.mutate()}>Pay cash</Button></Card>
    </div>
    <Card><h2>Catalog</h2>{!branchId ? <p className="muted">Choose a branch to load products.</p> : catalog.isLoading ? <p>Loading catalog...</p> : <div className="grid">{catalog.data?.map(product => <button className="card" key={product.id} onClick={() => setCart(items => { const existing = items.find(i => i.productId === product.id); return existing ? items.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i) : [...items, { productId: product.id, name: product.name, quantity: 1, priceMinor: product.prices[0]?.priceMinor ?? 0 }]; })}><strong>{product.name}</strong><span>{product.prices[0]?.priceMinor ?? 0}</span></button>)}</div>}</Card>
  </>;
}
