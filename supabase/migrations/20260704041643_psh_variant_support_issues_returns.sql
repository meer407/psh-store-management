-- Add variant_id to issue_items and returns tables
ALTER TABLE issue_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

-- Add branch_id to profiles if not exists (for branch user assignment)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'branch_id') THEN
    ALTER TABLE profiles ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add issue_slip_id to issue_items for reference
-- Already exists in issue_items as issue_slip_id

-- Enable RLS on product_variants, branch_stock, store_stock, stock_transactions if not already
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for product_variants
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_variants' AND policyname = 'select_own_product_variants') THEN
    CREATE POLICY "select_own_product_variants" ON product_variants FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_variants' AND policyname = 'insert_own_product_variants') THEN
    CREATE POLICY "insert_own_product_variants" ON product_variants FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_variants' AND policyname = 'update_own_product_variants') THEN
    CREATE POLICY "update_own_product_variants" ON product_variants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_variants' AND policyname = 'delete_own_product_variants') THEN
    CREATE POLICY "delete_own_product_variants" ON product_variants FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Policies for branch_stock
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branch_stock' AND policyname = 'select_branch_stock') THEN
    CREATE POLICY "select_branch_stock" ON branch_stock FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branch_stock' AND policyname = 'insert_branch_stock') THEN
    CREATE POLICY "insert_branch_stock" ON branch_stock FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branch_stock' AND policyname = 'update_branch_stock') THEN
    CREATE POLICY "update_branch_stock" ON branch_stock FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branch_stock' AND policyname = 'delete_branch_stock') THEN
    CREATE POLICY "delete_branch_stock" ON branch_stock FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Policies for store_stock
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'store_stock' AND policyname = 'select_store_stock') THEN
    CREATE POLICY "select_store_stock" ON store_stock FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'store_stock' AND policyname = 'insert_store_stock') THEN
    CREATE POLICY "insert_store_stock" ON store_stock FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'store_stock' AND policyname = 'update_store_stock') THEN
    CREATE POLICY "update_store_stock" ON store_stock FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'store_stock' AND policyname = 'delete_store_stock') THEN
    CREATE POLICY "delete_store_stock" ON store_stock FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Policies for stock_transactions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_transactions' AND policyname = 'select_stock_transactions') THEN
    CREATE POLICY "select_stock_transactions" ON stock_transactions FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_transactions' AND policyname = 'insert_stock_transactions') THEN
    CREATE POLICY "insert_stock_transactions" ON stock_transactions FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
