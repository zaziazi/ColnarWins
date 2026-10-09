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
  /** Set on orders that need the office to look at them (e.g. new customer from the field). */
  reviewNote?: string | null;
  /** Set once this order is a stop on a route — the route's driver, read-only. */
  routedDriverName: string | null;
  /** Delivery documents e-mail for this order, once the delivery was signed. */
  mail: { status: "queued" | "sent" | "failed" | "no_recipient"; recipient: string | null; error: string | null } | null;
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
  deliveryDate: string | null;
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
  customerEmail: string | null;
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
  /** Products this route needs more of than is in stock. */
  shortages: { productName: string; needed: number; onHand: number }[];
}

export type StaffRole = "office" | "driver" | "sales" | "manager" | "events";

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

// ---------------------------------------------------------------- Prodaja map

export type VenueKind =
  | "restaurant"
  | "bar"
  | "pub"
  | "cafe"
  | "fast_food"
  | "hotel"
  | "guest_house"
  | "wine_shop"
  | "catering"
  | "camping"
  | "other";

export type MapStatus = "client" | "prospect" | "open";

/** One dot on the sales map: a venue, or a customer that no venue is linked to. */
export interface SalesMapPoint {
  source: "venue" | "customer";
  id: string;
  name: string;
  kind: VenueKind;
  lat: number;
  lng: number;
  city: string | null;
  phone: string | null;
  email: string | null;
  status: MapStatus;
  needsReview: boolean;
}

export interface VenueDetail {
  id: string;
  name: string;
  kind: VenueKind;
  lat: number;
  lng: number;
  address: string | null;
  city: string | null;
  postCode: string | null;
  website: string | null;
  openingHours: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  note: string | null;
  cuisine: string | null;
  source: "osm" | "ajpes" | "overture" | "itis" | "manual";
  /** "unverified": the position was worked out from a register address and still needs a human look. */
  locationStatus: "ok" | "unverified";
  /** Registered company data (AJPES), when known. */
  legalName: string | null;
  vatId: string | null;
  representative: string | null;
  revenueEur: number | null;
  employees: number | null;
  ignored: boolean;
  prospectId: string | null;
  /** The customer this venue is linked to, if any. */
  customer: { id: string; name: string; address: string | null; city: string | null } | null;
  matchStatus: "auto" | "confirmed" | null;
  matchScore: number | null;
  matchDistanceM: number | null;
  /** A possible customer match awaiting a decision. */
  suggested: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    score: number | null;
    distanceM: number | null;
  } | null;
  osmUrl: string | null;
}

export interface CustomerPointDetail {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
}

// ------------------------------------------------------------------- Teren (field sales)

export type VisitOutcome = "ordered" | "thinking" | "no_interest" | "not_there";

/** One stop on the salesperson's plan: a venue or customer on a date, planned or already visited. */
export interface PlannedVisit {
  id: string;
  plannedFor: string;
  plannedTime: string | null;
  sortOrder: number;
  venueId: string | null;
  customerId: string | null;
  isCustomer: boolean;
  name: string;
  kind: VenueKind | null;
  address: string | null;
  city: string | null;
  postCode: string | null;
  phone: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
  vatId: string | null;
  legalName: string | null;
  knownContact: string | null;
  visitedAt: string | null;
  outcome: VisitOutcome | null;
  contactName: string | null;
  note: string | null;
  followUpOn: string | null;
  announcedAt: string | null;
  announcedVia: string | null;
  offerToken: string;
  offerOpenCount: number;
  orderId: string | null;
}

export interface FollowUp {
  visitId: string;
  venueId: string | null;
  customerId: string | null;
  name: string;
  city: string | null;
  followUpOn: string;
  note: string | null;
}

export interface CarStockRow {
  productId: string;
  name: string;
  vintage: number | null;
  volumeL: number | null;
  caseSize: number | null;
  cellarQty: number;
  inCar: number;
}

export interface RepMovement {
  id: string;
  kind: "checkout" | "given" | "return";
  quantity: number;
  productName: string;
  venueName: string | null;
  createdAt: string;
}

export interface SalesProduct {
  id: string;
  name: string;
  vintage: number | null;
  volumeL: number | null;
  caseSize: number | null;
  price: number;
  vat: number;
}

// ------------------------------------------------------------------- Društva (group outreach)

export type DrustvoStage =
  | "not_contacted" | "in_sequence" | "replied" | "interested" | "later"
  | "booked" | "visited" | "not_interested" | "unsubscribed" | "bounced";
export type DrustvoTier = "focus" | "fifty_fifty" | "not_chosen";
export type DrustvoIntent =
  | "interested" | "question" | "later" | "not_interested" | "unsubscribe" | "wrong_contact" | "out_of_office" | "other";
export type DrustvoTaskStatus = "new" | "ai_failed" | "awaiting_decision" | "sent" | "calling" | "done" | "dismissed";
export type BookingStatus = "tentative" | "confirmed" | "visited" | "cancelled";

export interface Drustvo {
  id: string;
  name: string;
  type: string | null;
  town: string | null;
  region: string | null;
  tier: DrustvoTier;
  stage: DrustvoStage;
  email: string;
  emailAlt: string | null;
  phone: string | null;
  contactName: string | null;
  website: string | null;
  emailCheck: string | null;
  distanceKm: number | null;
  distanceBand: string | null;
  activityLevel: string | null;
  organizesTrips: string | null;
  activityNote: string | null;
  wave: number | null;
  nextAction: string | null;
  nextActionOn: string | null;
  notes: string | null;
  sourceUrl: string | null;
}

export interface DrustvoMessage {
  id: string;
  direction: "in" | "out";
  fromEmail: string | null;
  subject: string | null;
  body: string | null;
  eventType: string | null;
  uniboxUrl: string | null;
  occurredAt: string | null;
}

export interface ReplyTask {
  id: string;
  kind: "reply" | "call" | "reminder" | "thank_you";
  status: DrustvoTaskStatus;
  intent: DrustvoIntent | null;
  recommendedAction: "email" | "call" | "none" | null;
  summary: string | null;
  reason: string | null;
  urgency: "today" | "this_week" | "low" | null;
  proposedDates: string[] | null;
  draftSubject: string | null;
  draftBody: string | null;
  error: string | null;
  createdAt: string;
  drustvoId: string | null;
  drustvoName: string | null;
  drustvoType: string | null;
  drustvoTown: string | null;
  drustvoDistanceKm: number | null;
  drustvoPhone: string | null;
  fromEmail: string | null;
  subject: string | null;
  body: string | null;
  uniboxUrl: string | null;
}

export interface GroupBooking {
  id: string;
  drustvoId: string;
  drustvoName: string;
  visitDate: string;
  arrivalTime: string | null;
  peoplePlanned: number | null;
  peopleActual: number | null;
  package: string | null;
  pricePerPerson: number | null;
  foodNotes: string | null;
  status: BookingStatus;
  wineSalesEur: number | null;
  orderId: string | null;
  notes: string | null;
}

export interface DrustvaSettings {
  infoSheet: string;
  rules: string;
  maxGroupsPerDay: number;
  hostingWeekdays: number[];
  blackoutDates: string[];
  notifyStaffIds: string[];
}
