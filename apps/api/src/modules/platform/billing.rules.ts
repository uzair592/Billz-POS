export function nextMonth(start: Date, anchorDay = start.getUTCDate()): Date {
  const end = new Date(start);
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(anchorDay, last));
  return end;
}

export function outstanding(
  total: number,
  settlements: { amountMinor: number }[],
): number {
  return total - settlements.reduce((sum, row) => sum + row.amountMinor, 0);
}
