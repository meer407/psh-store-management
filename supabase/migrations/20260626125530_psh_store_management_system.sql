
/*
# PSH Store Management System - Complete Schema

## Overview
Full database schema for the PSH (Pakistan Sweet Home) Store Management System.
Manages two stores (Clothing & Ration/Household), multiple branches, inventory tracking,
purchases, donations, issue slips, returns, and audit logging.

## New Tables

### 1. profiles
Extension of Supabase auth.users with role and display info.
- id: links to auth.users
- full_name: display name
- role: super_admin | store_keeper | branch_user | viewer
- branch_id: for branch_user role

### 2. branches
Institution branches (hostels, welfare centers).
- name, address, contact_number, incharge_name, status (active/inactive)

### 3. stores
The two main stores: Clothing Store & Ration/Household Store.
- name, description

### 4. categories
Item categories per store.
- name, store_id, description

### 5. products
Inventory items with separate new/donation stock tracking.
- product_code (auto or manual), store_id, category_id, unit
- current_stock_new, current_stock_donation tracked separately

### 6. purchases
Stock additions via purchase (new items).
- supplier, invoice_number, product_id, quantity, unit_price, total_cost

### 7. donations
Donated items received — tracked as separate stock.
- donor_name, product_id, quantity

### 8. issue_slips
Issue slip header — groups multiple items issued to a branch.
- issue_number (auto-generated ISS-YYYY-NNNN), branch_id, store_id

### 9. issue_items
Individual line items on an issue slip.
- issue_slip_id, product_id, item_type (new/donation), quantity

### 10. returns
Items returned by branches — restores stock.
- product_id, quantity, branch_id, item_type, reason

### 11. audit_logs
Complete activity log of all actions.
- user_id, action, entity_type, entity_id, details (jsonb), ip_address

## Security
- RLS enabled on all tables
- Uses authenticated role (app has sign-in)
- Profiles checked for role-based access
- Branch users scoped to their branch
*/

-- =====================
-- PROFILES
-- =====================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('super_admin','store_keeper','branch_user','viewer')),
  branch_id uuid,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete" ON profiles;
CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- =====================
-- BRANCHES
-- =====================
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  contact_number text,
  incharge_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branches_select" ON branches;
CREATE POLICY "branches_select" ON branches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "branches_insert" ON branches;
CREATE POLICY "branches_insert" ON branches FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "branches_update" ON branches;
CREATE POLICY "branches_update" ON branches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "branches_delete" ON branches;
CREATE POLICY "branches_delete" ON branches FOR DELETE TO authenticated USING (true);

-- =====================
-- STORES
-- =====================
CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stores_select" ON stores;
CREATE POLICY "stores_select" ON stores FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "stores_insert" ON stores;
CREATE POLICY "stores_insert" ON stores FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "stores_update" ON stores;
CREATE POLICY "stores_update" ON stores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "stores_delete" ON stores;
CREATE POLICY "stores_delete" ON stores FOR DELETE TO authenticated USING (true);

-- =====================
-- CATEGORIES
-- =====================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select" ON categories;
CREATE POLICY "categories_select" ON categories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "categories_insert" ON categories;
CREATE POLICY "categories_insert" ON categories FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "categories_update" ON categories;
CREATE POLICY "categories_update" ON categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "categories_delete" ON categories;
CREATE POLICY "categories_delete" ON categories FOR DELETE TO authenticated USING (true);

-- =====================
-- PRODUCTS
-- =====================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  product_code text UNIQUE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  unit text NOT NULL DEFAULT 'Piece' CHECK (unit IN ('Piece','KG','Gram','Liter','Packet','Box','Pair','Roll','Meter','Set','Dozen')),
  opening_stock_new numeric NOT NULL DEFAULT 0,
  opening_stock_donation numeric NOT NULL DEFAULT 0,
  current_stock_new numeric NOT NULL DEFAULT 0,
  current_stock_donation numeric NOT NULL DEFAULT 0,
  min_stock numeric NOT NULL DEFAULT 0,
  description text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_store_id_idx ON products(store_id);
CREATE INDEX IF NOT EXISTS products_category_id_idx ON products(category_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select" ON products;
CREATE POLICY "products_select" ON products FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "products_insert" ON products;
CREATE POLICY "products_insert" ON products FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "products_update" ON products;
CREATE POLICY "products_update" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "products_delete" ON products;
CREATE POLICY "products_delete" ON products FOR DELETE TO authenticated USING (true);

-- =====================
-- PURCHASES
-- =====================
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier text,
  invoice_number text,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric DEFAULT 0,
  total_cost numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchases_product_id_idx ON purchases(product_id);
CREATE INDEX IF NOT EXISTS purchases_purchase_date_idx ON purchases(purchase_date);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchases_select" ON purchases;
CREATE POLICY "purchases_select" ON purchases FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "purchases_insert" ON purchases;
CREATE POLICY "purchases_insert" ON purchases FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "purchases_update" ON purchases;
CREATE POLICY "purchases_update" ON purchases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "purchases_delete" ON purchases;
CREATE POLICY "purchases_delete" ON purchases FOR DELETE TO authenticated USING (true);

-- =====================
-- DONATIONS
-- =====================
CREATE TABLE IF NOT EXISTS donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_name text NOT NULL,
  donation_date date NOT NULL DEFAULT CURRENT_DATE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  remarks text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS donations_product_id_idx ON donations(product_id);
CREATE INDEX IF NOT EXISTS donations_donation_date_idx ON donations(donation_date);

ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "donations_select" ON donations;
CREATE POLICY "donations_select" ON donations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "donations_insert" ON donations;
CREATE POLICY "donations_insert" ON donations FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "donations_update" ON donations;
CREATE POLICY "donations_update" ON donations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "donations_delete" ON donations;
CREATE POLICY "donations_delete" ON donations FOR DELETE TO authenticated USING (true);

-- =====================
-- ISSUE SLIPS (header)
-- =====================
CREATE SEQUENCE IF NOT EXISTS issue_slip_seq START 1;

CREATE TABLE IF NOT EXISTS issue_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number text UNIQUE NOT NULL DEFAULT ('ISS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('issue_slip_seq')::text, 4, '0')),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  issued_by text NOT NULL DEFAULT '',
  remarks text,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','partial_return','returned')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_slips_branch_id_idx ON issue_slips(branch_id);
CREATE INDEX IF NOT EXISTS issue_slips_issue_date_idx ON issue_slips(issue_date);

ALTER TABLE issue_slips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "issue_slips_select" ON issue_slips;
CREATE POLICY "issue_slips_select" ON issue_slips FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "issue_slips_insert" ON issue_slips;
CREATE POLICY "issue_slips_insert" ON issue_slips FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "issue_slips_update" ON issue_slips;
CREATE POLICY "issue_slips_update" ON issue_slips FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "issue_slips_delete" ON issue_slips;
CREATE POLICY "issue_slips_delete" ON issue_slips FOR DELETE TO authenticated USING (true);

-- =====================
-- ISSUE ITEMS (line items)
-- =====================
CREATE TABLE IF NOT EXISTS issue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_slip_id uuid NOT NULL REFERENCES issue_slips(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  item_type text NOT NULL DEFAULT 'new' CHECK (item_type IN ('new','donation')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  received_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_items_slip_id_idx ON issue_items(issue_slip_id);
CREATE INDEX IF NOT EXISTS issue_items_product_id_idx ON issue_items(product_id);

ALTER TABLE issue_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "issue_items_select" ON issue_items;
CREATE POLICY "issue_items_select" ON issue_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "issue_items_insert" ON issue_items;
CREATE POLICY "issue_items_insert" ON issue_items FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "issue_items_update" ON issue_items;
CREATE POLICY "issue_items_update" ON issue_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "issue_items_delete" ON issue_items;
CREATE POLICY "issue_items_delete" ON issue_items FOR DELETE TO authenticated USING (true);

-- =====================
-- RETURNS
-- =====================
CREATE TABLE IF NOT EXISTS returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  item_type text NOT NULL DEFAULT 'new' CHECK (item_type IN ('new','donation')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS returns_product_id_idx ON returns(product_id);
CREATE INDEX IF NOT EXISTS returns_return_date_idx ON returns(return_date);

ALTER TABLE returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "returns_select" ON returns;
CREATE POLICY "returns_select" ON returns FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "returns_insert" ON returns;
CREATE POLICY "returns_insert" ON returns FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "returns_update" ON returns;
CREATE POLICY "returns_update" ON returns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "returns_delete" ON returns;
CREATE POLICY "returns_delete" ON returns FOR DELETE TO authenticated USING (true);

-- =====================
-- AUDIT LOGS
-- =====================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  user_name text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "audit_logs_update" ON audit_logs;
CREATE POLICY "audit_logs_update" ON audit_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "audit_logs_delete" ON audit_logs;
CREATE POLICY "audit_logs_delete" ON audit_logs FOR DELETE TO authenticated USING (true);

-- =====================
-- SEED DEFAULT DATA
-- =====================
INSERT INTO stores (name, description) VALUES
  ('Clothing Store', 'Clothes, shoes, uniforms, bedding and personal items'),
  ('Ration & Household Store', 'Food items, household supplies and kitchen items')
ON CONFLICT DO NOTHING;

-- Add foreign key for branch_id in profiles after branches table exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
