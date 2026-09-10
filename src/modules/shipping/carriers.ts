import type { ShippingStatus } from "@prisma/client";
export interface CarrierProvider {
  quote(
    leg: { type: string },
    parcel: { weightGrams: number },
  ): Promise<{ amount: string; currency: string } | null>;
  createShipment(leg: {
    carrierName: string;
  }): Promise<{ manualEntryRequired: boolean }>;
  track(
    trackingNumber: string,
  ): Promise<{ at: Date; status: ShippingStatus; description: string }[]>;
}
/** The MVP makes no carrier API requests. Operators enter confirmed updates. */
export class ManualCarrier implements CarrierProvider {
  async quote() {
    return null;
  }
  async createShipment() {
    return { manualEntryRequired: true };
  }
  async track() {
    return [];
  }
}
