"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Notice } from "../../../components/ui";
import { api } from "../../../lib/api";

type Branch = { id: string; name: string };
type Category = { id: string; name: string };

export default function MenuPage() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [productName, setProductName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [tax, setTax] = useState("0");
  const [modifierName, setModifierName] = useState("");
  const [modifierPrice, setModifierPrice] = useState("0");
  const [variantName, setVariantName] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [message, setMessage] = useState("");
  const categoryInput = useRef<HTMLInputElement>(null);
  const productInput = useRef<HTMLInputElement>(null);
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
        body: JSON.stringify({ name: categoryInput.current?.value || name }),
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
          name: productInput.current?.value || productName,
          categoryId: categoryId || undefined,
          taxRateBps: Number(tax) || 0,
          prices:
            branches.data?.map((b) => ({
              branchId: b.id,
              priceMinor: Math.round((Number(price) || 0) * 100),
            })) ?? [],
          modifierConfig: modifierName
            ? [
                {
                  id: modifierName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                  name: modifierName,
                  priceMinor: Math.round((Number(modifierPrice) || 0) * 100),
                  active: true,
                },
              ]
            : [],
          variants: variantName
            ? [
                {
                  name: variantName,
                  priceMinor: Math.round((Number(variantPrice) || 0) * 100),
                },
              ]
            : [],
        }),
      }),
    onSuccess: () => {
      setProductName("");
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
            ref={categoryInput}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            disabled={category.isPending}
            onClick={() => category.mutate()}
          >
            Create category
          </Button>
        </Card>
        <Card>
          <h2>New product</h2>
          <Input
            label="Product name"
            value={productName}
            ref={productInput}
            onChange={(e) => setProductName(e.target.value)}
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
            label="Branch price (PKR)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
          />
          <Input
            label="Modifier name (optional)"
            value={modifierName}
            onChange={(e) => setModifierName(e.target.value)}
          />
          <Input
            label="Modifier price (PKR)"
            value={modifierPrice}
            onChange={(e) => setModifierPrice(e.target.value)}
            inputMode="decimal"
          />
          <Input
            label="Variant name (optional)"
            value={variantName}
            onChange={(e) => setVariantName(e.target.value)}
          />
          <Input
            label="Variant price (PKR)"
            value={variantPrice}
            onChange={(e) => setVariantPrice(e.target.value)}
            inputMode="decimal"
          />
          <Input
            label="Tax rate (basis points)"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            inputMode="numeric"
          />
          <Button
            disabled={!price || !branches.data?.length || product.isPending}
            onClick={() => product.mutate()}
          >
            Create product
          </Button>
        </Card>
      </div>
    </>
  );
}
