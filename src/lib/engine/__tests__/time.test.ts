import { describe, expect, it } from "vitest";
import { addDays, diffDays, eachDate, isISODate, todayIn, weekday, zonedParts, zonedToUtc } from "../time";

describe("date-only arithmetic", () => {
  it("adds days across month, year and leap boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US DST start: no drift
  });
  it("counts whole days regardless of DST", () => {
    expect(diffDays("2026-10-31", "2026-11-02")).toBe(2);
    expect(diffDays("2026-03-07", "2026-03-09")).toBe(2);
  });
  it("computes weekdays independent of the host time zone", () => {
    expect(weekday("2026-11-26")).toBe(4); // Thanksgiving 2026 is a Thursday
    expect(weekday("2027-01-03")).toBe(0);
  });
  it("validates dates", () => {
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("nope")).toBe(false);
  });
  it("enumerates inclusive ranges", () => {
    expect(eachDate("2026-12-31", "2027-01-02")).toEqual(["2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});

describe("time zones", () => {
  it("converts airport local time to UTC with DST", () => {
    // Chicago is UTC-5 in October (CDT) and UTC-6 after Nov 1 2026 (CST).
    expect(new Date(zonedToUtc("2026-10-30", "08:00", "America/Chicago")).toISOString()).toBe("2026-10-30T13:00:00.000Z");
    expect(new Date(zonedToUtc("2026-11-02", "08:00", "America/Chicago")).toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });
  it("handles zones without DST", () => {
    expect(new Date(zonedToUtc("2026-07-01", "12:00", "America/Phoenix")).toISOString()).toBe("2026-07-01T19:00:00.000Z");
    expect(new Date(zonedToUtc("2026-07-01", "12:00", "Pacific/Honolulu")).toISOString()).toBe("2026-07-01T22:00:00.000Z");
  });
  it("resolves the fall-back ambiguity to the first occurrence", () => {
    expect(new Date(zonedToUtc("2026-11-01", "01:30", "America/New_York")).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
  it("moves spring-forward gap times to the later offset", () => {
    expect(new Date(zonedToUtc("2026-03-08", "02:30", "America/New_York")).toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });
  it("round-trips local parts", () => {
    const t = zonedToUtc("2026-12-31", "23:45", "Europe/London");
    expect(zonedParts(t, "Europe/London")).toEqual({ date: "2026-12-31", time: "23:45" });
    expect(zonedParts(t, "Asia/Tokyo").date).toBe("2027-01-01");
  });
  it("derives today's date in a given zone", () => {
    const now = new Date("2026-10-27T03:30:00Z");
    expect(todayIn("America/Los_Angeles", now)).toBe("2026-10-26");
    expect(todayIn("Europe/London", now)).toBe("2026-10-27");
  });
});
