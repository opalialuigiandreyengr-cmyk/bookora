export type AppointmentColor = 'coral' | 'lilac' | 'peach' | 'mint' | 'blue';

export const COLOR_PALETTE: AppointmentColor[] = ['coral', 'lilac', 'peach', 'mint', 'blue'];

export const AVATAR_COLORS: Record<AppointmentColor, { bg: string; text: string; border: string }> = {
  coral: { bg: '#FDF2F0', text: '#D85B53', border: '#FADCD8' },
  lilac: { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
  peach: { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
  mint: { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
  blue: { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
};

export const TIME_SLOTS = [
  '8:00 AM',
  '8:30 AM',
  '9:00 AM',
  '9:30 AM',
  '10:00 AM',
  '10:30 AM',
  '11:00 AM',
  '11:30 AM',
  '12:00 PM',
  '12:30 PM',
  '1:00 PM',
  '1:30 PM',
  '2:00 PM',
  '2:30 PM',
  '3:00 PM',
  '3:30 PM',
  '4:00 PM',
  '4:30 PM',
  '5:00 PM',
  '5:30 PM',
  '6:00 PM',
  '6:30 PM',
  '7:00 PM',
];

export function pickAppointmentColor(seed: string): AppointmentColor {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

export function parseTimeToMinutes(timeStr: string): number {
  const cleaned = timeStr.trim().toUpperCase();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return 9 * 60;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3];
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const hours24 = Math.floor(clamped / 60);
  const mins = clamped % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${meridiem}`;
}

export function formatTimeRange(startTimeStr: string, durationMinutes: number): string {
  const startMins = parseTimeToMinutes(startTimeStr);
  const endMins = startMins + (durationMinutes || 60);
  return `${formatMinutesToTime(startMins)} – ${formatMinutesToTime(endMins)}`;
}

