import type { Customer, OrderListItem, Product, StandingOrder } from "./types";

/**
 * DEMO MODE
 *
 * When the Supabase environment variables are missing, the app boots against
 * this data instead of a database. That means `npm install && npm run dev`
 * shows a working interface before you have created anything in Supabase —
 * which is the difference between a repo you can evaluate and one you cannot.
 *
 * Delete this file once real data is flowing.
 */
export const isDemoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export const demoProducts: Product[] = [
  { id: "p-reb", name: "Rebula",      vintage: 2023, volumeL: 0.75, unitPriceNet: 8.5,  vatRate: 0.22, caseSize: 6 },
  { id: "p-mal", name: "Malvazija",   vintage: 2023, volumeL: 0.75, unitPriceNet: 9.2,  vatRate: 0.22, caseSize: 6 },
  { id: "p-sav", name: "Sauvignon",   vintage: 2022, volumeL: 0.75, unitPriceNet: 11,   vatRate: 0.22, caseSize: 6 },
  { id: "p-zel", name: "Zelen",       vintage: 2023, volumeL: 0.75, unitPriceNet: 9.8,  vatRate: 0.22, caseSize: 6 },
  { id: "p-mer", name: "Merlot",      vintage: 2021, volumeL: 0.75, unitPriceNet: 12.5, vatRate: 0.22, caseSize: 6 },
  { id: "p-ref", name: "Refo\u0161k",       vintage: 2022, volumeL: 0.75, unitPriceNet: 10,   vatRate: 0.22, caseSize: 6 },
  { id: "p-pen", name: "Penina Brut", vintage: 2020, volumeL: 0.75, unitPriceNet: 16,   vatRate: 0.22, caseSize: 6 },
];

export const demoCustomers: Customer[] = [
  { id: "c-1", name: "Gostilna Pri Lojzetu", city: "Ajdov\u0161\u010dina", address: "Vipavska cesta 12", deliveryRegion: "Primorska", deliveryNotes: null, paymentTermsDays: 30, openBalance: 0, daysOverdue: 0, creditHold: false },
  { id: "c-2", name: "Restavracija Strelec",  city: "Ljubljana",   address: "Grajska planota 1",  deliveryRegion: "Ljubljana", deliveryNotes: "vhod zadaj", paymentTermsDays: 30, openBalance: 750, daysOverdue: 3, creditHold: false },
  { id: "c-3", name: "Hotel Sabotin",         city: "Solkan",      address: "Cesta IX. korpusa 35", deliveryRegion: "Primorska", deliveryNotes: null, paymentTermsDays: 30, openBalance: 0, daysOverdue: 0, creditHold: false },
  { id: "c-4", name: "Vinoteka Brda",         city: "Dobrovo",     address: "Trg 25. maja 4",     deliveryRegion: "Primorska", deliveryNotes: null, paymentTermsDays: 30, openBalance: 980, daysOverdue: 0, creditHold: false },
  { id: "c-5", name: "Picerija Foculus",      city: "Ljubljana",   address: "Gregor\u010di\u010deva 3", deliveryRegion: "Ljubljana", deliveryNotes: "dostava dopoldne", paymentTermsDays: 30, openBalance: 1840, daysOverdue: 47, creditHold: false },
  { id: "c-6", name: "Bar Neboti\u010dnik",        city: "Ljubljana",   address: "\u0160tefanova 1",       deliveryRegion: "Ljubljana", deliveryNotes: "do 10h", paymentTermsDays: 30, openBalance: 960, daysOverdue: 36, creditHold: false },
  { id: "c-7", name: "Gostilna \u0160krlj",        city: "Branik",      address: "Branik 17",          deliveryRegion: "Primorska", deliveryNotes: "prevzame Peter", paymentTermsDays: 30, openBalance: 1210, daysOverdue: 41, creditHold: true },
];

export const demoStandingOrders: StandingOrder[] = [
  { customerId: "c-1", intervalDays: 7,  lastOrderedAt: "2026-08-07", lines: [{ productId: "p-reb", quantity: 12 }, { productId: "p-mal", quantity: 6 }, { productId: "p-mer", quantity: 6 }] },
  { customerId: "c-2", intervalDays: 7,  lastOrderedAt: "2026-08-06", lines: [{ productId: "p-reb", quantity: 18 }, { productId: "p-sav", quantity: 12 }, { productId: "p-pen", quantity: 6 }] },
  { customerId: "c-3", intervalDays: 14, lastOrderedAt: "2026-08-01", lines: [{ productId: "p-mal", quantity: 24 }, { productId: "p-ref", quantity: 12 }, { productId: "p-pen", quantity: 12 }] },
  { customerId: "c-4", intervalDays: 14, lastOrderedAt: "2026-08-04", lines: [{ productId: "p-reb", quantity: 24 }, { productId: "p-mer", quantity: 12 }, { productId: "p-zel", quantity: 6 }] },
  { customerId: "c-5", intervalDays: 14, lastOrderedAt: "2026-07-24", lines: [{ productId: "p-ref", quantity: 18 }, { productId: "p-mer", quantity: 12 }] },
  { customerId: "c-6", intervalDays: 7,  lastOrderedAt: "2026-08-05", lines: [{ productId: "p-pen", quantity: 18 }, { productId: "p-sav", quantity: 6 }] },
  { customerId: "c-7", intervalDays: 7,  lastOrderedAt: "2026-07-03", lines: [{ productId: "p-zel", quantity: 12 }, { productId: "p-mal", quantity: 12 }, { productId: "p-mer", quantity: 6 }] },
];

export const demoOrders: OrderListItem[] = [
  { id: "o-1", orderNumber: 1184, customerName: "Hotel Sabotin",         status: "draft",     source: "email",  deliveryDate: "2026-08-19", totalGross: 512.4,  lineSummary: "24\u00d7 Malvazija \u00b7 12\u00d7 Refo\u0161k \u00b7 6\u00d7 Penina Brut", createdAt: "2026-08-14T08:12:00Z", createdByName: null, assignedDriverId: null, routedDriverName: null },
  { id: "o-2", orderNumber: 1183, customerName: "Picerija Foculus",      status: "draft",     source: "email",  deliveryDate: "2026-08-19", totalGross: 475.2,  lineSummary: "24\u00d7 Refo\u0161k \u00b7 12\u00d7 Merlot", createdAt: "2026-08-14T09:41:00Z", createdByName: null, assignedDriverId: null, routedDriverName: null },
  { id: "o-3", orderNumber: 1182, customerName: "Gostilna Pri Lojzetu",  status: "confirmed", source: "phone",  deliveryDate: "2026-08-19", totalGross: 280.6,  lineSummary: "12\u00d7 Rebula \u00b7 6\u00d7 Malvazija \u00b7 6\u00d7 Merlot", createdAt: "2026-08-13T14:02:00Z", createdByName: "Marija", assignedDriverId: null, routedDriverName: null },
  { id: "o-4", orderNumber: 1181, customerName: "Restavracija Strelec",  status: "confirmed", source: "phone",  deliveryDate: "2026-08-19", totalGross: 470.0,  lineSummary: "18\u00d7 Rebula \u00b7 12\u00d7 Sauvignon \u00b7 6\u00d7 Penina Brut", createdAt: "2026-08-13T11:20:00Z", createdByName: "Marija", assignedDriverId: null, routedDriverName: null },
  { id: "o-5", orderNumber: 1180, customerName: "Vinoteka Brda",         status: "planned",   source: "standing", deliveryDate: "2026-08-18", totalGross: 522.8, lineSummary: "24\u00d7 Rebula \u00b7 12\u00d7 Merlot \u00b7 6\u00d7 Zelen", createdAt: "2026-08-12T19:00:00Z", createdByName: "Marija", assignedDriverId: null, routedDriverName: null },
  { id: "o-6", orderNumber: 1179, customerName: "Bar Neboti\u010dnik",        status: "delivered", source: "phone",  deliveryDate: "2026-08-13", totalGross: 431.7,  lineSummary: "18\u00d7 Penina Brut \u00b7 6\u00d7 Sauvignon", createdAt: "2026-08-11T10:05:00Z", createdByName: "Marija", assignedDriverId: null, routedDriverName: null },
  { id: "o-7", orderNumber: 1178, customerName: "Hotel Sabotin",         status: "invoiced",  source: "email",  deliveryDate: "2026-08-12", totalGross: 646.5,  lineSummary: "24\u00d7 Malvazija \u00b7 12\u00d7 Refo\u0161k \u00b7 12\u00d7 Penina Brut", createdAt: "2026-08-10T08:30:00Z", createdByName: null, assignedDriverId: null, routedDriverName: null },
];
