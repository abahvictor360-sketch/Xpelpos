export type PaymentMethod = "cash" | "transfer" | "card";
export type SaleStatus = "completed" | "refunded" | "void";
export type SyncState = "pending" | "synced";
/** How a line is sold: single pieces, or whole cartons of `packSize` pieces. */
export type SaleUnit = "pcs" | "carton";

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
  /** Pieces in one carton; 0 or unset means the product is not handled in cartons yet. */
  unitsPerCarton?: number;
  /** Price of a whole carton; 0 or unset means pieces × unit price. */
  cartonPrice?: number;
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
  /** Price of one `unit` — a piece, or a whole carton. */
  unitPrice: number;
  /** Cost of a single piece, whatever the line was sold in. */
  costPrice: number;
  /** How many `unit`s were sold; stock moves by quantity × packSize pieces. */
  quantity: number;
  lineTotal: number;
  /** Unset on sales made before cartons existed, which were all pieces. */
  unit?: SaleUnit;
  /** Pieces per unit sold: 1 for pieces, the carton size for cartons. */
  packSize?: number;
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
  /** Short human-readable code (XC-0001) that tells apart two same-named customers. */
  code: string;
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
  reason: "sale" | "restock" | "adjustment" | "initial" | "refund" | "transfer-in" | "transfer-out";
  referenceId: string | null;
  note: string;
  createdAt: string;
  syncState: SyncState;
}

export type TransferDirection = "in" | "out";

/** Stock moving between the warehouse and this till. */
export interface Transfer {
  id: string;
  reference: string;
  direction: TransferDirection;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  party: string;
  /** Who handed the stock over — warehouse staff on the way in, till staff on the way out. */
  releasedBy: string;
  /** Who took delivery of it — till staff on the way in, the collector on the way out. */
  receivedBy: string;
  note: string;
  staffName: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncState: SyncState;
}

export type ActivityKind =
  | "sale"
  | "refund"
  | "void"
  | "transfer-in"
  | "transfer-out"
  | "product"
  | "stock"
  | "customer"
  | "shift"
  | "promotion"
  | "invoice"
  | "system";

/** One line in the running record of what happened on this till. */
export interface Activity {
  id: string;
  kind: ActivityKind;
  message: string;
  detail: string;
  amount: number | null;
  referenceId: string | null;
  staffName: string;
  deviceId: string;
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
  /** Price of one `unit` — a piece, or a whole carton. */
  unitPrice: number;
  /** Cost of a single piece. */
  costPrice: number;
  quantity: number;
  /** Stock on hand, in pieces. */
  stockQty: number;
  /** Unset on baskets saved before cartons existed: pieces. */
  unit?: SaleUnit;
  /** Pieces per unit: 1 for pieces, the carton size for cartons. */
  packSize?: number;
}

export type InvoiceStatus = "awaiting_approval" | "rejected" | "ready" | "sent" | "paid" | "cancelled";

export interface InvoiceLine {
  productId: string | null;
  name: string;
  sku: string;
  /** Price of one `unit` — a piece, or a whole carton. */
  unitPrice: number;
  quantity: number;
  unit: SaleUnit;
  packSize: number;
  lineTotal: number;
}

/** A bank account a customer can be asked to pay into. */
export interface PaymentAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

/**
 * A bill sent to a customer to pay by transfer. When the payment account is not
 * in Xpel's name the admin must approve it by email first; until then the
 * invoice is held at "awaiting_approval" and cannot be sent.
 */
export interface Invoice extends PaymentAccount {
  id: string;
  invoiceNo: string;
  status: InvoiceStatus;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  items: InvoiceLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes: string;
  issuedAt: string;
  /** yyyy-mm-dd, or "" for none. */
  dueDate: string;
  needsApproval: boolean;
  /** The account (see accountKey) the admin approved, or null. */
  approvedAccount: string | null;
  approvedAt: string | null;
  approvalRequestedAt: string | null;
  sentAt: string | null;
  paidAt: string | null;
  paidAmount: number;
  paymentReference: string;
  createdBy: string;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncState: SyncState;
}
