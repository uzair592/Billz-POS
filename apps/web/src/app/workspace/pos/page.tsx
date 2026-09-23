"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Input, Notice } from "../../../components/ui";
import { api } from "../../../lib/api";

type Branch = { id: string; name: string };
type Modifier = {
  id: string;
  name: string;
  priceMinor: number;
  active?: boolean;
};
type Product = {
  id: string;
  name: string;
  prices: Array<{ priceMinor: number }>;
  variants: Array<{ id: string; name: string; priceMinor: number }>;
  modifierConfig?: Modifier[];
};
type Register = { id: string; closedAt: string | null; openedAt: string };
type CartItem = {
  product: Product;
  quantity: number;
  variantId?: string;
  modifierIds: string[];
};
const money = (minor: number) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 2,
  }).format(minor / 100);

export default function PosPage() {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState("");
  const [registerId, setRegisterId] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [openingFloat, setOpeningFloat] = useState("0");
  const [cardTender, setCardTender] = useState("0");
  const [message, setMessage] = useState("");
  const [checkoutCommand, setCheckoutCommand] = useState<{
    key: string;
    body: Record<string, unknown>;
  } | null>(null);
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
    queryKey: ["pos-quote", branchId, registerId, cart],
    queryFn: () =>
      api<{ subtotalMinor: number; taxMinor: number; totalMinor: number }>(
        "/pos/quote",
        {
          method: "POST",
          body: JSON.stringify({
            branchId,
            registerId,
            items: cart.map((i) => ({
              productId: i.product.id,
              variantId: i.variantId,
              quantity: i.quantity,
              modifiers: i.modifierIds.map((id) => ({ id })),
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
          openingFloatMinor: Math.round(Number(openingFloat || 0) * 100),
        }),
      }),
    onSuccess: (r) => {
      setRegisterId(r.id);
      queryClient.invalidateQueries({ queryKey: ["pos-registers", branchId] });
      setMessage("Register opened and selected for this shift.");
    },
    onError: (e: Error) => setMessage(e.message),
  });
  const sale = useMutation({
    mutationFn: async (command: {
      key: string;
      body: Record<string, unknown>;
    }) =>
      api<{ id: string; receipt: { receiptNumber: string } }>("/pos/orders", {
        method: "POST",
        headers: { "Idempotency-Key": command.key },
        body: JSON.stringify(command.body),
      }),
    onSuccess: (r) => {
      setCart([]);
      setCheckoutCommand(null);
      setCardTender("0");
      setMessage(
        `Sale completed: ${r.receipt.receiptNumber}. Order ${r.id.slice(0, 8)} is ready to reprint.`,
      );
    },
    onError: (e: Error) => setMessage(e.message),
  });
  const activeRegister = registers.data?.find((r) => !r.closedAt);
  useEffect(() => {
    if (activeRegister && !registerId) setRegisterId(activeRegister.id);
  }, [activeRegister, registerId]);
  useEffect(() => {
    setCheckoutCommand(null);
  }, [branchId, registerId, cart, cardTender]);
  const total = quote.data?.totalMinor ?? 0;
  const card = Math.round(Number(cardTender || 0) * 100);
  const cash = total - card;
  const canPay = Boolean(
    branchId &&
    registerId &&
    cart.length &&
    quote.data &&
    card >= 0 &&
    card <= total &&
    !sale.isPending,
  );
  const add = (product: Product) =>
    setCart((items) =>
      items.some((i) => i.product.id === product.id)
        ? items.map((i) =>
            i.product.id === product.id
              ? { ...i, quantity: i.quantity + 1 }
              : i,
          )
        : [
            ...items,
            {
              product,
              quantity: 1,
              variantId: product.variants[0]?.id,
              modifierIds: [],
            },
          ],
    );
  const update = (productId: string, change: Partial<CartItem>) =>
    setCart((items) =>
      items.map((i) => (i.product.id === productId ? { ...i, ...change } : i)),
    );
  if (branches.isLoading) return <p>Loading branches...</p>;
  return (
    <>
      <header className="topbar">
        <div className="page-title">
          <h1>Point of sale</h1>
          <p>Server-priced takeaway and quick sale · PKR</p>
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
              setCart([]);
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
                label="Opening float (PKR)"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                inputMode="decimal"
              />
              <Button
                disabled={!branchId || open.isPending}
                onClick={() => open.mutate()}
              >
                Open register
              </Button>
            </>
          )}
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
              <div className="row" key={item.product.id}>
                <div>
                  <strong>{item.product.name}</strong>
                  <select
                    className="input"
                    aria-label={`${item.product.name} variant`}
                    value={item.variantId ?? ""}
                    onChange={(e) =>
                      update(item.product.id, {
                        variantId: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">Base price</option>
                    {item.product.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {money(v.priceMinor)}
                      </option>
                    ))}
                  </select>
                  {(item.product.modifierConfig ?? [])
                    .filter((m) => m.active !== false)
                    .map((m) => (
                      <label key={m.id} className="muted">
                        <input
                          type="checkbox"
                          checked={item.modifierIds.includes(m.id)}
                          onChange={(e) =>
                            update(item.product.id, {
                              modifierIds: e.target.checked
                                ? [...item.modifierIds, m.id]
                                : item.modifierIds.filter((id) => id !== m.id),
                            })
                          }
                        />{" "}
                        {m.name} (+{money(m.priceMinor)})
                      </label>
                    ))}
                </div>
                <span>
                  <button
                    className="icon-button"
                    onClick={() =>
                      update(item.product.id, {
                        quantity: Math.max(1, item.quantity - 1),
                      })
                    }
                  >
                    −
                  </button>{" "}
                  {item.quantity}{" "}
                  <button
                    className="icon-button"
                    onClick={() =>
                      update(item.product.id, { quantity: item.quantity + 1 })
                    }
                  >
                    +
                  </button>{" "}
                  <button
                    className="text-link"
                    onClick={() =>
                      setCart((items) =>
                        items.filter((i) => i.product.id !== item.product.id),
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
            <strong>{money(quote.data?.subtotalMinor ?? 0)}</strong>
          </div>
          <div className="row">
            <span>Tax</span>
            <strong>{money(quote.data?.taxMinor ?? 0)}</strong>
          </div>
          <div className="row">
            <strong>Total</strong>
            <strong>{money(total)}</strong>
          </div>
          <Input
            label="Card tender (PKR)"
            value={cardTender}
            onChange={(e) => setCardTender(e.target.value)}
            inputMode="decimal"
          />
          <p className="muted">
            Cash tender: {money(Math.max(0, cash))} · Change is calculated by
            the server.
          </p>
          <Button
            disabled={!canPay}
            onClick={() => {
              const command = checkoutCommand ?? {
                key: crypto.randomUUID(),
                body: {
                  branchId,
                  registerId,
                  orderType: "TAKEAWAY",
                  items: cart.map((i) => ({
                    productId: i.product.id,
                    variantId: i.variantId,
                    quantity: i.quantity,
                    modifiers: i.modifierIds.map((id) => ({ id })),
                  })),
                  payments: [
                    { method: "CASH", amountMinor: cash },
                    ...(card > 0
                      ? [{ method: "MANUAL_CARD", amountMinor: card }]
                      : []),
                  ].filter((payment) => payment.amountMinor > 0),
                },
              };
              setCheckoutCommand(command);
              sale.mutate(command);
            }}
          >
            {sale.isPending
              ? "Processing…"
              : checkoutCommand
                ? "Retry checkout"
                : "Complete sale"}
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
                <span>{money(product.prices[0]?.priceMinor ?? 0)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
