export function effectiveOrganizationStatus(
  organization: { status: string; statusExpiresAt?: Date | null },
  now = new Date(),
) {
  return organization.status === "SUSPENDED" &&
    organization.statusExpiresAt &&
    organization.statusExpiresAt <= now
    ? "ACTIVE"
    : organization.status;
}
export function entitlement(
  status: string,
  subscription:
    | {
        status: string;
        startsAt: Date;
        endsAt: Date | null;
        graceEndsAt?: Date | null;
      }
    | undefined,
  now = new Date(),
): { allowed: boolean; reason: string } {
  if (status !== "ACTIVE")
    return {
      allowed: false,
      reason: "This business is suspended. Contact platform support.",
    };
  if (
    !subscription ||
    !["ACTIVE", "TRIALING", "PAST_DUE"].includes(subscription.status)
  )
    return { allowed: false, reason: "A subscription renewal is required." };
  if (subscription.startsAt > now)
    return { allowed: false, reason: "Your subscription has not started yet." };
  const deadline = subscription.graceEndsAt ?? subscription.endsAt;
  if (deadline && deadline <= now)
    return {
      allowed: false,
      reason: "Your subscription and grace period have ended.",
    };
  return {
    allowed: true,
    reason:
      subscription.endsAt && subscription.endsAt <= now
        ? "Your subscription is in its grace period. Please arrange renewal."
        : "",
  };
}
