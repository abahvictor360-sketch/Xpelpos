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

export type DiscountType = "percent" | "fixed";

export interface Coupon {
  id: string;
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: number;
  minSpend: number;
  /** 0 means no ceiling. Only meaningful for percentage coupons. */
  maxDiscount: number;
  startsAt: string | null;
  endsAt: string | null;
  /** 0 means unlimited redemptions. */
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncState: SyncState;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncState: SyncState;
}

export interface Shift {
  id: string;
  cashierName: string;
  deviceId: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  countedCash: number;
  expectedCash: number;
  variance: number;
  cashTotal: number;
  transferTotal: number;
  cardTotal: number;
  salesCount: number;
  note: string;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  syncState: SyncState;
}

export interface HeldSale {
  id: string;
  label: string;
  lines: CartLine[];
  customerName: string;
  createdAt: string;
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
  couponCode: string;
  customerId: string | null;
  shiftId: string | null;
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
