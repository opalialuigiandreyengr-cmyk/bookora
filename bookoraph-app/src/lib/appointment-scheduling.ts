import type { Appointment, BlockTimeEvent, BusinessProfile, Service, TimeOffRule } from '@/types';

const MANILA_OFFSET = '+08:00';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type AppointmentDraft = Pick<
  Appointment,
  'appointment_date' | 'appointment_time' | 'duration_minutes' | 'service_names'
> &
  Partial<Pick<Appointment, 'buffer_minutes'>>;

type SchedulingContext = {
  businessProfile: BusinessProfile;
  appointments: Appointment[];
  blockEvents: BlockTimeEvent[];
  services?: Service[];
  excludeAppointmentId?: string;
  now?: Date;
};

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(`${value}T12:00:00${MANILA_OFFSET}`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function parseClockMinutes(value: string) {
  const match = value.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3];
  if (minute > 59 || hour > (period ? 12 : 23) || (period && hour < 1)) return null;
  if (period === 'PM' && hour < 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function formatClockMinutes(total: number) {
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

function manilaDateKey(date: Date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function dateDifferenceDays(from: string, to: string) {
  const fromDate = parseDateKey(from);
  const toDate = parseDateKey(to);
  if (!fromDate || !toDate) return Number.NaN;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
}

function dayName(dateKey: string) {
  const date = parseDateKey(dateKey);
  return date ? DAY_NAMES[date.getUTCDay()] : '';
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd && end > otherStart;
}

function timeOffApplies(rule: TimeOffRule, targetDate: string) {
  if (!parseDateKey(rule.startDate) || !parseDateKey(rule.endDate)) return false;
  const durationDays = Math.max(0, dateDifferenceDays(rule.startDate, rule.endDate));
  const daysFromStart = dateDifferenceDays(rule.startDate, targetDate);
  if (!Number.isFinite(daysFromStart) || daysFromStart < 0) return false;
  if (rule.repeat === 'none') return targetDate >= rule.startDate && targetDate <= rule.endDate;
  if (rule.repeat === 'weekly') return daysFromStart % 7 <= Math.min(durationDays, 6);

  const start = parseDateKey(rule.startDate);
  const target = parseDateKey(targetDate);
  if (!start || !target) return false;
  const startDay = start.getUTCDate();
  const targetDay = target.getUTCDate();
  return targetDay >= startDay && targetDay <= startDay + durationDays;
}

export function getDateBookingError(dateKey: string, profile: BusinessProfile, now = new Date()) {
  if (!parseDateKey(dateKey)) return 'Choose a valid appointment date.';
  const today = manilaDateKey(now);
  if (dateKey < today) return 'Appointments cannot be created in the past.';

  const maxDays = Math.max(1, Number(profile.booking_max_days) || 60);
  const daysAhead = dateDifferenceDays(today, dateKey);
  if (daysAhead > maxDays) {
    return `Bookings are limited to ${maxDays} day${maxDays === 1 ? '' : 's'} ahead.`;
  }

  const weekday = dayName(dateKey);
  const hours = profile.business_hours.find((item) => item.day === weekday);
  if (!hours?.open) return `${weekday || 'This day'} is outside your business hours.`;

  const allDayTimeOff = profile.time_off.find(
    (rule) => rule.allDay && timeOffApplies(rule, dateKey)
  );
  if (allDayTimeOff) return `${allDayTimeOff.title || 'Time off'} blocks this date.`;
  return null;
}

export function buildTimeSlots(dateKey: string, profile: BusinessProfile) {
  const dateError = getDateBookingError(dateKey, profile);
  if (dateError) return [];
  const hours = profile.business_hours.find((item) => item.day === dayName(dateKey));
  const start = parseClockMinutes(hours?.start || '09:00');
  const end = parseClockMinutes(hours?.end || '17:00');
  if (start == null || end == null || end <= start) return [];
  const step = Math.max(5, Number(profile.booking_slot_size_minutes) || 30);
  const slots: string[] = [];
  for (let minute = start; minute < end; minute += step) slots.push(formatClockMinutes(minute));
  return slots;
}

export function resolveAppointmentServices(serviceNames: string, services: Service[]) {
  const requested = serviceNames
    .split(' + ')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return services.filter((service) => requested.includes(service.name.trim().toLowerCase()));
}

export function validateAppointmentSchedule(draft: AppointmentDraft, context: SchedulingContext) {
  const { businessProfile, appointments, blockEvents, services = [], excludeAppointmentId, now = new Date() } = context;
  const dateError = getDateBookingError(draft.appointment_date, businessProfile, now);
  if (dateError) return dateError;

  const start = parseClockMinutes(draft.appointment_time);
  const duration = Number(draft.duration_minutes);
  const buffer = Math.max(0, Number(draft.buffer_minutes) || 0);
  if (start == null) return 'Choose a valid appointment time.';
  if (!Number.isFinite(duration) || duration < 5) return 'Appointment duration must be at least 5 minutes.';
  const serviceEnd = start + duration;
  const occupiedEnd = serviceEnd + buffer;
  if (occupiedEnd > 24 * 60) return 'This appointment would end after midnight.';

  const appointmentInstant = new Date(
    `${draft.appointment_date}T${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}:00${MANILA_OFFSET}`
  );
  const minNoticeHours = Math.max(0, Number(businessProfile.booking_min_notice_hours) || 0);
  if (appointmentInstant.getTime() < now.getTime() + minNoticeHours * 3_600_000) {
    return `Appointments need at least ${minNoticeHours} hour${minNoticeHours === 1 ? '' : 's'} notice.`;
  }

  const weekday = dayName(draft.appointment_date);
  const hours = businessProfile.business_hours.find((item) => item.day === weekday);
  const open = parseClockMinutes(hours?.start || '');
  const close = parseClockMinutes(hours?.end || '');
  if (open == null || close == null || start < open || occupiedEnd > close) {
    return `Choose a time within ${hours?.start || 'business hours'}–${hours?.end || ''}.`;
  }

  const selectedServices = resolveAppointmentServices(draft.service_names, services);
  for (const service of selectedServices) {
    const serviceHours = service.service_hours?.[weekday];
    if (!serviceHours) continue;
    const serviceOpen = parseClockMinutes(serviceHours.start);
    const serviceClose = parseClockMinutes(serviceHours.end);
    if (!serviceHours.open || serviceOpen == null || serviceClose == null || start < serviceOpen || serviceEnd > serviceClose) {
      return `${service.name} is not available at this time.`;
    }
  }

  const breakConflict = (businessProfile.availability_breaks[weekday] || []).find((window) => {
    const breakStart = parseClockMinutes(window.start);
    const breakEnd = parseClockMinutes(window.end);
    return breakStart != null && breakEnd != null && overlaps(start, occupiedEnd, breakStart, breakEnd);
  });
  if (breakConflict) return `This time overlaps the ${breakConflict.start}–${breakConflict.end} break.`;

  const timeOffConflict = businessProfile.time_off.find((rule) => {
    if (!timeOffApplies(rule, draft.appointment_date)) return false;
    if (rule.allDay) return true;
    const ruleStart = parseClockMinutes(rule.startTime);
    const ruleEnd = parseClockMinutes(rule.endTime);
    return ruleStart != null && ruleEnd != null && overlaps(start, occupiedEnd, ruleStart, ruleEnd);
  });
  if (timeOffConflict) return `${timeOffConflict.title || 'Time off'} blocks this time.`;

  const blockConflict = blockEvents.find((event) => {
    if (event.event_date !== draft.appointment_date) return false;
    const eventStart = parseClockMinutes(event.start_time);
    return eventStart != null && overlaps(start, occupiedEnd, eventStart, eventStart + Math.max(5, event.duration_minutes));
  });
  if (blockConflict) return `${blockConflict.title || 'Blocked time'} overlaps this appointment.`;

  const appointmentConflict = appointments.find((appointment) => {
    if (
      appointment.id === excludeAppointmentId ||
      appointment.appointment_date !== draft.appointment_date ||
      ['cancelled', 'no_show'].includes(appointment.status)
    ) {
      return false;
    }
    const existingStart = parseClockMinutes(appointment.appointment_time);
    if (existingStart == null) return false;
    const existingEnd =
      existingStart +
      Math.max(5, Number(appointment.duration_minutes) || 60) +
      Math.max(0, Number(appointment.buffer_minutes) || 0);
    return overlaps(start, occupiedEnd, existingStart, existingEnd);
  });
  if (appointmentConflict) {
    return `This time overlaps ${appointmentConflict.customer_name}'s ${appointmentConflict.appointment_time} appointment.`;
  }

  return null;
}
