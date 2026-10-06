export interface DeliveryDocLine {
  name: string;
  ordered: number;
  delivered: number;
  unitNet: number;
  vatRate: number;
  discountPct: number;
}

export interface DeliveryDocData {
  orderNumber: number;
  customer: {
    name: string;
    address: string | null;
    city: string | null;
    postCode: string | null;
    vatId: string | null;
  };
  /** Server-side signing time (delivery_proof.signed_at). */
  signedAt: Date;
  lines: DeliveryDocLine[];
  signerName: string;
  note: string | null;
  signaturePng: Uint8Array | null;
  proofHash: string;
  invoice: {
    number: string;
    issuedOn: string;
    dueDate: string;
    totalNet: number;
    totalGross: number;
  };
}
