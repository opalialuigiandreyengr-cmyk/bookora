import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';

import { Text } from '@/components/app-text';
import { NewAppointmentModal } from '@/components/calendar/NewAppointmentModal';
import { Card, EmptyState, Screen, StatusBadge } from '@/components/ui';
import { openExternalLink } from '@/lib/external-links';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';

const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const money = (value: number) =>
  value.toLocaleString('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

const parseAmount = (raw?: string | number | null) =>
  Number(String(raw ?? '0').replace(/[^0-9.-]+/g, '')) || 0;

const AVATAR_TONES = [
  { bg: colors.coralSoft, text: colors.danger },
  { bg: colors.lilac, text: colors.navy },
  { bg: colors.mint, text: colors.success },
  { bg: colors.peach, text: colors.warning },
];

export default function Dashboard() {
  const {
    appointments,
    clients,
    services,
    payments,
    businessName,
    session,
    publicBookingUrl,
    addAppointment,
    updateAppointmentStatus,
    refreshing,
    refresh,
    error,
  } = useApp();

  const [showNewAppointment, setShowNewAppointment] = useState(false);
  const [chartMode, setChartMode] = useState<'bookings' | 'revenue'>('bookings');
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  const userMetadata = session?.user.user_metadata ?? {};
  const avatarUrl = String(
    userMetadata.avatar_url ??
      userMetadata.picture ??
      userMetadata.photo_url ??
      userMetadata.profile_image_url ??
      ''
  ).trim();
  const userDisplayName = String(
    userMetadata.full_name ??
      userMetadata.name ??
      session?.user.email?.split('@')[0] ??
      businessName
  ).trim();
  const userInitials =
    userDisplayName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  const today = todayKey();
  const monthPrefix = today.slice(0, 7); // YYYY-MM

  const todayAppointments = useMemo(
    () =>
      appointments.filter(
        (item) => item.appointment_date === today && !['cancelled', 'no_show'].includes(item.status)
      ),
    [appointments, today]
  );

  const monthAppointments = useMemo(
    () => appointments.filter((item) => item.appointment_date.startsWith(monthPrefix)),
    [appointments, monthPrefix]
  );

  const paidPaymentsThisMonth = useMemo(
    () =>
      payments.filter(
        (item) =>
          item.status === 'paid' &&
          item.transaction_type !== 'refund' &&
          item.created_at.startsWith(monthPrefix)
      ),
    [payments, monthPrefix]
  );

  const monthRevenue = useMemo(
    () => paidPaymentsThisMonth.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [paidPaymentsThisMonth]
  );

  const avgTicket = useMemo(() => {
    if (paidPaymentsThisMonth.length > 0) {
      return Math.round(monthRevenue / paidPaymentsThisMonth.length);
    }
    const activeMonthAppts = monthAppointments.filter(
      (item) => !['cancelled', 'no_show'].includes(item.status)
    );
    if (!activeMonthAppts.length) return 0;
    const total = activeMonthAppts.reduce(
      (sum, item) => sum + (item.final_total_amount ?? parseAmount(item.total_price)),
      0
    );
    return Math.round(total / activeMonthAppts.length);
  }, [monthAppointments, monthRevenue, paidPaymentsThisMonth]);

  const newClientsThisMonth = useMemo(
    () => clients.filter((item) => (item.created_at || '').startsWith(monthPrefix)).length,
    [clients, monthPrefix]
  );

  const completedThisMonth = useMemo(
    () => monthAppointments.filter((item) => item.status === 'completed').length,
    [monthAppointments]
  );

  const noShowThisMonth = useMemo(
    () => monthAppointments.filter((item) => item.status === 'no_show').length,
    [monthAppointments]
  );

  const completionRate = useMemo(() => {
    if (!monthAppointments.length) return 0;
    const activeOrDone = monthAppointments.filter((item) =>
      ['completed', 'approved', 'pending'].includes(item.status)
    ).length;
    return Math.round((activeOrDone / monthAppointments.length) * 100);
  }, [monthAppointments]);

  // 7-Day Activity Series (Past 6 days + Today)
  const last7DaysSeries = useMemo(() => {
    const baseDate = new Date(`${today}T12:00:00`);
    return Array.from({ length: 7 }, (_, idx) => {
      const offset = idx - 6;
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + offset);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayAppts = appointments.filter(
        (a) => a.appointment_date === key && !['cancelled', 'no_show'].includes(a.status)
      );
      const dayPaid = payments
        .filter(
          (p) =>
            p.status === 'paid' &&
            p.transaction_type !== 'refund' &&
            p.created_at.slice(0, 10) === key
        )
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const fallbackRev = dayAppts.reduce(
        (sum, a) => sum + (a.final_total_amount ?? parseAmount(a.total_price)),
        0
      );
      return {
        key,
        label,
        isToday: key === today,
        bookings: dayAppts.length,
        revenue: dayPaid > 0 ? dayPaid : fallbackRev,
      };
    });
  }, [appointments, payments, today]);

  const maxChartVal = useMemo(() => {
    const vals = last7DaysSeries.map((item) =>
      chartMode === 'bookings' ? item.bookings : item.revenue
    );
    return Math.max(...vals, 1);
  }, [chartMode, last7DaysSeries]);

  const sevenDayTotal = useMemo(
    () =>
      last7DaysSeries.reduce(
        (sum, item) => sum + (chartMode === 'bookings' ? item.bookings : item.revenue),
        0
      ),
    [chartMode, last7DaysSeries]
  );

  // Status Distribution Breakdown
  const statusDistribution = useMemo(() => {
    const total = Math.max(appointments.length, 1);
    const counts = {
      approved: appointments.filter((a) => a.status === 'approved').length,
      pending: appointments.filter((a) => a.status === 'pending').length,
      completed: appointments.filter((a) => a.status === 'completed').length,
      cancelled: appointments.filter((a) => ['cancelled', 'no_show'].includes(a.status)).length,
    };
    return [
      {
        key: 'approved',
        label: 'Approved',
        count: counts.approved,
        pct: Math.round((counts.approved / total) * 100),
        color: '#059669',
      },
      {
        key: 'pending',
        label: 'Pending',
        count: counts.pending,
        pct: Math.round((counts.pending / total) * 100),
        color: '#D97706',
      },
      {
        key: 'completed',
        label: 'Completed',
        count: counts.completed,
        pct: Math.round((counts.completed / total) * 100),
        color: '#0CA678',
      },
      {
        key: 'cancelled',
        label: 'Cancelled / No-show',
        count: counts.cancelled,
        pct: Math.round((counts.cancelled / total) * 100),
        color: '#DC2626',
      },
    ];
  }, [appointments]);

  // Top Booked Services
  const topServices = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number }>();
    for (const appt of appointments) {
      if (['cancelled', 'no_show'].includes(appt.status)) continue;
      const names = (appt.service_names || 'Service')
        .split('+')
        .map((s) => s.trim())
        .filter(Boolean);
      const rev = appt.final_total_amount ?? parseAmount(appt.total_price);
      for (const name of names) {
        const prev = map.get(name) ?? { name, count: 0, revenue: 0 };
        prev.count += 1;
        prev.revenue += Math.round(rev / Math.max(names.length, 1));
        map.set(name, prev);
      }
    }
    const sorted = Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
    const maxCount = Math.max(...sorted.map((s) => s.count), 1);
    return sorted.map((s) => ({ ...s, ratio: Math.round((s.count / maxCount) * 100) }));
  }, [appointments]);

  const pendingAppointments = useMemo(
    () => appointments.filter((item) => item.status === 'pending'),
    [appointments]
  );

  const upcomingAppointments = useMemo(
    () =>
      appointments
        .filter((item) => !['cancelled', 'no_show'].includes(item.status) && item.appointment_date >= today)
        .slice(0, 6),
    [appointments, today]
  );

  const visibleServicesCount = useMemo(
    () => services.filter((item) => item.show_on_booking_page !== false).length,
    [services]
  );

  const shareBookingLink = async () => {
    try {
      await Share.share({
        message: `Book your appointment with ${businessName}: ${publicBookingUrl}`,
        url: publicBookingUrl,
      });
    } catch {
      // Share dismissed
    }
  };

  const quickApprove = async (id: string) => {
    const err = await updateAppointmentStatus(id, 'approved');
    if (err) Alert.alert('Could not approve booking', err);
  };

  return (
    <>
      <Screen
        refreshing={refreshing}
        onRefresh={refresh}
        backgroundColor="#FFFFFF"
        floatingAction={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New appointment"
            onPress={() => setShowNewAppointment(true)}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          >
            <Ionicons name="add" size={25} color="#FFFFFF" />
          </Pressable>
        }
      >
        <View style={styles.headerLine}>
          <Text style={styles.title}>Dashboard</Text>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/notifications')}
              style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
            >
              <Ionicons name="notifications-outline" size={19} color={colors.ink} />
              {pendingAppointments.length > 0 ? <View style={styles.notificationDot} /> : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Settings for ${userDisplayName || 'your profile'}`}
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
            >
              {avatarUrl && avatarUrl !== failedAvatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  transition={120}
                  onError={() => setFailedAvatarUrl(avatarUrl)}
                />
              ) : (
                <Text style={styles.avatarText}>{userInitials}</Text>
              )}
            </Pressable>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Public Booking Link Bar */}
        <Card style={styles.bookingBar}>
          <View style={styles.bookingBarLeft}>
            <View style={styles.bookingBarIcon}>
              <Ionicons name="globe-outline" size={17} color={colors.coral} />
            </View>
            <View style={styles.bookingBarCopy}>
              <Text style={styles.bookingBarLabel}>Booking link</Text>
              <Text numberOfLines={1} style={styles.bookingBarUrl}>
                {publicBookingUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </Text>
            </View>
          </View>
          <View style={styles.bookingBarActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share booking link"
              onPress={() => void shareBookingLink()}
              style={({ pressed }) => [styles.bookingBarBtn, pressed && styles.pressed]}
            >
              <Ionicons name="share-social-outline" size={15} color={colors.ink} />
              <Text style={styles.bookingBarBtnText}>Share</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open booking page"
              onPress={() => {
                void openExternalLink(publicBookingUrl).then((opened) => {
                  if (!opened) {
                    Alert.alert('Could not open booking page', 'Please check the booking link and try again.');
                  }
                });
              }}
              style={({ pressed }) => [styles.bookingBarIconBtn, pressed && styles.pressed]}
            >
              <Ionicons name="open-outline" size={15} color={colors.navy} />
            </Pressable>
          </View>
        </Card>

        {/* 2x2 KPI Grid */}
        <View style={styles.kpiGrid}>
          {/* KPI 1: Today's Bookings */}
          <Pressable
            onPress={() => router.push('/(tabs)/calendar')}
            style={({ pressed }) => [styles.kpiCard, pressed && styles.pressed]}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconBadge, { backgroundColor: '#FFF1F0', borderColor: '#FADCD8' }]}>
                <Ionicons name="calendar-outline" size={16} color={colors.coral} />
              </View>
              <View
                style={[
                  styles.kpiPill,
                  {
                    backgroundColor: pendingAppointments.length > 0 ? '#FFFBEB' : '#ECFDF5',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.kpiPillText,
                    { color: pendingAppointments.length > 0 ? '#D97706' : '#059669' },
                  ]}
                >
                  {pendingAppointments.length > 0 ? `${pendingAppointments.length} pending` : 'Active'}
                </Text>
              </View>
            </View>
            <Text style={styles.kpiValue}>{todayAppointments.length}</Text>
            <Text style={styles.kpiLabel}>Today’s bookings</Text>
            <Text style={styles.kpiMeta}>{monthAppointments.length} total this month</Text>
          </Pressable>

          {/* KPI 2: Monthly Revenue */}
          <Pressable
            onPress={() => router.push('/(tabs)/payments')}
            style={({ pressed }) => [styles.kpiCard, pressed && styles.pressed]}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <Ionicons name="wallet-outline" size={16} color="#059669" />
              </View>
              <View style={[styles.kpiPill, { backgroundColor: '#ECFDF5' }]}>
                <Text style={[styles.kpiPillText, { color: '#059669' }]}>Paid</Text>
              </View>
            </View>
            <Text style={styles.kpiValue} numberOfLines={1}>
              {money(monthRevenue)}
            </Text>
            <Text style={styles.kpiLabel}>Monthly revenue</Text>
            <Text style={styles.kpiMeta} numberOfLines={1}>
              Avg {money(avgTicket)} / visit
            </Text>
          </Pressable>

          {/* KPI 3: Total Clients */}
          <Pressable
            onPress={() => router.push('/(tabs)/clients')}
            style={({ pressed }) => [styles.kpiCard, pressed && styles.pressed]}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconBadge, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
                <Ionicons name="people-outline" size={16} color="#7C3AED" />
              </View>
              <View style={[styles.kpiPill, { backgroundColor: '#F5F3FF' }]}>
                <Text style={[styles.kpiPillText, { color: '#7C3AED' }]}>
                  +{newClientsThisMonth} new
                </Text>
              </View>
            </View>
            <Text style={styles.kpiValue}>{clients.length}</Text>
            <Text style={styles.kpiLabel}>Total clients</Text>
            <Text style={styles.kpiMeta}>{newClientsThisMonth} joined this month</Text>
          </Pressable>

          {/* KPI 4: Completion Rate */}
          <Pressable
            onPress={() => router.push('/reports')}
            style={({ pressed }) => [styles.kpiCard, pressed && styles.pressed]}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconBadge, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <Ionicons name="stats-chart-outline" size={16} color="#D97706" />
              </View>
              <View style={[styles.kpiPill, { backgroundColor: '#FFFBEB' }]}>
                <Text style={[styles.kpiPillText, { color: '#D97706' }]}>{completionRate}%</Text>
              </View>
            </View>
            <Text style={styles.kpiValue}>{completionRate}%</Text>
            <Text style={styles.kpiLabel}>Completion rate</Text>
            <View style={styles.kpiProgressTrack}>
              <View
                style={[
                  styles.kpiProgressFill,
                  { width: `${Math.max(completionRate, 4)}%` },
                ]}
              />
            </View>
            <Text style={styles.kpiMeta}>
              {completedThisMonth} done · {noShowThisMonth} no-show
            </Text>
          </Pressable>
        </View>

        {/* Chart 1: 7-Day Activity Bar Chart */}
        <Card style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>Last 7 days</Text>
              <Text style={styles.chartSub}>
                {chartMode === 'bookings'
                  ? `${sevenDayTotal} booking${sevenDayTotal === 1 ? '' : 's'}`
                  : money(sevenDayTotal)}
              </Text>
            </View>
            <View style={styles.chartToggleGroup}>
              <Pressable
                onPress={() => setChartMode('bookings')}
                style={[
                  styles.chartToggleBtn,
                  chartMode === 'bookings' && styles.chartToggleBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.chartToggleText,
                    chartMode === 'bookings' && styles.chartToggleTextActive,
                  ]}
                >
                  Bookings
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setChartMode('revenue')}
                style={[
                  styles.chartToggleBtn,
                  chartMode === 'revenue' && styles.chartToggleBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.chartToggleText,
                    chartMode === 'revenue' && styles.chartToggleTextActive,
                  ]}
                >
                  Revenue
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.barChartRow}>
            {last7DaysSeries.map((day) => {
              const rawVal = chartMode === 'bookings' ? day.bookings : day.revenue;
              const heightPct = rawVal > 0 ? Math.max(Math.round((rawVal / maxChartVal) * 100), 14) : 6;
              const shortVal =
                chartMode === 'bookings'
                  ? String(rawVal)
                  : rawVal >= 1000
                    ? `${(rawVal / 1000).toFixed(1)}k`
                    : String(rawVal);
              return (
                <View key={day.key} style={styles.barCol}>
                  <Text
                    style={[
                      styles.barTopValue,
                      day.isToday && { color: colors.coral, fontWeight: '800' },
                    ]}
                    numberOfLines={1}
                  >
                    {rawVal > 0 ? shortVal : ''}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${heightPct}%`,
                          backgroundColor:
                            rawVal === 0
                              ? '#E2E8F0'
                              : day.isToday
                                ? colors.coral
                                : colors.navy,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.barDayLabel,
                      day.isToday && { color: colors.coral, fontWeight: '800' },
                    ]}
                  >
                    {day.isToday ? 'Today' : day.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>

        {/* Chart 2 & 3: Status Breakdown & Top Services */}
        <Card style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Booking status</Text>
            <Text style={styles.chartMetaLabel}>{appointments.length} total</Text>
          </View>

          {/* Segmented Horizontal Bar */}
          <View style={styles.segmentedBar}>
            {statusDistribution.map((seg) =>
              seg.count > 0 ? (
                <View
                  key={seg.key}
                  style={{
                    flex: Math.max(seg.count, 1),
                    backgroundColor: seg.color,
                    height: '100%',
                  }}
                />
              ) : null
            )}
            {appointments.length === 0 ? (
              <View style={{ flex: 1, backgroundColor: '#E2E8F0', height: '100%' }} />
            ) : null}
          </View>

          {/* 2x2 Legend Grid */}
          <View style={styles.statusLegendGrid}>
            {statusDistribution.map((seg) => (
              <View key={seg.key} style={styles.statusLegendBox}>
                <View style={styles.statusLegendTop}>
                  <View style={[styles.statusDot, { backgroundColor: seg.color }]} />
                  <Text style={styles.statusLegendLabel} numberOfLines={1}>
                    {seg.label}
                  </Text>
                </View>
                <View style={styles.statusLegendBottom}>
                  <Text style={styles.statusLegendCount}>{seg.count}</Text>
                  <Text style={styles.statusLegendPct}>{seg.pct}%</Text>
                </View>
              </View>
            ))}
          </View>
        </Card>

        {topServices.length > 0 ? (
          <Card style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Top services</Text>
              <Pressable onPress={() => router.push('/reports')}>
                <Text style={styles.link}>Full report</Text>
              </Pressable>
            </View>
            <View style={styles.topServicesList}>
              {topServices.map((svc) => (
                <View key={svc.name} style={styles.topServiceItem}>
                  <View style={styles.topServiceHeader}>
                    <Text style={styles.topServiceName} numberOfLines={1}>
                      {svc.name}
                    </Text>
                    <Text style={styles.topServiceStats}>
                      {svc.count} {svc.count === 1 ? 'booking' : 'bookings'} · {money(svc.revenue)}
                    </Text>
                  </View>
                  <View style={styles.topServiceTrack}>
                    <View
                      style={[
                        styles.topServiceFill,
                        { width: `${Math.max(svc.ratio, 8)}%` },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Pending Requests Queue */}
        {pendingAppointments.length > 0 ? (
          <Card style={styles.pendingCard}>
            <View style={styles.pendingHeader}>
              <View style={styles.pendingBadgeWrap}>
                <Ionicons name="time-outline" size={16} color={colors.warning} />
                <Text style={styles.pendingTitle}>
                  {pendingAppointments.length} pending request{pendingAppointments.length === 1 ? '' : 's'}
                </Text>
              </View>
              <Pressable onPress={() => router.push('/(tabs)/calendar')}>
                <Text style={styles.link}>Review all</Text>
              </Pressable>
            </View>
            {pendingAppointments.slice(0, 2).map((item) => (
              <View key={item.id} style={styles.pendingRow}>
                <Pressable
                  style={styles.pendingInfo}
                  onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
                >
                  <Text numberOfLines={1} style={styles.pendingClient}>
                    {item.customer_name}
                  </Text>
                  <Text numberOfLines={1} style={styles.pendingMeta}>
                    {item.service_names} · {item.appointment_date} at {item.appointment_time}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void quickApprove(item.id)}
                  style={({ pressed }) => [styles.approvePill, pressed && styles.pressed]}
                >
                  <Ionicons name="checkmark" size={14} color="#fff" />
                  <Text style={styles.approvePillText}>Approve</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Upcoming Appointments */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Upcoming appointments</Text>
          <Pressable onPress={() => router.push('/(tabs)/calendar')}>
            <Text style={styles.link}>Calendar</Text>
          </Pressable>
        </View>

        {upcomingAppointments.length > 0 ? (
          <View style={styles.upcomingList}>
            {upcomingAppointments.map((item) => {
              const initials = item.customer_name
                .split(/\s+/)
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              const tone = AVATAR_TONES[item.customer_name.length % AVATAR_TONES.length];
              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
                  style={({ pressed }) => [styles.appointmentCard, pressed && styles.pressed]}
                >
                  <View style={[styles.clientAvatar, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.clientAvatarText, { color: tone.text }]}>{initials || '?'}</Text>
                  </View>
                  <View style={styles.appointmentCopy}>
                    <Text numberOfLines={1} style={styles.client}>
                      {item.customer_name}
                    </Text>
                    <Text numberOfLines={1} style={styles.service}>
                      {item.service_names}
                    </Text>
                  </View>
                  <View style={styles.timeRight}>
                    <Text style={styles.time}>{item.appointment_time}</Text>
                    <Text style={styles.date}>
                      {item.appointment_date === today
                        ? 'Today'
                        : new Date(`${item.appointment_date}T12:00:00`).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                          })}
                    </Text>
                  </View>
                  <StatusBadge status={item.status} />
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => router.push('/(tabs)/calendar')}
              style={({ pressed }) => [styles.footerLinkBtn, pressed && styles.pressed]}
            >
              <Text style={styles.footerLinkText}>View all appointments</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.coral} />
            </Pressable>
          </View>
        ) : (
          <EmptyState
            icon="calendar-clear-outline"
            title="No upcoming appointments"
            message="New bookings will appear here automatically."
            actionLabel="New appointment"
            onAction={() => setShowNewAppointment(true)}
          />
        )}

        {/* Quick Shortcuts */}
        <View style={styles.snapshotSection}>
          <Text style={styles.sectionTitle}>Shortcuts</Text>
          <View style={styles.shortcutGrid}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New appointment"
              onPress={() => setShowNewAppointment(true)}
              style={({ pressed }) => [styles.shortcutTile, pressed && styles.shortcutTilePressed]}
            >
              <View style={[styles.snapshotBadge, { backgroundColor: colors.coralSoft }]}>
                <Ionicons name="calendar-outline" size={18} color={colors.coral} />
              </View>
              <Text style={styles.shortcutTitle}>New appointment</Text>
              <Text style={styles.shortcutSub}>Create a booking</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage services"
              onPress={() => router.push('/services')}
              style={({ pressed }) => [styles.shortcutTile, pressed && styles.shortcutTilePressed]}
            >
              <View style={[styles.snapshotBadge, { backgroundColor: colors.mint }]}>
                <Ionicons name="cut-outline" size={18} color={colors.success} />
              </View>
              <Text style={styles.shortcutTitle}>Services</Text>
              <Text style={styles.shortcutSub}>{visibleServicesCount} available</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Business hours"
              onPress={() => router.push({ pathname: '/settings', params: { section: 'Business hours' } })}
              style={({ pressed }) => [styles.shortcutTile, pressed && styles.shortcutTilePressed]}
            >
              <View style={[styles.snapshotBadge, { backgroundColor: colors.lilac }]}>
                <Ionicons name="time-outline" size={18} color={colors.navy} />
              </View>
              <Text style={styles.shortcutTitle}>Business hours</Text>
              <Text style={styles.shortcutSub}>Hours, breaks & time off</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View reports"
              onPress={() => router.push('/reports')}
              style={({ pressed }) => [styles.shortcutTile, pressed && styles.shortcutTilePressed]}
            >
              <View style={[styles.snapshotBadge, { backgroundColor: colors.peach }]}>
                <Ionicons name="bar-chart-outline" size={18} color={colors.warning} />
              </View>
              <Text style={styles.shortcutTitle}>Reports</Text>
              <Text style={styles.shortcutSub}>Review performance</Text>
            </Pressable>
          </View>
        </View>
      </Screen>

      <NewAppointmentModal
        key={showNewAppointment ? 'overview-new-open' : 'overview-new-closed'}
        visible={showNewAppointment}
        defaultDate={today}
        defaultTime="10:00"
        services={services}
        existingAppointments={appointments}
        staffName={businessName}
        onClose={() => setShowNewAppointment(false)}
        onCreate={async (payload) => {
          const err = await addAppointment({ ...payload, status: payload.status || 'approved' });
          if (err) {
            Alert.alert('Could not create appointment', err);
            return false;
          }
          return true;
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    minHeight: 36,
  },
  title: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.coral,
  },
  avatar: {
    width: 36,
    height: 36,
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 12 },
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
  pressed: { opacity: 0.78 },
  error: { color: colors.danger, fontSize: 13 },
  bookingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  bookingBarLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  bookingBarIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingBarCopy: { flex: 1, minWidth: 0 },
  bookingBarLabel: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  bookingBarUrl: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 1 },
  bookingBarActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bookingBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bookingBarBtnText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  bookingBarIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.lilac,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    width: '48.4%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kpiIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  kpiPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  kpiValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
    color: colors.ink,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  kpiMeta: {
    fontSize: 10.5,
    color: colors.muted,
    marginTop: 1,
  },
  kpiProgressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    marginTop: 2,
  },
  kpiProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#D97706',
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  chartSub: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 2,
  },
  chartMetaLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.muted,
  },
  chartToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#F4F4F5',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  chartToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  chartToggleBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  chartToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  chartToggleTextActive: {
    color: colors.ink,
    fontWeight: '700',
  },
  barChartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 128,
    paddingTop: 14,
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  barTopValue: {
    fontSize: 9.5,
    fontWeight: '600',
    color: colors.muted,
    minHeight: 13,
  },
  barTrack: {
    width: '100%',
    maxWidth: 26,
    height: 82,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
  },
  barDayLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
  },
  segmentedBar: {
    height: 10,
    borderRadius: 5,
    flexDirection: 'row',
    overflow: 'hidden',
    gap: 2,
    backgroundColor: '#F1F5F9',
  },
  statusLegendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusLegendBox: {
    width: '48.4%',
    borderWidth: 1,
    borderColor: '#F1EEEA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  statusLegendTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLegendLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    flex: 1,
  },
  statusLegendBottom: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  statusLegendCount: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  statusLegendPct: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  topServicesList: {
    gap: 10,
  },
  topServiceItem: {
    gap: 5,
  },
  topServiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  topServiceName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
    flex: 1,
  },
  topServiceStats: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  topServiceTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  topServiceFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.coral,
  },
  pendingCard: { backgroundColor: '#FFFBF5', borderColor: '#F3D9B1', gap: space.sm },
  pendingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pendingBadgeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  pendingTitle: { color: colors.warning, fontSize: 13, fontWeight: '800' },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F3D9B1',
  },
  pendingInfo: { flex: 1, minWidth: 0 },
  pendingClient: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  pendingMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  approvePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.coral,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  approvePillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  link: { color: colors.coral, fontSize: 12.5, fontWeight: '700', paddingVertical: 2 },
  upcomingList: { gap: space.sm },
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  clientAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  clientAvatarText: { fontSize: 13, fontWeight: '800' },
  appointmentCopy: { flex: 1, minWidth: 0 },
  client: { color: colors.ink, fontSize: 14.5, fontWeight: '700' },
  service: { color: colors.muted, fontSize: 12, marginTop: 2 },
  timeRight: { alignItems: 'flex-end', marginRight: 4 },
  time: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  date: { color: colors.muted, fontSize: 11, marginTop: 2 },
  footerLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  footerLinkText: { color: colors.coral, fontSize: 12.5, fontWeight: '700' },
  snapshotSection: { gap: 8, marginTop: 2 },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortcutTile: {
    width: '48%',
    minHeight: 118,
    justifyContent: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 13,
  },
  shortcutTilePressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  snapshotBadge: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  shortcutTitle: { color: colors.ink, fontSize: 13.5, fontWeight: '700', marginTop: 10 },
  shortcutSub: { color: colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
});
