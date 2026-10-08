
/*
# PSH Store Management System - Enhancement Migration v2

## Overview
Adds new fields across all transaction tables to support:
- Condition tracking (New/Used) for donations, issues, and returns
- Beneficiary information on issue slips
- Branch linkage on purchases
- Issue reference on returns
- Category linkage on donations and purchases

## Changes

### purchases
- Add branch_id (optional branch this purchase is for)
- Add category_id (product category for quick filtering)

### donations
- Add phone_number (donor contact)
- Add cnic (donor CNIC, optional)
- Add condition: 'new' | 'used' (physical condition of donated items)
- Add category_id (for filtering)

### issue_slips
- Add beneficiary_name (person receiving items)
- Add beneficiary_cnic (optional CNIC)
- Add approved_by (approving authority)

### issue_items
- Add condition: 'new' | 'used' (which stock pool to draw from)

### returns
- Add issue_slip_id (reference to original issue, optional)
- Add condition: 'new' | 'used' (condition of returned items)
- Add returned_by (name of person returning)

## Security
- No new tables, only column additions
- Existing RLS policies remain unchanged
*/

-- purchases enhancements
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE SET NULL;

-- donations enhancements
ALTER TABLE donations ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS cnic text;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'new' CHECK (condition IN ('new','used'));
ALTER TABLE donations ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE SET NULL;

-- issue_slips enhancements
ALTER TABLE issue_slips ADD COLUMN IF NOT EXISTS beneficiary_name text;
ALTER TABLE issue_slips ADD COLUMN IF NOT EXISTS beneficiary_cnic text;
ALTER TABLE issue_slips ADD COLUMN IF NOT EXISTS approved_by text;

-- issue_items enhancements
ALTER TABLE issue_items ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'new' CHECK (condition IN ('new','used'));

-- returns enhancements
ALTER TABLE returns ADD COLUMN IF NOT EXISTS issue_slip_id uuid REFERENCES issue_slips(id) ON DELETE SET NULL;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'new' CHECK (condition IN ('new','used'));
ALTER TABLE returns ADD COLUMN IF NOT EXISTS returned_by text;

-- Sync existing issue_items.condition with item_type
-- (old 'donation' item_type maps to 'used', 'new' maps to 'new')
UPDATE issue_items SET condition = CASE WHEN item_type = 'donation' THEN 'used' ELSE 'new' END
WHERE condition = 'new';

-- Sync existing returns.condition with item_type
UPDATE returns SET condition = CASE WHEN item_type = 'donation' THEN 'used' ELSE 'new' END
WHERE condition = 'new';
