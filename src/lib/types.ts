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
  createdByName: string | null;
  assignedDriverId: string | null;
  /** Set once this order is a stop on a route — the route's driver, read-only. */
  routedDriverName: string | null;
}

export interface Driver {
  id: string;
  fullName: string;
}

export interface OrderForEdit {
  id: string;
  customerId: string;
  customerName: string;
  status: OrderStatus;
  deliveryDate: string | null;
  note: string;
  lines: StandingOrderLine[];
}

export type RouteStatus = "planned" | "in_progress" | "completed";

export interface UnroutedOrder {
  id: string;
  orderNumber: number;
  customerName: string;
  city: string | null;
  deliveryNotes: string | null;
  totalGross: number;
  lineSummary: string;
}

export interface RouteStop {
  id: string;
  orderId: string;
  orderNumber: number;
  sequence: number;
  customerName: string;
  address: string | null;
  city: string | null;
  deliveryNotes: string | null;
  totalGross: number;
}

export interface LoadingListLine {
  productName: string;
  quantity: number;
}

export interface RouteWithStops {
  id: string;
  vehicle: string;
  driverId: string | null;
  driverName: string | null;
  status: RouteStatus;
  stops: RouteStop[];
  loadingList: LoadingListLine[];
}

export type StaffRole = "office" | "driver" | "sales" | "manager";

export interface CurrentStaff {
  id: string;
  fullName: string;
  role: StaffRole;
}

export interface ReceivablesAgeingBucket {
  bucket: "within_terms" | "overdue_1_30" | "overdue_30_plus";
  invoiceCount: number;
  amount: number;
}

export interface StockLevel {
  productId: string;
  productName: string;
  caseSize: number;
  quantityOnHand: number;
}

export interface StockMovementEntry {
  id: string;
  productName: string;
  movementType: "bottling" | "adjustment";
  quantityDelta: number;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

export type VesselMaterial = "stainless" | "wood";

export interface Vessel {
  id: string;
  name: string;
  material: VesselMaterial;
  capacityL: number;
  currentProductId: string | null;
  currentProductName: string | null;
  currentVolumeL: number;
  active: boolean;
}

export interface BulkMovementEntry {
  id: string;
  vesselName: string;
  productName: string | null;
  movementType: "harvest_intake" | "bottling_out" | "adjustment";
  volumeL: number;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface VesselReading {
  id: string;
  vesselId: string;
  recordedAt: string;
  brix: number | null;
  ph: number | null;
  so2: number | null;
  note: string | null;
  createdByName: string | null;
}
