export type UserRole = 'super_admin' | 'store_keeper' | 'branch_user' | 'viewer';
export type Condition = 'new' | 'used';
export type BranchStatus = 'active' | 'inactive';
export type Unit =
  | 'Piece'
  | 'KG'
  | 'Gram'
  | 'Liter'
  | 'Packet'
  | 'Box'
  | 'Pair'
  | 'Roll'
  | 'Meter'
  | 'Set'
  | 'Dozen';

export type IssueStatus = 'issued' | 'partial_return' | 'returned';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  branch_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  contact_number: string | null;
  incharge_name: string | null;
  status: BranchStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  store_id: string;
  description: string | null;
  created_at: string;
  stores?: Store;
}

export interface Product {
  id: string;
  name: string;
  product_code: string | null;
  barcode: string | null;
  sku: string | null;
  selling_price: number;
  store_id: string;
  category_id: string | null;
  unit: Unit;
  opening_stock_new: number;
  opening_stock_donation: number;
  current_stock_new: number;
  current_stock_donation: number;
  min_stock: number;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  stores?: Store;
  categories?: Category;
  product_variants?: ProductVariant[];
}

export interface ProductVariant {
  id: string;
  product_id: string;
  variant_name: string;
  variant_value: string;
  barcode: string | null;
  sku: string | null;
  current_stock_new: number;
  current_stock_donation: number;
  created_at: string;
  updated_at: string;
}

export interface BranchStock {
  id: string;
  branch_id: string;
  product_id: string;
  variant_id: string | null;
  quantity_new: number;
  quantity_donation: number;
  updated_at: string;
  products?: Product;
  branches?: Branch;
}

export interface StoreStock {
  id: string;
  store_id: string;
  product_id: string;
  variant_id: string | null;
  quantity_new: number;
  quantity_donation: number;
  updated_at: string;
  products?: Product;
  stores?: Store;
}

export type StockTransactionType =
  | 'stock_in'
  | 'stock_out'
  | 'branch_transfer'
  | 'store_issue'
  | 'return'
  | 'purchase'
  | 'adjustment';

export interface StockTransaction {
  id: string;
  transaction_type: StockTransactionType;
  product_id: string;
  variant_id: string | null;
  branch_id: string | null;
  store_id: string | null;
  quantity: number;
  item_type: 'new' | 'donation';
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  products?: Product;
  branches?: Branch;
  stores?: Store;
}

export interface Purchase {
  id: string;
  purchase_date: string;
  supplier: string | null;
  invoice_number: string | null;
  product_id: string;
  variant_id: string | null;
  branch_id: string | null;
  category_id: string | null;
  quantity: number;
  unit_price: number;
  total_cost: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  products?: Product;
  product_variants?: ProductVariant | null;
  branches?: Branch;
  categories?: Category;
}

export interface Donation {
  id: string;
  donor_name: string;
  phone_number: string | null;
  cnic: string | null;
  donation_date: string;
  product_id: string;
  variant_id: string | null;
  category_id: string | null;
  quantity: number;
  condition: Condition;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  products?: Product;
  product_variants?: ProductVariant | null;
  categories?: Category;
}

export interface IssueSlip {
  id: string;
  issue_number: string;
  issue_date: string;
  branch_id: string;
  store_id: string;
  issued_by: string;
  beneficiary_name: string | null;
  beneficiary_cnic: string | null;
  approved_by: string | null;
  remarks: string | null;
  status: IssueStatus;
  created_by: string | null;
  created_at: string;
  branches?: Branch;
  stores?: Store;
  issue_items?: IssueItem[];
}

export interface IssueItem {
  id: string;
  issue_slip_id: string;
  product_id: string;
  variant_id: string | null;
  item_type: string;
  condition: Condition;
  quantity: number;
  received_by: string | null;
  created_at: string;
  products?: Product;
  product_variants?: ProductVariant | null;
}

export interface Return {
  id: string;
  return_date: string;
  product_id: string;
  variant_id: string | null;
  branch_id: string;
  issue_slip_id: string | null;
  item_type: string;
  condition: Condition;
  quantity: number;
  returned_by: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  products?: Product;
  product_variants?: ProductVariant | null;
  branches?: Branch;
  issue_slips?: IssueSlip;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface LedgerEntry {
  date: string;
  type: 'purchase' | 'donation' | 'issue' | 'return' | 'opening';
  reference: string;
  description: string;
  qty_in: number;
  qty_out: number;
  balance_new: number;
  balance_used: number;
  branch: string; // FIXED
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile>;
        Update: Partial<Profile>;
      };
      branches: {
        Row: Branch;
        Insert: Partial<Branch>;
        Update: Partial<Branch>;
      };
      stores: {
        Row: Store;
        Insert: Partial<Store>;
        Update: Partial<Store>;
      };
      categories: {
        Row: Category;
        Insert: Partial<Category>;
        Update: Partial<Category>;
      };
      products: {
        Row: Product;
        Insert: Partial<Product>;
        Update: Partial<Product>;
      };
      purchases: {
        Row: Purchase;
        Insert: Partial<Purchase>;
        Update: Partial<Purchase>;
      };
      donations: {
        Row: Donation;
        Insert: Partial<Donation>;
        Update: Partial<Donation>;
      };
      issue_slips: {
        Row: IssueSlip;
        Insert: Partial<IssueSlip>;
        Update: Partial<IssueSlip>;
      };
      issue_items: {
        Row: IssueItem;
        Insert: Partial<IssueItem>;
        Update: Partial<IssueItem>;
      };
      returns: {
        Row: Return;
        Insert: Partial<Return>;
        Update: Partial<Return>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Partial<AuditLog>;
        Update: Partial<AuditLog>;
      };
      product_variants: {
        Row: ProductVariant;
        Insert: Partial<ProductVariant>;
        Update: Partial<ProductVariant>;
      };
      branch_stock: {
        Row: BranchStock;
        Insert: Partial<BranchStock>;
        Update: Partial<BranchStock>;
      };
      store_stock: {
        Row: StoreStock;
        Insert: Partial<StoreStock>;
        Update: Partial<StoreStock>;
      };
      stock_transactions: {
        Row: StockTransaction;
        Insert: Partial<StockTransaction>;
        Update: Partial<StockTransaction>;
      };
    };

    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};