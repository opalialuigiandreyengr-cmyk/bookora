import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/app-text';
import { Button, Card, EmptyState, Field, Screen } from '@/components/ui';
import { goBackOrReplace } from '@/lib/navigation';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';
import type { ReportSchedule } from '@/types';

type ReportPreset = 'month' | '30d' | '7d' | 'all';

const parsePrice = (raw?: string, finalAmount?: number | null) =>
  finalAmount != null
    ? Number(finalAmount) || 0
    : Number(String(raw || '0').replace(/[^0-9.-]/g, '')) || 0;

const money = (value: number) =>
  value.toLocaleString('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 });
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const monthStartKey = () => `${todayKey().slice(0, 8)}01`;
const dateKeyDaysAgo = (days: number) => {
  const date = new Date(`${todayKey()}T12:00:00+08:00`);
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
};
const isDateKey = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00+08:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) === value;
};
const paymentDateKey = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ''
    : parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
};
const PRESET_LABELS: Record<ReportPreset, string> = {
  month: 'This month',
  '30d': 'Last 30 days',
  '7d': 'Last 7 days',
  all: 'All time',
};

export default function ReportsScreen() {
  const { appointments, payments, staff, reportSchedule, saveReportSchedule, refreshing, refresh } = useApp();
  const [from, setFrom] = useState(monthStartKey);
  const [to, setTo] = useState(todayKey);
  const [staffFilter, setStaffFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activePreset, setActivePreset] = useState<ReportPreset | null>('month');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<ReportSchedule | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const schedule = scheduleDraft ?? reportSchedule;

  const updateSchedule = (patch: Partial<ReportSchedule>) => {
    setScheduleDraft((current) => ({ ...(current ?? reportSchedule), ...patch }));
  };

  const applyPreset = (preset: ReportPreset) => {
    const end = todayKey();
    setActivePreset(preset);
    setTo(end);
    if (preset === 'month') setFrom(monthStartKey());
    else if (preset === 'all') setFrom('2020-01-01');
    else setFrom(dateKeyDaysAgo(preset === '30d' ? 29 : 6));
  };

  const dateRangeError = useMemo(() => {
    if (!isDateKey(from) || !isDateKey(to)) return 'Use dates in YYYY-MM-DD format.';
    if (from > to) return 'The start date must be on or before the end date.';
    return '';
  }, [from, to]);

  const filtered = useMemo(
    () => {
      if (dateRangeError) return [];
      return appointments.filter(
        (item) =>
          item.appointment_date >= from &&
          item.appointment_date <= to &&
          (staffFilter === 'all' || item.staff_member_id === staffFilter) &&
          (statusFilter === 'all' || item.status === statusFilter)
      );
    },
    [appointments, dateRangeError, from, staffFilter, statusFilter, to]
  );

  const activeAppointments = filtered.filter((item) => !['cancelled', 'no_show'].includes(item.status));
  const completedCount = filtered.filter((item) => item.status === 'completed').length;
  const cancelledCount = filtered.filter((item) => item.status === 'cancelled').length;
  const noShowCount = filtered.filter((item) => item.status === 'no_show').length;
  const bookedRevenue = activeAppointments.reduce(
    (total, item) => total + parsePrice(item.total_price, item.final_total_amount),
    0
  );
  const completionRate = activeAppointments.length
    ? Math.round((completedCount / activeAppointments.length) * 100)
    : 0;

  const firstByCustomer = useMemo(() => {
    const first = new Map<string, string>();
    [...appointments]
      .sort((a, b) =>
        `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`)
      )
      .forEach((item) => {
        const key = (item.customer_email || item.customer_name).trim().toLowerCase();
        if (key && !first.has(key)) first.set(key, item.id);
      });
    return first;
  }, [appointments]);

  const newCustomers = filtered.filter(
    (item) => firstByCustomer.get((item.customer_email || item.customer_name).trim().toLowerCase()) === item.id
  ).length;
  const returningBookings = Math.max(0, filtered.length - newCustomers);
  const repeatShare = filtered.length ? Math.round((returningBookings / filtered.length) * 100) : 0;
  const filteredIds = new Set(filtered.map((item) => item.id));
  const matchedPayments = payments.filter(
    (payment) =>
      payment.status === 'paid' &&
      payment.transaction_type !== 'refund' &&
      payment.appointment_id &&
      filteredIds.has(payment.appointment_id)
  );
  const unmatchedPayments = payments.filter(
    (payment) => {
      const date = paymentDateKey(payment.created_at);
      return (
        !dateRangeError &&
        payment.status === 'paid' &&
        payment.transaction_type !== 'refund' &&
        !payment.appointment_id &&
        date >= from &&
        date <= to
      );
    }
  );
  const collectedTotal = matchedPayments.reduce((total, payment) => total + Number(payment.amount || 0), 0);

  const topServices = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((item) => counts.set(item.service_names, (counts.get(item.service_names) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filtered]);

  const dailyTrend = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((item) => counts.set(item.appointment_date, (counts.get(item.appointment_date) || 0) + 1));
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-7);
  }, [filtered]);

  const byStaff = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((item) => {
      const name = staff.find((member) => member.id === item.staff_member_id)?.full_name || 'Unassigned';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered, staff]);

  const exportReportCsv = async () => {
    const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Date', 'Client', 'Email', 'Service', 'Status', 'Value'],
      ...filtered.map((item) => [
        item.appointment_date,
        item.customer_name,
        item.customer_email || '',
        item.service_names,
        item.status,
        parsePrice(item.total_price, item.final_total_amount).toFixed(2),
      ]),
    ];
    try {
      await Share.share({
        title: `bookora-report-${from}-${to}.csv`,
        message: rows.map((row) => row.map(csvCell).join(',')).join('\n'),
      });
    } catch {
      // Share dismissed.
    }
  };

  const handleSaveSchedule = async () => {
    if (schedule.enabled && !/^\S+@\S+\.\S+$/.test(schedule.recipient_email.trim())) {
      Alert.alert('Invalid email', 'Add a valid report recipient email.');
      return;
    }
    setSavingSchedule(true);
    const error = await saveReportSchedule(schedule);
    setSavingSchedule(false);
    if (error) Alert.alert('Could not save schedule', error);
    else {
      setScheduleDraft(null);
      Alert.alert('Saved', 'Report schedule updated.');
    }
  };

  const maxServiceCount = topServices[0]?.[1] || 1;
  const maxTrendCount = Math.max(1, ...dailyTrend.map(([, count]) => count));
  const activeFilterCount = Number(statusFilter !== 'all') + Number(staffFilter !== 'all');

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={refresh}
      backgroundColor={colors.surface}
      style={styles.screen}
      fixedHeader={
        <View style={styles.pageHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} onPress={() => goBackOrReplace('/(tabs)/more')} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <Text pointerEvents="none" style={styles.pageTitle}>Reports & analytics</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Export report CSV" hitSlop={8} onPress={() => void exportReportCsv()} style={styles.headerButton}>
            <Ionicons name="download-outline" size={20} color={colors.ink} />
          </Pressable>
        </View>
      }
    >
      <View style={styles.periodSection}>
        <View style={styles.headingRow}>
          <View>
            <Text style={styles.eyebrow}>Performance period</Text>
            <Text style={styles.periodTitle}>{activePreset ? PRESET_LABELS[activePreset] : 'Custom range'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersOpen }}
            onPress={() => setFiltersOpen((open) => !open)}
            style={[styles.filterButton, (filtersOpen || activeFilterCount > 0) && styles.filterButtonActive]}
          >
            <Ionicons name="options-outline" size={17} color={filtersOpen ? colors.coral : colors.ink} />
            <Text style={[styles.filterButtonText, filtersOpen && styles.filterButtonTextActive]}>Filters</Text>
            {activeFilterCount > 0 ? <Text style={styles.filterCount}>{activeFilterCount}</Text> : null}
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {(['month', '30d', '7d', 'all'] as const).map((preset) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: activePreset === preset }} key={preset} onPress={() => applyPreset(preset)} style={[styles.presetChip, activePreset === preset && styles.presetChipActive]}>
              <Text style={[styles.presetChipText, activePreset === preset && styles.presetChipTextActive]}>{PRESET_LABELS[preset]}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {filtersOpen ? (
          <View style={styles.filterPanel}>
            <View style={styles.dateRow}>
              <View style={styles.flexOne}><Field label="From" value={from} onChangeText={(value) => { setFrom(value); setActivePreset(null); }} placeholder="YYYY-MM-DD" /></View>
              <View style={styles.flexOne}><Field label="To" value={to} onChangeText={(value) => { setTo(value); setActivePreset(null); }} placeholder="YYYY-MM-DD" /></View>
            </View>
            {dateRangeError ? <Text accessibilityRole="alert" style={styles.dateError}>{dateRangeError}</Text> : null}
            <FilterRail
              label="Appointment status"
              value={statusFilter}
              options={['all', 'approved', 'pending', 'completed', 'cancelled', 'no_show']}
              optionLabel={(value) => value === 'all' ? 'All statuses' : value.replace('_', ' ')}
              onChange={setStatusFilter}
            />
            {staff.length > 0 ? (
              <FilterRail
                label="Team member"
                value={staffFilter}
                options={['all', ...staff.map((member) => member.id)]}
                optionLabel={(value) => value === 'all' ? 'All staff' : staff.find((member) => member.id === value)?.full_name || 'Staff'}
                onChange={setStaffFilter}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {!filtered.length ? (
        <EmptyState icon="bar-chart-outline" title="No report data for this period" message="Choose a wider period or adjust the active filters." actionLabel="Show all time" onAction={() => applyPreset('all')} />
      ) : (
        <>
          <View style={styles.financePanel}>
            <View style={styles.financeTopRow}>
              <View>
                <Text style={styles.financeLabel}>Booked value</Text>
                <Text style={styles.financeValue}>{money(bookedRevenue)}</Text>
              </View>
              <View style={styles.periodBadge}>
                <Ionicons name="calendar-outline" size={13} color={colors.navy} />
                <Text style={styles.periodBadgeText}>{filtered.length} bookings</Text>
              </View>
            </View>
            <View style={styles.financeDivider} />
            <View style={styles.financeStats}>
              <Stat value={money(collectedTotal)} label="Collected" />
              <View style={styles.financeStatDivider} />
              <Stat value={`${completionRate}%`} label="Completion" />
              <View style={styles.financeStatDivider} />
              <Stat value={`${repeatShare}%`} label="Repeat share" />
            </View>
          </View>

          <Section title="Booking health" subtitle="How appointments moved through the period">
            <View style={styles.healthGrid}>
              <HealthMetric icon="checkmark-circle-outline" value={completedCount} label="Completed" background={colors.mint} color={colors.success} />
              <HealthMetric icon="close-circle-outline" value={cancelledCount} label="Cancelled" background={colors.peach} color={colors.warning} />
              <HealthMetric icon="person-add-outline" value={newCustomers} label="New clients" background={colors.lilac} color={colors.navy} />
              <HealthMetric icon="remove-circle-outline" value={noShowCount} label="No-shows" background={colors.coralSoft} color={colors.coral} />
            </View>
          </Section>

          {dailyTrend.length > 0 ? (
            <Section title="Booking activity" subtitle="Latest active dates in this period">
              <View style={styles.listGap}>
                {dailyTrend.map(([date, count]) => (
                  <View key={date} style={styles.trendRow}>
                    <Text style={styles.trendDate}>{new Date(`${date}T12:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</Text>
                    <View style={styles.barTrack}><View style={[styles.barFillNavy, { width: `${Math.max(10, Math.round((count / maxTrendCount) * 100))}%` }]} /></View>
                    <Text style={styles.trendCount}>{count}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          <Section title="Top services" subtitle="Most frequently booked in this period">
            <View style={styles.listGap}>
              {topServices.map(([serviceName, count], index) => (
                <View key={serviceName} style={styles.rankRow}>
                  <Text style={styles.rankNumber}>{String(index + 1).padStart(2, '0')}</Text>
                  <View style={styles.rankCopy}>
                    <View style={styles.barHeader}>
                      <Text numberOfLines={1} style={styles.barLabel}>{serviceName}</Text>
                      <Text style={styles.barCount}>{count}</Text>
                    </View>
                    <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(10, Math.round((count / maxServiceCount) * 100))}%` }]} /></View>
                  </View>
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.twoColumnRow}>
            <CompactPanel label="Client mix" value={returningBookings} hint="returning bookings" meta={`${newCustomers} new clients`} />
            <CompactPanel label="Payments" value={matchedPayments.length} hint="matched payments" meta={`${unmatchedPayments.length} unmatched`} warning={unmatchedPayments.length > 0} />
          </View>

          {byStaff.length > 0 ? (
            <Section title="Team contribution" subtitle="Bookings handled by each team member">
              {byStaff.map(([name, count], index) => (
                <View key={name} style={[styles.teamRow, index === byStaff.length - 1 && styles.lastRow]}>
                  <View style={styles.teamAvatar}><Text style={styles.teamAvatarText}>{name.charAt(0).toUpperCase()}</Text></View>
                  <Text numberOfLines={1} style={styles.teamName}>{name}</Text>
                  <Text style={styles.teamCount}>{count} bookings</Text>
                </View>
              ))}
            </Section>
          ) : null}
        </>
      )}

      <Card style={styles.scheduleCard}>
        <View style={styles.scheduleHeader}>
          <View style={styles.scheduleIcon}><Ionicons name="mail-outline" size={19} color={colors.coral} /></View>
          <View style={styles.flexOne}>
            <Text style={styles.sectionTitle}>Scheduled report</Text>
            <Text style={styles.sectionSubtitle}>Send a summary automatically.</Text>
          </View>
          <Switch accessibilityLabel="Enable scheduled reports" value={schedule.enabled} onValueChange={(enabled) => updateSchedule({ enabled })} trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }} thumbColor={schedule.enabled ? colors.coral : '#fff'} />
        </View>
        {schedule.enabled ? (
          <View style={styles.scheduleFields}>
            <Field label="Recipient email" value={schedule.recipient_email} onChangeText={(recipient_email) => updateSchedule({ recipient_email })} placeholder="owner@business.com" keyboardType="email-address" />
            <View style={styles.segmentedControl}>
              {(['weekly', 'monthly'] as const).map((frequency) => (
                <Pressable accessibilityRole="button" accessibilityState={{ selected: schedule.frequency === frequency }} key={frequency} onPress={() => updateSchedule({ frequency, send_day: frequency === 'weekly' ? Math.min(schedule.send_day, 7) : schedule.send_day })} style={[styles.segment, schedule.frequency === frequency && styles.segmentActive]}>
                  <Text style={[styles.segmentText, schedule.frequency === frequency && styles.segmentTextActive]}>{frequency}</Text>
                </Pressable>
              ))}
            </View>
            <Field label={schedule.frequency === 'weekly' ? 'Send weekday (1–7)' : 'Send day of month (1–28)'} value={String(schedule.send_day)} onChangeText={(value) => updateSchedule({ send_day: Math.max(1, Math.min(schedule.frequency === 'weekly' ? 7 : 28, Number(value) || 1)) })} keyboardType="numeric" />
          </View>
        ) : null}
        <Button label={savingSchedule ? 'Saving…' : 'Save report schedule'} disabled={savingSchedule} icon="checkmark" onPress={() => void handleSaveSchedule()} />
      </Card>
    </Screen>
  );
}

function FilterRail({ label, value, options, optionLabel, onChange }: { label: string; value: string; options: string[]; optionLabel: (value: string) => string; onChange: (value: string) => void }) {
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {options.map((option) => (
          <Pressable key={option} onPress={() => onChange(option)} style={[styles.filterPill, value === option && styles.filterPillActive]}>
            <Text style={[styles.filterPillText, value === option && styles.filterPillTextActive]}>{optionLabel(option)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <View style={styles.sectionBlock}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text>{children}</View>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.financeStat}><Text numberOfLines={1} adjustsFontSizeToFit style={styles.financeStatValue}>{value}</Text><Text style={styles.financeStatLabel}>{label}</Text></View>;
}

function HealthMetric({ icon, value, label, background, color }: { icon: ComponentProps<typeof Ionicons>['name']; value: number; label: string; background: string; color: string }) {
  return <View style={[styles.healthItem, { backgroundColor: background }]}><Ionicons name={icon} size={19} color={color} /><Text style={styles.healthValue}>{value}</Text><Text style={styles.healthLabel}>{label}</Text></View>;
}

function CompactPanel({ label, value, hint, meta, warning = false }: { label: string; value: number; hint: string; meta: string; warning?: boolean }) {
  return <View style={styles.compactPanel}><Text style={styles.compactLabel}>{label}</Text><Text style={styles.compactValue}>{value}</Text><Text style={styles.compactHint}>{hint}</Text><Text style={[styles.compactMeta, warning && { color: colors.warning }]}>{meta}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: 14, paddingBottom: 80, gap: space.xl },
  pageHeader: { height: 44, marginTop: space.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, backgroundColor: colors.surface, zIndex: 10 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { position: 'absolute', left: 58, right: 58, color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  periodSection: { gap: space.md },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  eyebrow: { color: colors.muted, fontSize: 10.5, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  periodTitle: { color: colors.ink, fontSize: 21, lineHeight: 27, fontWeight: '800', marginTop: 2 },
  filterButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 11, backgroundColor: colors.surface },
  filterButtonActive: { borderColor: '#F5C4BE', backgroundColor: colors.coralSoft },
  filterButtonText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  filterButtonTextActive: { color: colors.coral },
  filterCount: { minWidth: 18, height: 18, borderRadius: 9, overflow: 'hidden', backgroundColor: colors.coral, color: '#FFFFFF', fontSize: 10, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  chipsRow: { gap: 7, paddingVertical: 1 },
  presetChip: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 13, backgroundColor: colors.surface },
  presetChipActive: { borderColor: colors.navy, backgroundColor: colors.navy },
  presetChipText: { color: colors.muted, fontSize: 11.5, fontWeight: '700' },
  presetChipTextActive: { color: '#FFFFFF' },
  filterPanel: { gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: space.md },
  dateRow: { flexDirection: 'row', gap: space.sm },
  dateError: { color: colors.danger, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  flexOne: { flex: 1 },
  filterGroup: { gap: 7 },
  filterLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  filterPill: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 12, backgroundColor: colors.surface },
  filterPillActive: { borderColor: colors.navy, backgroundColor: colors.navy },
  filterPillText: { color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  filterPillTextActive: { color: '#FFFFFF' },
  financePanel: { borderRadius: 18, backgroundColor: colors.navy, padding: space.lg },
  financeTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  financeLabel: { color: '#C8D3DD', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  financeValue: { color: '#FFFFFF', fontSize: 29, lineHeight: 36, fontWeight: '800', marginTop: 3 },
  periodBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, backgroundColor: '#EEF3F7', paddingHorizontal: 9, paddingVertical: 6 },
  periodBadgeText: { color: colors.navy, fontSize: 10, fontWeight: '700' },
  financeDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#52677A', marginVertical: space.lg },
  financeStats: { flexDirection: 'row', alignItems: 'center' },
  financeStat: { flex: 1, minWidth: 0 },
  financeStatDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: '#52677A', marginHorizontal: 9 },
  financeStatValue: { color: '#FFFFFF', fontSize: 14, lineHeight: 19, fontWeight: '800' },
  financeStatLabel: { color: '#C8D3DD', fontSize: 9.5, lineHeight: 13, marginTop: 2 },
  sectionBlock: { gap: space.md },
  sectionTitle: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  sectionSubtitle: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: -8 },
  healthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  healthItem: { width: '48%', minHeight: 104, borderRadius: 14, padding: 13 },
  healthValue: { color: colors.ink, fontSize: 22, lineHeight: 27, fontWeight: '800', marginTop: 7 },
  healthLabel: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 1 },
  listGap: { gap: 11 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  trendDate: { width: 48, color: colors.muted, fontSize: 10.5, fontWeight: '600' },
  trendCount: { width: 22, color: colors.ink, fontSize: 11, fontWeight: '800', textAlign: 'right' },
  barTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: '#EEEAE5', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: colors.coral },
  barFillNavy: { height: '100%', borderRadius: 4, backgroundColor: colors.navy },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankNumber: { width: 24, color: colors.coral, fontSize: 11, fontWeight: '800' },
  rankCopy: { flex: 1, gap: 6 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  barLabel: { flex: 1, color: colors.ink, fontSize: 12.5, fontWeight: '700' },
  barCount: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  twoColumnRow: { flexDirection: 'row', gap: 10 },
  compactPanel: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 13, backgroundColor: colors.surface },
  compactLabel: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  compactValue: { color: colors.ink, fontSize: 24, lineHeight: 29, fontWeight: '800', marginTop: 8 },
  compactHint: { color: colors.ink, fontSize: 10.5, fontWeight: '600' },
  compactMeta: { color: colors.muted, fontSize: 10, marginTop: 8 },
  teamRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  lastRow: { borderBottomWidth: 0 },
  teamAvatar: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lilac },
  teamAvatarText: { color: colors.navy, fontSize: 12, fontWeight: '800' },
  teamName: { flex: 1, color: colors.ink, fontSize: 12.5, fontWeight: '700' },
  teamCount: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  scheduleCard: { gap: space.lg, borderRadius: 16, padding: space.lg },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scheduleIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coralSoft },
  scheduleFields: { gap: space.md },
  segmentedControl: { flexDirection: 'row', borderRadius: 10, backgroundColor: colors.canvas, padding: 3 },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontSize: 11.5, fontWeight: '700', textTransform: 'capitalize' },
  segmentTextActive: { color: colors.ink },
});
