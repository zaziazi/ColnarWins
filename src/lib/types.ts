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

export type StopStatus = "pending" | "arrived" | "completed" | "failed";

export interface DriverStopLine {
  productId: string;
  productName: string;
  quantityOrdered: number;
  unitPriceNet: number;
  vatRate: number;
}

export interface DriverStop {
  id: string;
  orderId: string;
  orderNumber: number;
  sequence: number;
  customerName: string;
  address: string | null;
  city: string | null;
  deliveryNotes: string | null;
  totalGross: number;
  status: StopStatus;
  failReason: string | null;
  lines: DriverStopLine[];
}

export interface DriverRoute {
  id: string;
  vehicle: string;
  status: RouteStatus;
  stops: DriverStop[];
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

export type VesselCategory = "cisterne" | "inox" | "sodi_225" | "sodi_500";

export interface Vessel {
  id: string;
  name: string;
  category: VesselCategory;
  capacityL: number;
  active: boolean;
  /** The active wine lot currently sitting in this vessel, if any. */
  activeLotId: string | null;
  activeLotNumber: string | null;
  activeLotName: string | null;
  activeLotVolumeL: number | null;
}

export type WineStage = "grozdje" | "vrenje" | "vino";
export type WineLotStatus = "active" | "bottled" | "merged";

export interface WineLot {
  id: string;
  lotNumber: string;
  name: string;
  stage: WineStage;
  status: WineLotStatus;
  vesselId: string | null;
  vesselName: string | null;
  volumeL: number;
  productId: string | null;
  productName: string | null;
}

export type WineLotEventType =
  | "harvest_intake"
  | "transfer"
  | "blend_in"
  | "blend_retired"
  | "stage_change"
  | "name_change"
  | "reading"
  | "note"
  | "bottling"
  | "adjustment"
  | "addition";

export interface WineLotEvent {
  id: string;
  eventType: WineLotEventType;
  fromVesselName: string | null;
  toVesselName: string | null;
  volumeL: number | null;
  sugarGl: number | null;
  ph: number | null;
  so2: number | null;
  malicAcid: number | null;
  tartaricAcid: number | null;
  lacticAcid: number | null;
  totalAcid: number | null;
  volatileAcid: number | null;
  co2: number | null;
  alcohol: number | null;
  density: number | null;
  yan: number | null;
  additiveName: string | null;
  amount: number | null;
  unit: string | null;
  relatedLotNumber: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  editedAt: string | null;
}
