export type CheckoutReadinessInput = {
  signedIn: boolean;
  agreedToRefundPolicy: boolean;
  hasValidTimeZone: boolean;
  signupsClosed: boolean;
  seatsFull: boolean;
  checkoutBusy: boolean;
};

/** Returns the single, user-facing reason checkout is unavailable, if any. */
export function getCheckoutBlocker(input: CheckoutReadinessInput) {
  if (!input.signedIn) return "Sign in with Google to save your seat.";
  if (!input.agreedToRefundPolicy) {
    return "Check the required Refund and Mock Test Rules agreement to continue.";
  }
  if (!input.hasValidTimeZone) return "Choose a valid time zone to continue.";
  if (input.signupsClosed) return "Signups for this mock test are closed.";
  if (input.seatsFull) return "Seats are currently full. You can join the waitlist.";
  if (input.checkoutBusy) return "Opening secure checkout…";
  return null;
}

/** Checkout acknowledgement must be the literal boolean true, never merely truthy. */
export function hasRequiredNoRefundAcknowledgement(value: unknown) {
  return value === true;
}
