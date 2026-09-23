"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, Button, Input, Notice } from "../../../components/ui";
import { api } from "../../../lib/api";

type Branch = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  prices: Array<{ priceMinor: number }>;
  variants: Array<{ id: string; name: string; priceMinor: number }>;
};
type Register = { id: string; closedAt: string | null; openedAt: string };
type CartItem = {
  productId: string;
  name: string;
  quantity: number;
  priceMinor: number;
};

export default function PosPage() {
  const [branchId, setBranchId] = useState("");
  const [registerId, setRegisterId] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [openingFloat, setOpeningFloat] = useState("0");
  const [cardTender, setCardTender] = useState("0");
  const [message, setMessage] = useState("");
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => api<Branch[]>("/branches"),
  });
  const registers = useQuery({
    queryKey: ["pos-registers", branchId],
    queryFn: () => api<Register[]>(`/pos/registers?branchId=${branchId}`),
    enabled: Boolean(branchId),
  });
  const catalog = useQuery({
    queryKey: ["pos-catalog", branchId, search],
    queryFn: () =>
      api<Product[]>(
        `/pos/catalog?branchId=${branchId}&search=${encodeURIComponent(search)}`,
      ),
    enabled: Boolean(branchId),
  });
  const quote = useQuery({
    queryKey: ["pos-quote", branchId, cart],
    queryFn: () =>
      api<{ subtotalMinor: number; taxMinor: number; totalMinor: number }>(
        "/pos/quote",
        {
          method: "POST",
          body: JSON.stringify({
            branchId,
            registerId,
            items: cart.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            })),
            payments: [],
          }),
        },
      ),
    enabled: Boolean(branchId && registerId && cart.length),
  });
  const open = useMutation({
    mutationFn: () =>
      api<Register>("/pos/registers/open", {
        method: "POST",
        body: JSON.stringify({
          branchId,
          openingFloatMinor: Number(openingFloat) || 0,
        }),
      }),
    onSuccess: (r) => {
      setRegisterId(r.id);
      setMessage("Register opened and selected for this shift.");
    },
    onError: (e: Error) => setMessage(e.message),
  });
  const sale = useMutation({
    mutationFn: async () => {
      const total = quote.data?.totalMinor ?? 0;
      const card = Math.max(0, Number(cardTender) || 0);
      const cash = total - card;
      return api<{ receipt: { receiptNumber: string } }>("/pos/orders", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          branchId,
          registerId,
          orderType: "TAKEAWAY",
          items: cart.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          payments: [
            { method: "CASH", amountMinor: cash },
            ...(card ? [{ method: "MANUAL_CARD", amountMinor: card }] : []),
          ],
        }),
      });
    },
    onSuccess: (r) => {
      setCart([]);
      setCardTender("0");
      setMessage(`Sale completed: ${r.receipt.receiptNumber}`);
    },
    onError: (e: Error) => setMessage(e.message),
  });
  const total =
    quote.data?.totalMinor ??
    cart.reduce((sum, i) => sum + i.priceMinor * i.quantity, 0);
  const card = Math.max(0, Number(cardTender) || 0);
  const cash = Math.max(0, total - card);
  const activeRegister = registers.data?.find((r) => !r.closedAt);
  useEffect(() => {
    if (activeRegister && !registerId) setRegisterId(activeRegister.id);
  }, [activeRegister, registerId]);
  const canPay = Boolean(
    branchId &&
    registerId &&
    cart.length &&
    quote.data &&
    card <= total &&
    !sale.isPending,
  );
  const add = (product: Product) =>
    setCart((items) => {
      const old = items.find((i) => i.productId === product.id);
      return old
        ? items.map((i) =>
            i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i,
          )
        : [
            ...items,
            {
              productId: product.id,
              name: product.name,
              quantity: 1,
              priceMinor: product.prices[0]?.priceMinor ?? 0,
            },
          ];
    });
  if (branches.isLoading) return <p>Loading branches...</p>;
  return (
    <>
      <header className="topbar">
        <div className="page-title">
          <h1>Point of sale</h1>
          <p>Server-priced takeaway and quick sale</p>
        </div>
      </header>
      {message && (
        <Notice tone={message.includes("completed") ? "success" : "error"}>
          {message}
        </Notice>
      )}
      <div className="grid">
        <Card>
          <h2>Register</h2>
          <label className="label">Branch</label>
          <select
            className="input"
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setRegisterId("");
            }}
          >
            <option value="">Select branch</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {activeRegister ? (
            <p className="muted">Open shift selected automatically.</p>
          ) : (
            <>
              <Input
                label="Opening float (minor units)"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                inputMode="numeric"
              />
              <Button
                disabled={!branchId || open.isPending}
                onClick={() => open.mutate()}
              >
                Open register
              </Button>
            </>
          )}{" "}
          {registerId && (
            <p className="muted">Register: {registerId.slice(0, 8)}</p>
          )}
        </Card>
        <Card>
          <h2>Cart</h2>
          {cart.length === 0 ? (
            <p className="muted">Tap a product to add it.</p>
          ) : (
            cart.map((item) => (
              <div className="row" key={item.productId}>
                <span>{item.name}</span>
                <span>
                  <button
                    className="icon-button"
                    onClick={() =>
                      setCart((items) =>
                        items.map((i) =>
                          i.productId === item.productId
                            ? { ...i, quantity: Math.max(1, i.quantity - 1) }
                            : i,
                        ),
                      )
                    }
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>{" "}
                  {item.quantity}{" "}
                  <button
                    className="icon-button"
                    onClick={() =>
                      setCart((items) =>
                        items.map((i) =>
                          i.productId === item.productId
                            ? { ...i, quantity: i.quantity + 1 }
                            : i,
                        ),
                      )
                    }
                    aria-label="Increase quantity"
                  >
                    +
                  </button>{" "}
                  <button
                    className="text-link"
                    onClick={() =>
                      setCart((items) =>
                        items.filter((i) => i.productId !== item.productId),
                      )
                    }
                  >
                    Remove
                  </button>
                </span>
              </div>
            ))
          )}
          <hr />
          <div className="row">
            <span>Subtotal</span>
            <strong>{quote.data?.subtotalMinor ?? total}</strong>
          </div>
          <div className="row">
            <span>Tax</span>
            <strong>{quote.data?.taxMinor ?? 0}</strong>
          </div>
          <div className="row">
            <strong>Total</strong>
            <strong>{total}</strong>
          </div>
          <Input
            label="Manual card tender (minor units)"
            value={cardTender}
            onChange={(e) => setCardTender(e.target.value)}
            inputMode="numeric"
          />
          <p className="muted">
            Cash tender: {cash} · Change is calculated by the server.
          </p>
          <Button disabled={!canPay} onClick={() => sale.mutate()}>
            Complete sale
          </Button>
        </Card>
      </div>
      <Card>
        <h2>Catalog</h2>
        <Input
          label="Search name, SKU or barcode"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!branchId ? (
          <p className="muted">Choose a branch to load products.</p>
        ) : catalog.isLoading ? (
          <p>Loading catalog...</p>
        ) : (
          <div className="grid">
            {catalog.data?.map((product) => (
              <button
                className="card"
                key={product.id}
                onClick={() => add(product)}
              >
                <strong>{product.name}</strong>
                <span>{product.prices[0]?.priceMinor ?? 0}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
