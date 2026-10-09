export const MOCK_TEST_SEAT_CAP = 100;

export type StudentSeatDisplay =
  | { kind: "limited"; remaining: null; text: "Limited seats"; isFull: false }
  | { kind: "only"; remaining: number; text: string; isFull: false }
  | { kind: "almost_full"; remaining: number; text: string; isFull: false }
  | { kind: "full"; remaining: 0; text: "Seats are full"; isFull: true };

export function getStudentSeatDisplay(
  taken: number,
  cap = MOCK_TEST_SEAT_CAP
): StudentSeatDisplay {
  const safeTaken = Math.max(0, Math.min(cap, Math.trunc(taken)));
  const remaining = Math.max(0, cap - safeTaken);

  if (remaining === 0) {
    return { kind: "full", remaining: 0, text: "Seats are full", isFull: true };
  }
  if (safeTaken <= 70) {
    return { kind: "limited", remaining: null, text: "Limited seats", isFull: false };
  }
  if (safeTaken <= 90) {
    return {
      kind: "only",
      remaining,
      text: `Only ${remaining} seat${remaining === 1 ? "" : "s"} left`,
      isFull: false,
    };
  }
  return {
    kind: "almost_full",
    remaining,
    text: `Almost full: ${remaining} seat${remaining === 1 ? "" : "s"} left`,
    isFull: false,
  };
}

export function toPublicSeatStatus(taken: number, cap = MOCK_TEST_SEAT_CAP) {
  const display = getStudentSeatDisplay(taken, cap);
  return {
    isFull: display.isFull,
    label: display.kind,
    remaining: display.remaining,
    text: display.text,
  };
}
