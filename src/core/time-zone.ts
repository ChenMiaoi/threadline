export function normalizeTimeZone(value: unknown): string {
  if (typeof value !== 'string' || value === 'system') return 'system';
  try {
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return 'system';
  }
}

export function resolveTimeZone(preference = 'system'): string {
  const zone = normalizeTimeZone(preference);
  return zone === 'system' ? new Intl.DateTimeFormat().resolvedOptions().timeZone : zone;
}

export function timeZoneOptions(current = 'system'): string[] {
  return [
    ...new Set(['UTC', resolveTimeZone(current), ...Intl.supportedValuesOf('timeZone')]),
  ].sort();
}

export function timeZoneLabel(zone: string, at: Date | number): string {
  const name = new Intl.DateTimeFormat('en', {
    timeZone: zone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')!.value;
  const offset = name === 'GMT' ? 'UTC+00:00' : name.replace(/^GMT/, 'UTC');
  return `${offset} · ${zone}`;
}

export function calendarDate(time: number | Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(time);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
