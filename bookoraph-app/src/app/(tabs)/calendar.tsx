import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { type ElementRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { Screen, StatusBadge } from '@/components/ui';
import { Text } from '@/components/app-text';
import { useApp } from '@/providers/app-provider';
import { colors, space } from '@/theme';
import type { Appointment } from '@/types';
import { NewAppointmentModal } from '@/components/calendar/NewAppointmentModal';
import {
  AVATAR_COLORS,
  pickAppointmentColor,
} from '@/components/calendar/types';

type Preset = 'day' | '3-day' | 'week' | 'agenda';
const PRESETS: {
  key: Preset;
  label: string;
  icon: 'today-outline' | 'albums-outline' | 'grid-outline' | 'list-outline';
}[] = [
  { key: 'day', label: 'Day', icon: 'today-outline' },
  { key: '3-day', label: '3 days', icon: 'albums-outline' },
  { key: 'week', label: 'Week', icon: 'grid-outline' },
  { key: 'agenda', label: 'Agenda', icon: 'list-outline' },
];

const TIME_ZONE = 'Asia/Manila';
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 56;
const TIME_GUTTER = 58;
const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function dateKey(date: Date) {
  return date.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
}
function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
function todayInManila() {
  return parseDate(new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date()));
}
function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}
function startOfWeek(date: Date) {
  const mondayOffset = (date.getDay() + 6) % 7;
  return addDays(date, -mondayOffset);
}
function buildMonthDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return Array.from({ length: 42 }, (_, index) => addDays(startOfWeek(first), index));
}
function timeToMinutes(value: string) {
  const match = value.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return 0;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}
function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}
function monthYearLabel(date: Date) {
  return new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: TIME_ZONE }).format(date);
}

export default function Calendar() {
  const router = useRouter();
  const {
    appointments,
    refreshing,
    refresh,
    addAppointment,
    services,
    businessName,
  } = useApp();

  const today = todayInManila();
  const [selectedDate, setSelectedDate] = useState(today);
  const [preset, setPreset] = useState<Preset>('3-day');
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false);
  const [newAppointmentTime, setNewAppointmentTime] = useState('10:00 AM');

  const activeAppointments = useMemo(
    () => appointments.filter((item) => !['cancelled', 'no_show'].includes(item.status)),
    [appointments]
  );

  const visibleDates = useMemo(
    () =>
      preset === 'day'
        ? [selectedDate]
        : preset === '3-day'
        ? [selectedDate, addDays(selectedDate, 1), addDays(selectedDate, 2)]
        : preset === 'agenda'
        ? [selectedDate]
        : Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(selectedDate), index)),
    [preset, selectedDate]
  );

  const gridTimes = useMemo(() => {
    let start = 8 * 60;
    let end = 19 * 60;
    activeAppointments.forEach((item) => {
      const startTime = timeToMinutes(item.appointment_time);
      start = Math.min(start, Math.floor(startTime / 60) * 60);
      end = Math.max(end, Math.ceil((startTime + Math.max(item.duration_minutes, 30)) / 60) * 60);
    });
    return Array.from({ length: Math.max(1, (end - start) / SLOT_MINUTES) }, (_, index) => start + index * SLOT_MINUTES);
  }, [activeAppointments]);

  const goToday = () => setSelectedDate(today);

  const openAppointment = (item: Appointment) =>
    router.push({ pathname: '/booking/[id]', params: { id: item.id } });
  const openNewAppointment = (date: Date, time = '10:00 AM') => {
    setSelectedDate(date);
    setNewAppointmentTime(time);
    setNewAppointmentOpen(true);
  };

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={refresh}
      stickyHeaderIndices={[0]}
      backgroundColor="#FFFFFF"
      style={styles.screen}
      floatingAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add appointment"
          onPress={() => openNewAppointment(selectedDate)}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          <Ionicons name="add" size={25} color="#FFFFFF" />
        </Pressable>
      }
    >
      {/* Sticky Header with Month/Year & View Selector */}
      <View style={styles.stickyHeader}>
        <View style={styles.headerLine}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose date from calendar"
            onPress={() => setMonthMenuOpen(true)}
            style={styles.monthTitleButton}
          >
            <Text style={styles.title}>{monthYearLabel(selectedDate)}</Text>
            <Ionicons name="chevron-down" size={17} color={colors.muted} />
          </Pressable>

          <View style={styles.headerControls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose calendar view"
              onPress={() => setViewMenuOpen(true)}
              style={styles.viewSelect}
            >
              <Ionicons
                name={PRESETS.find((item) => item.key === preset)?.icon ?? 'calendar-outline'}
                size={15}
                color={colors.navy}
              />
              <Text style={styles.viewSelectText}>{PRESETS.find((item) => item.key === preset)?.label}</Text>
              <Ionicons name="chevron-down" size={15} color={colors.muted} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go to today"
              onPress={goToday}
              style={styles.todayButton}
            >
              <Text style={styles.todayButtonText}>Today</Text>
            </Pressable>
          </View>
        </View>

        <DateStrip preset={preset} selectedDate={selectedDate} onSelect={setSelectedDate} />
      </View>

      {/* Preset View Switcher Menu Modal */}
      <Modal visible={viewMenuOpen} transparent animationType="fade" onRequestClose={() => setViewMenuOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setViewMenuOpen(false)}>
          <Pressable style={styles.viewMenu} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.viewMenuTitle}>Calendar view</Text>
            {PRESETS.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: preset === item.key }}
                onPress={() => {
                  setPreset(item.key);
                  setViewMenuOpen(false);
                }}
                style={[styles.viewMenuItem, preset === item.key && styles.viewMenuItemActive]}
              >
                <View style={styles.viewMenuLabel}>
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={preset === item.key ? colors.navy : colors.muted}
                  />
                  <Text style={styles.viewMenuItemText}>{item.label}</Text>
                </View>
                {preset === item.key ? <Ionicons name="checkmark" size={18} color={colors.navy} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Mini Month Picker Dropdown Modal */}
      <Modal visible={monthMenuOpen} transparent animationType="fade" onRequestClose={() => setMonthMenuOpen(false)}>
        <Pressable style={styles.monthModalBackdrop} onPress={() => setMonthMenuOpen(false)}>
          <Pressable style={styles.monthMenu} onPress={(event) => event.stopPropagation()}>
            <MonthPicker
              key={monthYearLabel(selectedDate)}
              selectedDate={selectedDate}
              today={today}
              appointments={activeAppointments}
              onSelect={(date) => {
                setSelectedDate(date);
                setMonthMenuOpen(false);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Full Mirrored Add Appointment Modal */}
      <NewAppointmentModal
        key={`${newAppointmentOpen}-${dateKey(selectedDate)}-${newAppointmentTime}`}
        visible={newAppointmentOpen}
        defaultDate={dateKey(selectedDate)}
        defaultTime={newAppointmentTime}
        services={services}
        existingAppointments={appointments}
        staffName={businessName}
        onClose={() => setNewAppointmentOpen(false)}
        onCreate={async (draft) => {
          const error = await addAppointment(draft);
          if (error) {
            Alert.alert('Could not add appointment', error);
            return false;
          }
          setSelectedDate(parseDate(draft.appointment_date));
          return true;
        }}
      />

      {preset === 'agenda' ? (
        <AgendaView
          selectedDate={selectedDate}
          appointments={activeAppointments}
          onOpenAppointment={openAppointment}
          onAddAppointment={() => openNewAppointment(selectedDate)}
        />
      ) : (
        <TimeGrid
          preset={preset}
          selectedDate={selectedDate}
          dates={visibleDates}
          times={gridTimes}
          appointments={activeAppointments}
          onSwipeDate={setSelectedDate}
          onOpenAppointment={openAppointment}
          onAddAt={openNewAppointment}
        />
      )}
    </Screen>
  );
}

function MonthPicker({
  selectedDate,
  today,
  appointments,
  onSelect,
}: {
  selectedDate: Date;
  today: Date;
  appointments: Appointment[];
  onSelect: (date: Date) => void;
}) {
  const [displayMonth, setDisplayMonth] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const days = buildMonthDays(displayMonth);
  const appointmentDates = new Set(appointments.map((item) => item.appointment_date));

  return (
    <View>
      <View style={styles.monthPickerHeader}>
        <Pressable
          accessibilityLabel="Previous month"
          onPress={() => setDisplayMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          style={styles.monthArrow}
        >
          <Ionicons name="chevron-back" size={18} color={colors.ink} />
        </Pressable>
        <Text style={styles.monthPickerTitle}>{monthYearLabel(displayMonth)}</Text>
        <Pressable
          accessibilityLabel="Next month"
          onPress={() => setDisplayMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          style={styles.monthArrow}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.monthWeekdays}>
        {weekdayLabels.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.monthWeekday}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.monthPickerGrid}>
        {days.map((day) => {
          const key = dateKey(day);
          const active = key === dateKey(selectedDate);
          const outside = day.getMonth() !== displayMonth.getMonth();
          const isToday = key === dateKey(today);
          return (
            <Pressable
              key={key}
              onPress={() => onSelect(day)}
              style={[styles.monthPickerCell, outside && styles.monthPickerOutside]}
            >
              <View
                style={[
                  styles.monthPickerDate,
                  active && styles.monthPickerSelected,
                  isToday && !active && styles.monthPickerToday,
                ]}
              >
                <Text
                  style={[
                    styles.monthPickerDateText,
                    active && styles.monthPickerSelectedText,
                    isToday && !active && styles.monthPickerTodayText,
                  ]}
                >
                  {day.getDate()}
                </Text>
              </View>
              {appointmentDates.has(key) ? (
                <View style={styles.appointmentDot} />
              ) : (
                <View style={styles.appointmentDotPlaceholder} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DateStrip({
  preset,
  selectedDate,
  onSelect,
}: {
  preset: Preset;
  selectedDate: Date;
  onSelect: (date: Date) => void;
}) {
  const stripScrollRef = useRef<ElementRef<typeof ScrollView>>(null);
  const { width: screenWidth } = useWindowDimensions();
  const pageWidth = Math.max(1, screenWidth - TIME_GUTTER);
  const stripSpan = preset === '3-day' ? 3 : 7;
  const anchorDate = preset === '3-day' ? selectedDate : startOfWeek(selectedDate);
  const anchorKey = dateKey(anchorDate);
  const columnWidth = Math.max(1, pageWidth / stripSpan);
  const stacked = preset === 'day' || preset === 'week' || preset === 'agenda';
  const weekdayFormat = preset === 'day' ? 'narrow' : 'short';
  const borderless = preset === 'day';
  const todayKey = dateKey(todayInManila());
  const selectedKey = dateKey(selectedDate);

  const pages = useMemo(
    () =>
      [-1, 0, 1].map((pageOffset) => {
        const start = addDays(anchorDate, pageOffset * stripSpan);
        return Array.from({ length: stripSpan }, (_, index) => addDays(start, index));
      }),
    [anchorKey, stripSpan]
  );

  useLayoutEffect(() => {
    stripScrollRef.current?.scrollTo({ x: pageWidth, animated: false });
  }, [anchorKey, pageWidth, preset]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      stripScrollRef.current?.scrollTo({ x: pageWidth, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [anchorKey, pageWidth, preset]);

  const onStripSettled = (offsetX: number) => {
    const pageIndex = Math.round(offsetX / pageWidth);
    const pageOffset = pageIndex - 1;
    if (pageOffset === 0) return;
    onSelect(addDays(selectedDate, pageOffset * stripSpan));
  };

  return (
    <View style={styles.stickyDateStrip}>
      <View style={[styles.stickyDateGutter, borderless && styles.borderlessDateGutter, { width: TIME_GUTTER }]}>
        <Text style={styles.gmt}>GMT+8</Text>
      </View>
      <View style={[styles.stickyDateViewport, { width: pageWidth }]}>
        <ScrollView
          ref={stripScrollRef}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          scrollEventThrottle={16}
          style={{ width: pageWidth }}
          onMomentumScrollEnd={(event) => onStripSettled(event.nativeEvent.contentOffset.x)}
        >
          {pages.map((pageDates, pageIndex) => (
            <View key={`${dateKey(pageDates[0])}-${pageIndex}`} style={[styles.stickyDateColumns, { width: pageWidth }]}>
              {pageDates.map((day) => {
                const key = dateKey(day);
                const active = key === selectedKey;
                return (
                  <Pressable
                    key={key}
                    onPress={() => onSelect(day)}
                    style={[
                      styles.stickyDateColumn,
                      borderless && styles.borderlessDateColumn,
                      { width: columnWidth },
                      key === todayKey && styles.todayColumn,
                    ]}
                  >
                    <View
                      style={[
                        styles.columnHeaderMeta,
                        stacked && styles.columnHeaderMetaStacked,
                        active && styles.selectedDatePill,
                      ]}
                    >
                      <Text style={[styles.columnDate, active && styles.selectedDateText]}>{day.getDate()}</Text>
                      <Text style={[styles.columnWeekday, active && styles.selectedDateText]}>
                        {new Intl.DateTimeFormat('en-PH', { weekday: weekdayFormat }).format(day)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function AgendaView({
  selectedDate,
  appointments,
  onOpenAppointment,
  onAddAppointment,
}: {
  selectedDate: Date;
  appointments: Appointment[];
  onOpenAppointment: (item: Appointment) => void;
  onAddAppointment: () => void;
}) {
  const selectedKey = dateKey(selectedDate);
  const groupedAppointments = useMemo(() => {
    const upcoming = appointments
      .filter((item) => item.appointment_date >= selectedKey)
      .sort((a, b) => {
        const dateOrder = a.appointment_date.localeCompare(b.appointment_date);
        return dateOrder || timeToMinutes(a.appointment_time) - timeToMinutes(b.appointment_time);
      });

    return upcoming.reduce<{ date: string; items: Appointment[] }[]>((groups, item) => {
      const current = groups[groups.length - 1];
      if (current?.date === item.appointment_date) current.items.push(item);
      else groups.push({ date: item.appointment_date, items: [item] });
      return groups;
    }, []);
  }, [appointments, selectedKey]);

  if (!groupedAppointments.length) {
    return (
      <View style={styles.agendaEmpty}>
        <View style={styles.agendaEmptyIcon}>
          <Ionicons name="calendar-clear-outline" size={23} color={colors.coral} />
        </View>
        <Text style={styles.agendaEmptyTitle}>No upcoming appointments</Text>
        <Text style={styles.agendaEmptyText}>There are no appointments from this date onward.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onAddAppointment}
          style={({ pressed }) => [styles.agendaEmptyButton, pressed && styles.fabPressed]}
        >
          <Ionicons name="add" size={17} color="#FFFFFF" />
          <Text style={styles.agendaEmptyButtonText}>Add appointment</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.agenda}>
      {groupedAppointments.map((group) => {
        const groupDate = parseDate(group.date);
        const isToday = group.date === dateKey(todayInManila());
        return (
          <View key={group.date} style={styles.agendaGroup}>
            <View style={styles.agendaDateRow}>
              <View style={[styles.agendaDateBadge, isToday && styles.agendaDateBadgeToday]}>
                <Text style={[styles.agendaDateDay, isToday && styles.agendaDateTextToday]}>
                  {groupDate.getDate()}
                </Text>
                <Text style={[styles.agendaDateMonth, isToday && styles.agendaDateTextToday]}>
                  {new Intl.DateTimeFormat('en-PH', { month: 'short' }).format(groupDate)}
                </Text>
              </View>
              <View>
                <Text style={styles.agendaWeekday}>
                  {isToday ? 'Today' : new Intl.DateTimeFormat('en-PH', { weekday: 'long' }).format(groupDate)}
                </Text>
                <Text style={styles.agendaDateFull}>
                  {new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }).format(groupDate)}
                </Text>
              </View>
            </View>

            <View style={styles.agendaItems}>
              {group.items.map((item) => {
                const colorKey = pickAppointmentColor(item.customer_name);
                const tone = AVATAR_COLORS[colorKey] ?? AVATAR_COLORS.coral;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.appointment_time}, ${item.customer_name}, ${item.service_names}`}
                    onPress={() => onOpenAppointment(item)}
                    style={({ pressed }) => [
                      styles.agendaItem,
                      { borderLeftColor: tone.text },
                      pressed && styles.agendaItemPressed,
                    ]}
                  >
                    <View style={styles.agendaTimeColumn}>
                      <Text style={styles.agendaTime}>{item.appointment_time}</Text>
                      <Text style={styles.agendaDuration}>{item.duration_minutes} min</Text>
                    </View>
                    <View style={styles.agendaItemCopy}>
                      <Text numberOfLines={1} style={styles.agendaClient}>{item.customer_name}</Text>
                      <Text numberOfLines={1} style={styles.agendaService}>{item.service_names}</Text>
                    </View>
                    <View style={styles.agendaItemEnd}>
                      <StatusBadge status={item.status} />
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function TimeGrid({
  preset,
  selectedDate,
  dates,
  times,
  appointments,
  onSwipeDate,
  onOpenAppointment,
  onAddAt,
}: {
  preset: Preset;
  selectedDate: Date;
  dates: Date[];
  times: number[];
  appointments: Appointment[];
  onSwipeDate: (date: Date) => void;
  onOpenAppointment: (item: Appointment) => void;
  onAddAt: (date: Date, time: string) => void;
}) {
  const scrollRef = useRef<ElementRef<typeof ScrollView>>(null);
  const { width: screenWidth } = useWindowDimensions();
  const span = preset === 'day' ? 1 : preset === '3-day' ? 3 : 7;
  const pageWidth = Math.max(1, screenWidth - TIME_GUTTER);
  const columnWidth = Math.max(1, pageWidth / span);
  const anchorDate = dates[0];
  const anchorKey = dateKey(anchorDate);

  const pages = useMemo(
    () =>
      [-1, 0, 1].map((pageOffset) => {
        const start = addDays(anchorDate, pageOffset * span);
        return Array.from({ length: span }, (_, index) => addDays(start, index));
      }),
    [anchorKey, span]
  );

  const appointmentsByDate = useMemo(
    () =>
      appointments.reduce<Record<string, Appointment[]>>((groups, item) => {
        (groups[item.appointment_date] ??= []).push(item);
        return groups;
      }, {}),
    [appointments]
  );

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ x: pageWidth, animated: false });
  }, [anchorKey, pageWidth, preset, span]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: pageWidth, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [anchorKey, pageWidth, preset, span]);

  const onPageSettled = (offsetX: number) => {
    const pageIndex = Math.round(offsetX / pageWidth);
    const pageOffset = pageIndex - 1;
    if (pageOffset === 0) return;
    onSwipeDate(addDays(selectedDate, pageOffset * span));
  };

  const renderAppointmentItem = (item: Appointment, colWidth: number) => {
    const top = ((timeToMinutes(item.appointment_time) - times[0]) / SLOT_MINUTES) * SLOT_HEIGHT;
    const height = Math.max(46, (Math.max(item.duration_minutes, 30) / SLOT_MINUTES) * SLOT_HEIGHT - 6);
    const colorKey = pickAppointmentColor(item.customer_name);
    const avatarConf = AVATAR_COLORS[colorKey] ?? AVATAR_COLORS.coral;

    return (
      <Pressable
        key={item.id}
        onPress={() => onOpenAppointment(item)}
        style={[
          styles.timeEvent,
          {
            top: Math.max(2, top),
            height,
            left: 4,
            width: colWidth - 8,
            backgroundColor: avatarConf.bg,
            borderLeftColor: avatarConf.text,
          },
        ]}
      >
        <Text numberOfLines={1} style={[styles.timeEventTime, { color: avatarConf.text }]}>
          {item.appointment_time}
        </Text>
        <Text numberOfLines={1} style={styles.timeEventName}>
          {item.customer_name}
        </Text>
        <Text numberOfLines={1} style={styles.timeEventService}>
          {item.service_names}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.timeGridShell}>
      <View style={styles.fixedTimeGutter}>
        {times.map((time) => (
          <View key={time} style={styles.timeLabel}>
            <Text style={styles.timeLabelText}>{formatTime(time)}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.dayCanvas, { width: pageWidth }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          scrollEventThrottle={16}
          style={{ width: pageWidth }}
          onMomentumScrollEnd={(event) => onPageSettled(event.nativeEvent.contentOffset.x)}
        >
          {pages.map((pageDates, pageIndex) => (
            <View key={`${dateKey(pageDates[0])}-${pageIndex}`} style={[styles.timeColumns, { width: pageWidth }]}>
              {pageDates.map((day) => {
                const dayKey = dateKey(day);
                const dayAppointments = appointmentsByDate[dayKey] ?? [];
                return (
                  <View
                    key={dayKey}
                    style={[styles.timeColumn, { width: columnWidth, height: times.length * SLOT_HEIGHT }]}
                  >
                    {times.map((time) => (
                      <Pressable key={time} onPress={() => onAddAt(day, formatTime(time))} style={styles.timeSlot} />
                    ))}
                    {dayAppointments.map((item) => renderAppointmentItem(item, columnWidth))}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingBottom: 0, gap: 0, backgroundColor: '#FFFFFF' },
  stickyHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: 0,
    borderBottomWidth: 0,
    zIndex: 2,
  },
  headerLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  monthTitleButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  title: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  headerControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 12,
    width: 48,
    height: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: colors.coral,
    shadowColor: '#17212B',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    zIndex: 10,
  },
  fabPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  viewSelect: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
  },
  viewSelectText: { color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  todayButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.navy,
    paddingHorizontal: 11,
  },
  todayButtonText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(23,33,43,0.18)',
    paddingTop: 92,
    paddingRight: space.md,
  },
  viewMenu: {
    width: 190,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  viewMenuTitle: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '800',
    paddingHorizontal: 14,
    paddingVertical: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  viewMenuItem: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  viewMenuLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewMenuItemActive: { backgroundColor: '#F3F7FB' },
  viewMenuItemText: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  monthModalBackdrop: {
    flex: 1,
    alignItems: 'stretch',
    backgroundColor: 'rgba(23,33,43,0.18)',
    paddingTop: 76,
    paddingHorizontal: space.md,
  },
  monthMenu: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  monthPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  monthPickerTitle: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  monthArrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  monthWeekdays: { flexDirection: 'row', marginBottom: 4 },
  monthWeekday: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', textAlign: 'center' },
  monthPickerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthPickerCell: { width: '14.28%', height: 42, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  monthPickerOutside: { opacity: 0.35 },
  monthPickerDate: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  monthPickerSelected: { backgroundColor: colors.navy },
  monthPickerToday: { borderWidth: 1, borderColor: colors.coral },
  monthPickerDateText: { color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  monthPickerSelectedText: { color: '#FFFFFF', fontWeight: '700' },
  monthPickerTodayText: { color: colors.coral, fontWeight: '700' },
  appointmentDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.coral, marginTop: 2 },
  appointmentDotPlaceholder: { width: 4, height: 4, marginTop: 2 },
  stickyDateStrip: {
    height: 48,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E4E4E4',
    marginTop: space.sm,
    marginHorizontal: -space.md,
  },
  stickyDateGutter: { alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: '#E4E4E4' },
  stickyDateViewport: { flex: 1, overflow: 'hidden' },
  stickyDateColumns: { height: 46, flexDirection: 'row' },
  stickyDateColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderColor: '#E4E4E4',
    paddingHorizontal: 2,
  },
  borderlessDateGutter: { borderRightWidth: 0 },
  borderlessDateColumn: { borderRightWidth: 0 },
  selectedDatePill: {
    minWidth: 34,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.navy,
    paddingHorizontal: 4,
  },
  selectedDateText: { color: '#FFFFFF', fontWeight: '700' },
  todayColumn: { backgroundColor: '#FFFFFF' },
  columnDate: { color: colors.ink, fontSize: 16, lineHeight: 20, fontWeight: '700' },
  columnWeekday: { color: colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '600' },
  columnHeaderMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  columnHeaderMetaStacked: { flexDirection: 'column', alignItems: 'center', gap: 2 },
  agenda: {
    gap: space.xl,
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: 92,
    backgroundColor: '#FFFFFF',
  },
  agendaGroup: { gap: space.sm },
  agendaDateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  agendaDateBadge: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  agendaDateBadgeToday: { borderColor: colors.navy, backgroundColor: colors.navy },
  agendaDateDay: { color: colors.ink, fontSize: 16, lineHeight: 18, fontWeight: '800' },
  agendaDateMonth: { color: colors.muted, fontSize: 9, lineHeight: 12, fontWeight: '700', textTransform: 'uppercase' },
  agendaDateTextToday: { color: '#FFFFFF' },
  agendaWeekday: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  agendaDateFull: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 1 },
  agendaItems: { gap: 8, marginLeft: 54 },
  agendaItem: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderLeftWidth: 3.5,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  agendaItemPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  agendaTimeColumn: { width: 68 },
  agendaTime: { color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  agendaDuration: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  agendaItemCopy: { flex: 1, minWidth: 0 },
  agendaClient: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  agendaService: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  agendaItemEnd: { alignItems: 'flex-end', gap: 7 },
  agendaEmpty: {
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: 72,
    paddingBottom: 100,
    backgroundColor: '#FFFFFF',
  },
  agendaEmptyIcon: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    backgroundColor: colors.coralSoft,
    marginBottom: space.md,
  },
  agendaEmptyTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  agendaEmptyText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
  agendaEmptyButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: colors.coral,
    paddingHorizontal: 15,
    marginTop: space.lg,
  },
  agendaEmptyButtonText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  timeGridShell: { flexDirection: 'row', backgroundColor: colors.surface },
  fixedTimeGutter: { width: TIME_GUTTER, backgroundColor: '#FFFFFF', zIndex: 2 },
  gmt: { color: colors.muted, fontSize: 9, fontWeight: '600' },
  timeCanvas: { backgroundColor: colors.surface },
  dayCanvas: { flex: 1, overflow: 'hidden', backgroundColor: colors.surface },
  timeColumns: { flexDirection: 'row' },
  timeLabel: {
    height: SLOT_HEIGHT,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E4E4E4',
    paddingTop: 5,
  },
  timeLabelText: { color: colors.muted, fontSize: 9, lineHeight: 13 },
  timeColumn: { position: 'relative', borderRightWidth: 1, borderColor: '#E4E4E4' },
  timeSlot: { height: SLOT_HEIGHT, borderBottomWidth: 1, borderColor: '#E4E4E4' },
  timeEvent: {
    position: 'absolute',
    borderLeftWidth: 3.5,
    borderRadius: 8,
    padding: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  timeEventTime: { fontSize: 9.5, lineHeight: 13, fontWeight: '700' },
  timeEventName: { color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 1 },
  timeEventService: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 1 },
});
