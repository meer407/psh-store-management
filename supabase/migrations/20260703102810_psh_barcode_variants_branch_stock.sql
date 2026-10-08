/*
# PSH Store Management - Barcode, Variants, Branch/Store Stock Migration

## Overview
Adds barcode/SKU support, product variants (sub-categories), and per-branch/per-store
stock tracking tables. Also adds a selling_price column to products and a barcode column.

## New Tables

### 1. product_variants
Sub-categories / variants for a product (e.g. Shirt -> S/M/L, Toothpaste -> 50g/75g/100g).
- product_id: links to products
- variant_name: e.g. "Small", "50g"
- variant_value: e.g. "S", "50g"
- barcode: unique barcode for this variant
- sku: unique SKU for this variant
- current_stock_new / current_stock_donation: variant-level stock

### 2. branch_stock
Per-branch stock tracking. When stock is issued to a branch, the quantity is recorded here.
- branch_id, product_id, variant_id (optional)
- quantity_new, quantity_donation

### 3. store_stock
Per-store stock tracking (for dedicated store dashboards).
- store_id, product_id, variant_id (optional)
- quantity_new, quantity_donation

## Modified Tables

### products
- Add barcode (text, unique) - barcode for the main product
- Add sku (text, unique) - SKU for the main product
- Add selling_price (numeric, default 0) - selling price (auto from purchase or manual)

## Security
- RLS enabled on all new tables
- Policies allow authenticated users full CRUD (app has sign-in, role enforced in frontend)
*/

-- =====================
-- PRODUCTS: add barcode, sku, selling_price
-- =====================
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price numeric NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_uq ON products(barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_uq ON products(sku) WHERE sku IS NOT NULL;

-- =====================
-- PRODUCT VARIANTS
-- =====================
CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_name text NOT NULL DEFAULT '',
  variant_value text NOT NULL DEFAULT '',
  barcode text,
  sku text,
  current_stock_new numeric NOT NULL DEFAULT 0,
  current_stock_donation numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON product_variants(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_barcode_uq ON product_variants(barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_uq ON product_variants(sku) WHERE sku IS NOT NULL;

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_variants_select" ON product_variants;
CREATE POLICY "product_variants_select" ON product_variants FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "product_variants_insert" ON product_variants;
CREATE POLICY "product_variants_insert" ON product_variants FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "product_variants_update" ON product_variants;
CREATE POLICY "product_variants_update" ON product_variants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "product_variants_delete" ON product_variants;
CREATE POLICY "product_variants_delete" ON product_variants FOR DELETE TO authenticated USING (true);

-- =====================
-- BRANCH STOCK
-- =====================
CREATE TABLE IF NOT EXISTS branch_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity_new numeric NOT NULL DEFAULT 0,
  quantity_donation numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (branch_id, product_id, variant_id)
);

CREATE INDEX IF NOT EXISTS branch_stock_branch_id_idx ON branch_stock(branch_id);
CREATE INDEX IF NOT EXISTS branch_stock_product_id_idx ON branch_stock(product_id);

ALTER TABLE branch_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branch_stock_select" ON branch_stock;
CREATE POLICY "branch_stock_select" ON branch_stock FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "branch_stock_insert" ON branch_stock;
CREATE POLICY "branch_stock_insert" ON branch_stock FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "branch_stock_update" ON branch_stock;
CREATE POLICY "branch_stock_update" ON branch_stock FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "branch_stock_delete" ON branch_stock;
CREATE POLICY "branch_stock_delete" ON branch_stock FOR DELETE TO authenticated USING (true);

-- =====================
-- STORE STOCK
-- =====================
CREATE TABLE IF NOT EXISTS store_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity_new numeric NOT NULL DEFAULT 0,
  quantity_donation numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (store_id, product_id, variant_id)
);

CREATE INDEX IF NOT EXISTS store_stock_store_id_idx ON store_stock(store_id);
CREATE INDEX IF NOT EXISTS store_stock_product_id_idx ON store_stock(product_id);

ALTER TABLE store_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_stock_select" ON store_stock;
CREATE POLICY "store_stock_select" ON store_stock FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "store_stock_insert" ON store_stock;
CREATE POLICY "store_stock_insert" ON store_stock FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "store_stock_update" ON store_stock;
CREATE POLICY "store_stock_update" ON store_stock FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "store_stock_delete" ON store_stock;
CREATE POLICY "store_stock_delete" ON store_stock FOR DELETE TO authenticated USING (true);

-- =====================
-- STOCK TRANSACTIONS (unified history for barcode scan in/out, branch transfers, store issues)
-- =====================
CREATE TABLE IF NOT EXISTS stock_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL CHECK (transaction_type IN ('stock_in','stock_out','branch_transfer','store_issue','return','purchase','adjustment')),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  quantity numeric NOT NULL,
  item_type text NOT NULL DEFAULT 'new' CHECK (item_type IN ('new','donation')),
  reference_type text,
  reference_id text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_transactions_product_id_idx ON stock_transactions(product_id);
CREATE INDEX IF NOT EXISTS stock_transactions_branch_id_idx ON stock_transactions(branch_id);
CREATE INDEX IF NOT EXISTS stock_transactions_store_id_idx ON stock_transactions(store_id);
CREATE INDEX IF NOT EXISTS stock_transactions_created_at_idx ON stock_transactions(created_at DESC);

ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_transactions_select" ON stock_transactions;
CREATE POLICY "stock_transactions_select" ON stock_transactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "stock_transactions_insert" ON stock_transactions;
CREATE POLICY "stock_transactions_insert" ON stock_transactions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "stock_transactions_update" ON stock_transactions;
CREATE POLICY "stock_transactions_update" ON stock_transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "stock_transactions_delete" ON stock_transactions;
CREATE POLICY "stock_transactions_delete" ON stock_transactions FOR DELETE TO authenticated USING (true);
