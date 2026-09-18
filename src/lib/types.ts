export type PaymentMethod = "cash" | "transfer" | "card";
export type SaleStatus = "completed" | "refunded" | "void";
export type SyncState = "pending" | "synced";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  costPrice: number;
  stockQty: number;
  lowStockThreshold: number;
  barcode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncState: SyncState;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string | null;
  name: string;
  sku: string;
  unitPrice: number;
  costPrice: number;
  quantity: number;
  lineTotal: number;
  createdAt: string;
  syncState: SyncState;
}

export interface Sale {
  id: string;
  receiptNo: string;
  soldAt: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  changeDue: number;
  customerName: string;
  customerPhone: string;
  note: string;
  cashierId: string | null;
  cashierName: string;
  deviceId: string;
  status: SaleStatus;
  createdAt: string;
  updatedAt: string;
  syncState: SyncState;
}

export interface StockMovement {
  id: string;
  productId: string;
  changeQty: number;
  reason: "sale" | "restock" | "adjustment" | "initial" | "refund";
  referenceId: string | null;
  note: string;
  createdAt: string;
  syncState: SyncState;
}

export interface AppSetting {
  key: string;
  value: string;
}

export interface CartLine {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  costPrice: number;
  quantity: number;
  stockQty: number;
}
