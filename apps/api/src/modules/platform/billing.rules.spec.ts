import { nextMonth, outstanding } from "./billing.rules";
import { entitlement } from "../auth/entitlement";

describe("SUB-01 billing rules", () => {
  it("preserves January 31 anchor through February and March including leap years", () => {
    const feb = nextMonth(new Date("2027-01-31T10:00:00Z"));
    expect(feb.toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(nextMonth(feb, 31).toISOString()).toBe("2027-03-31T10:00:00.000Z");
    expect(nextMonth(new Date("2028-01-31T10:00:00Z")).getUTCDate()).toBe(29);
  });
  it("deducts both partial payments and credits without floating-point money", () => {
    expect(
      outstanding(99000, [{ amountMinor: 30000 }, { amountMinor: 9000 }]),
    ).toBe(60000);
  });
  it("blocks at grace deadline and suspension independently of a live session", () => {
    const subscription = {
      status: "ACTIVE",
      startsAt: new Date("2026-01-01Z"),
      endsAt: new Date("2026-02-01Z"),
      graceEndsAt: new Date("2026-02-04Z"),
    };
    expect(
      entitlement("ACTIVE", subscription, new Date("2026-02-03Z")).allowed,
    ).toBe(true);
    expect(
      entitlement("ACTIVE", subscription, new Date("2026-02-04Z")).allowed,
    ).toBe(false);
    expect(
      entitlement("SUSPENDED", subscription, new Date("2026-01-15Z")).allowed,
    ).toBe(false);
    expect(
      entitlement("ACTIVE", subscription, new Date("2026-01-15Z")).allowed,
    ).toBe(true);
  });
  it("denies absent, cancelled and future subscriptions", () => {
    expect(entitlement("ACTIVE", undefined).allowed).toBe(false);
    expect(
      entitlement("ACTIVE", {
        status: "CANCELED",
        startsAt: new Date(0),
        endsAt: null,
      }).allowed,
    ).toBe(false);
    expect(
      entitlement("ACTIVE", {
        status: "ACTIVE",
        startsAt: new Date("2099-01-01Z"),
        endsAt: null,
      }).allowed,
    ).toBe(false);
  });
});
