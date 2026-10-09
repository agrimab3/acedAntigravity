export const WAITLIST_INVITE_HOURS = 48;
export const WAITLIST_INVITE_MS = WAITLIST_INVITE_HOURS * 60 * 60 * 1000;

export function isWaitlistInviteExpired(invitedAt: Date, now = new Date()) {
  return invitedAt.getTime() + WAITLIST_INVITE_MS <= now.getTime();
}

export function selectWaitlistHandoffCandidates<T extends { id: string }>(
  candidates: T[],
  expiredIds: Iterable<string>,
  available: number
) {
  const expired = new Set(expiredIds);
  return candidates
    .filter((candidate) => !expired.has(candidate.id))
    .slice(0, Math.max(0, available));
}
