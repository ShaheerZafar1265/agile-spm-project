import { OrderItem } from './order-item.js';

/**
 * Domain representation of an order used for business rules that depend on
 * order type. API, persistence, and seed data continue to use plain records.
 */
export class Order {
  #record;
  #items;

  constructor(record) {
    this.#record = {
      ...record,
      rates: record.rates ? { ...record.rates } : {},
    };
    this.#items = (Array.isArray(record.items) ? record.items : [])
      .map((item) => new OrderItem(item));
  }

  /** Factory keeps callers independent of the concrete order subtype. */
  static fromRecord(record) {
    if (record.type === 'dine-in') return new DineInOrder(record);
    if (record.type === 'online') return new OnlineOrder(record);
    return new Order(record);
  }

  get serviceChargeRate() {
    return 0;
  }

  get rates() {
    return { ...this.#record.rates };
  }

  /** Recalculate money fields in integer cents to avoid floating point drift. */
  recalculateTotals() {
    const toCents = (amount) => Math.round(Number(amount || 0) * 100);
    const fromCents = (cents) => Math.round(cents) / 100;
    const subtotalCents = this.#items.reduce((sum, item) => sum + item.totalCents, 0);
    const discountCents = Math.min(Math.max(0, toCents(this.#record.discount)), subtotalCents);
    const serviceChargeCents = Math.round(subtotalCents * this.serviceChargeRate);
    const taxCents = Math.round((subtotalCents - discountCents) * (this.#record.rates.taxRate || 0));
    const tipCents = Math.max(0, toCents(this.#record.tip));

    this.#record.subtotal = fromCents(subtotalCents);
    this.#record.discount = fromCents(discountCents);
    this.#record.serviceCharge = fromCents(serviceChargeCents);
    this.#record.tax = fromCents(taxCents);
    this.#record.tip = fromCents(tipCents);
    this.#record.total = fromCents(
      Math.max(0, subtotalCents - discountCents + serviceChargeCents + taxCents + tipCents),
    );
    return this;
  }

  /** Return a detached record for legacy APIs and persistence adapters. */
  toRecord() {
    return {
      ...this.#record,
      rates: { ...this.#record.rates },
      items: this.#items.map((item) => item.toRecord()),
    };
  }
}

export class DineInOrder extends Order {
  get serviceChargeRate() {
    return this.rates.serviceChargeRate || 0;
  }
}

export class OnlineOrder extends Order {}

