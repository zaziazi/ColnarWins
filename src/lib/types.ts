/**
 * Hand-written domain types.
 *
 * Once your Supabase project exists, run `npm run db:types` to generate
 * `database.types.ts` from the real schema and narrow these against it.
 * Keeping a hand-written layer means the UI never depends on generated
 * column names directly.
 */

export type OrderStatus =
  | "draft"
  | "confirmed"
  | "planned"
  | "delivered"
  | "invoiced"
  | "cancelled";

export type OrderSource = "phone" | "email" | "standing" | "field" | "manual" | "webshop";

export interface Customer {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  deliveryRegion: string | null;
  deliveryNotes: string | null;
  paymentTermsDays: number;
  /** Open balance in EUR. Drives the overdue warning on the order form. */
  openBalance: number;
  /** Days past due of the oldest unpaid invoice. 0 when nothing is overdue. */
  daysOverdue: number;
  creditHold: boolean;
}

export interface Product {
  id: string;
  name: string;
  vintage: number | null;
  volumeL: number | null;
  unitPriceNet: number;
  vatRate: number;
  caseSize: number;
}

export interface StandingOrderLine {
  productId: string;
  quantity: number;
}

export interface StandingOrder {
  customerId: string;
  intervalDays: number | null;
  lastOrderedAt: string | null;
  lines: StandingOrderLine[];
}

export interface OrderListItem {
  id: string;
  orderNumber: number;
  customerName: string;
  status: OrderStatus;
  source: OrderSource;
  deliveryDate: string | null;
  totalGross: number;
  lineSummary: string;
  createdAt: string;
}
