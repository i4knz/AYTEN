export const PAYMENT_TONES = {
  pending: "warning",
  awaiting_transfer: "warning",
  paid: "success",
  partially_refunded: "neutral",
  refunded: "neutral",
  failed: "danger",
  voided: "neutral",
} as const;

export const FULFILLMENT_TONES = {
  unfulfilled: "info",
  processing: "warning",
  ready: "warning",
  shipped: "info",
  delivered: "success",
  returned: "neutral",
  cancelled: "neutral",
} as const;
