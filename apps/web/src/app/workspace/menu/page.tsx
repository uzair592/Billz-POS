"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Notice } from "../../../components/ui";
import { api } from "../../../lib/api";

type Branch = { id: string; name: string };
type Category = { id: string; name: string };

export default function MenuPage() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [tax, setTax] = useState("0");
  const [message, setMessage] = useState("");
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => api<Branch[]>("/branches"),
  });
  const categories = useQuery({
    queryKey: ["pos-categories"],
    queryFn: () => api<Category[]>("/pos/categories"),
  });
  const category = useMutation({
    mutationFn: () =>
      api<Category>("/pos/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      setName("");
      client.invalidateQueries({ queryKey: ["pos-categories"] });
      setMessage("Category created.");
    },
    onError: (e: Error) => setMessage(e.message),
  });
  const product = useMutation({
    mutationFn: () =>
      api("/pos/products", {
        method: "POST",
        body: JSON.stringify({
          name,
          categoryId: categoryId || undefined,
          taxRateBps: Number(tax) || 0,
          prices:
            branches.data?.map((b) => ({
              branchId: b.id,
              priceMinor: Number(price) || 0,
            })) ?? [],
        }),
      }),
    onSuccess: () => {
      setName("");
      setPrice("");
      setMessage("Product created for every active branch.");
    },
    onError: (e: Error) => setMessage(e.message),
  });
  return (
    <>
      <header className="topbar">
        <div className="page-title">
          <h1>Menu management</h1>
          <p>Categories, branch prices and tax rates</p>
        </div>
      </header>
      {message && (
        <Notice
          tone={
            message.endsWith("created.") || message.startsWith("Product")
              ? "success"
              : "error"
          }
        >
          {message}
        </Notice>
      )}
      <div className="grid">
        <Card>
          <h2>New category</h2>
          <Input
            label="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            disabled={!name || category.isPending}
            onClick={() => category.mutate()}
          >
            Create category
          </Button>
        </Card>
        <Card>
          <h2>New product</h2>
          <Input
            label="Product name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="label">Category</label>
          <select
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">No category</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input
            label="Branch price (minor units)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="numeric"
          />
          <Input
            label="Tax rate (basis points)"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            inputMode="numeric"
          />
          <Button
            disabled={
              !name || !price || !branches.data?.length || product.isPending
            }
            onClick={() => product.mutate()}
          >
            Create product
          </Button>
        </Card>
      </div>
    </>
  );
}
