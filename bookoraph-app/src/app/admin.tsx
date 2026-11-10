import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import {
  Button,
  Card,
  EmptyState,
  Field,
  LoadingState,
  Metric,
  NativeListGroup,
  NativeListRow,
  Screen,
  SearchField,
  SegmentedControl,
  StatusBadge,
} from '@/components/ui';
import {
  deleteAdminAuditLog,
  deleteAdminAuditLogs,
  deleteUserSecurityLog,
  fetchAdminAuditLogs,
  fetchAdminClientDetail,
  fetchAdminClients,
  fetchAdminOverviewStats,
  fetchPlatformAdmins,
  fetchSubscriptionPlans,
  fetchUserSecurityLogs,
  recordAdminAuditEvent,
  toggleUserSuspension,
  updateClientSubscription,
  upsertPlatformAdmin,
  upsertSubscriptionPlan,
  type AdminAuditLogRow,
  type AdminClientDetail,
  type AdminClientRow,
  type AdminOverviewStats,
  type AdminRole,
  type PlatformAdminRow,
  type SubscriptionPlanRow,
  type UserSecurityLogRow,
} from '@/lib/admin';
import { openExternalLink } from '@/lib/external-links';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';

type MainTab = 'overview' | 'clients' | 'audit' | 'settings';
type InspectTab = 'credentials' | 'profile' | 'plan' | 'logs';
type DateRangePreset = 'all' | 'today' | '7d' | '30d' | 'custom';

const toIsoBounds = (preset: DateRangePreset, customFrom: string, customTo: string) => {
  const now = new Date();
  const manilaToday = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const shiftDays = (days: number) => {
    const d = new Date(`${manilaToday}T00:00:00+08:00`);
    d.setDate(d.getDate() - days);
    return d.toISOString();
  };
  if (preset === 'today') {
    return {
      dateFrom: `${manilaToday}T00:00:00+08:00`,
      dateTo: `${manilaToday}T23:59:59+08:00`,
    };
  }
  if (preset === '7d') {
    return { dateFrom: shiftDays(6), dateTo: `${manilaToday}T23:59:59+08:00` };
  }
  if (preset === '30d') {
    return { dateFrom: shiftDays(29), dateTo: `${manilaToday}T23:59:59+08:00` };
  }
  if (preset === 'custom') {
    const validFrom = /^\d{4}-\d{2}-\d{2}$/.test(customFrom.trim()) ? `${customFrom.trim()}T00:00:00+08:00` : null;
    const validTo = /^\d{4}-\d{2}-\d{2}$/.test(customTo.trim()) ? `${customTo.trim()}T23:59:59+08:00` : null;
    return { dateFrom: validFrom, dateTo: validTo };
  }
  return { dateFrom: null, dateTo: null };
};

const formatCurrency = (amount: number | null | undefined) =>
  `₱${Number(amount ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
};

async function copyOrShare(label: string, value: string) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value);
      Alert.alert('Copied', `${label} copied.`);
      return;
    } catch {
      // Fallback to share
    }
  }
  try {
    await Share.share({ message: value });
  } catch {
    Alert.alert(label, value);
  }
}

export default function AdminScreen() {
  const { session, loading, adminContext, needsOnboarding, signOut } = useApp();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<MainTab>('overview');
  const [refreshing, setRefreshing] = useState(false);

  // Overview & Plans
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AdminAuditLogRow[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlanRow[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Clients
  const [clients, setClients] = useState<AdminClientRow[]>([]);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState<'business' | 'all' | 'staff' | 'client'>('business');

  // Inspect Client Sheet
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [clientDetail, setClientDetail] = useState<AdminClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [inspectTab, setInspectTab] = useState<InspectTab>('credentials');
  const [showRawMeta, setShowRawMeta] = useState(false);
  const [editPlan, setEditPlan] = useState('starter');
  const [editStatus, setEditStatus] = useState('active');
  const [editNotes, setEditNotes] = useState('');
  const [savingSub, setSavingSub] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspending, setSuspending] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // Audit Logs
  const [auditView, setAuditView] = useState<'admin' | 'security'>('admin');
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogRow[]>([]);
  const [securityLogs, setSecurityLogs] = useState<UserSecurityLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [deletingLogs, setDeletingLogs] = useState(false);
  const [inspectedLog, setInspectedLog] = useState<AdminAuditLogRow | null>(null);

  // Plan Editor
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlanRow | null>(null);
  const [planFeaturesText, setPlanFeaturesText] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  // Admins
  const [platformAdmins, setPlatformAdmins] = useState<PlatformAdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<AdminRole>('admin');
  const [newAdminNotes, setNewAdminNotes] = useState('');
  const [savingAdmin, setSavingAdmin] = useState(false);

  const canMutate = adminContext.role === 'super_admin' || adminContext.role === 'admin';
  const isSuperAdmin = adminContext.role === 'super_admin';

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const [nextStats, logsRes, planRows] = await Promise.all([
        fetchAdminOverviewStats(),
        fetchAdminAuditLogs({ limit: 6, offset: 0 }),
        fetchSubscriptionPlans(true),
      ]);
      setStats(nextStats);
      setRecentLogs(logsRes.rows);
      setPlans(planRows);
    } catch (err) {
      Alert.alert('Unable to load overview', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      const { rows, totalCount } = await fetchAdminClients({
        search: clientSearch,
        plan: planFilter,
        status: 'all',
        accountType: accountFilter,
        limit: 60,
        offset: 0,
      });
      setClients(rows);
      setClientsTotal(totalCount);
    } catch (err) {
      Alert.alert('Unable to load clients', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setClientsLoading(false);
    }
  }, [accountFilter, clientSearch, planFilter]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const { dateFrom, dateTo } = toIsoBounds(datePreset, customDateFrom, customDateTo);
      if (auditView === 'admin') {
        const { rows } = await fetchAdminAuditLogs({
          search: auditSearch,
          category: 'all',
          severity: severityFilter,
          dateFrom,
          dateTo,
          limit: 60,
          offset: 0,
        });
        setAuditLogs(rows);
      } else {
        const { rows } = await fetchUserSecurityLogs({
          search: auditSearch,
          dateFrom,
          dateTo,
          limit: 60,
          offset: 0,
        });
        setSecurityLogs(rows);
      }
    } catch (err) {
      Alert.alert('Unable to load logs', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setAuditLoading(false);
    }
  }, [auditSearch, auditView, customDateFrom, customDateTo, datePreset, severityFilter]);

  const loadAdmins = useCallback(async () => {
    setAdminsLoading(true);
    try {
      const rows = await fetchPlatformAdmins();
      setPlatformAdmins(rows);
    } catch (err) {
      Alert.alert('Unable to load admins', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setAdminsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!adminContext.is_admin) return;
    const timer = setTimeout(() => {
      void loadOverview();
    }, 0);
    return () => clearTimeout(timer);
  }, [adminContext.is_admin, loadOverview]);

  useEffect(() => {
    if (!adminContext.is_admin || tab !== 'clients') return;
    const timer = setTimeout(() => {
      void loadClients();
    }, 0);
    return () => clearTimeout(timer);
  }, [adminContext.is_admin, loadClients, tab]);

  useEffect(() => {
    if (!adminContext.is_admin || tab !== 'audit') return;
    const timer = setTimeout(() => {
      void loadAudit();
    }, 0);
    return () => clearTimeout(timer);
  }, [adminContext.is_admin, loadAudit, tab]);

  useEffect(() => {
    if (!adminContext.is_admin || tab !== 'settings') return;
    const timer = setTimeout(() => {
      void loadAdmins();
    }, 0);
    return () => clearTimeout(timer);
  }, [adminContext.is_admin, loadAdmins, tab]);

  if (loading) return <LoadingState message="Loading…" />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!adminContext.is_admin) {
    return (
      <Screen backgroundColor="#FFFFFF">
        <View style={styles.headerLine}>
          <Text style={styles.screenTitle}>Restricted</Text>
        </View>
        <EmptyState
          icon="shield-outline"
          title="Admin access required"
          message="Your account is not listed in public.platform_admins."
          actionLabel={needsOnboarding ? 'Continue setup' : 'Open app'}
          onAction={() => router.replace(needsOnboarding ? '/onboarding' : '/(tabs)')}
        />
      </Screen>
    );
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOverview();
    if (tab === 'clients') await loadClients();
    if (tab === 'audit') await loadAudit();
    if (tab === 'settings') await loadAdmins();
    setRefreshing(false);
  };

  const openClient = async (userId: string) => {
    setSelectedUserId(userId);
    setInspectTab('credentials');
    setShowRawMeta(false);
    setDetailLoading(true);
    setSuspendReason('');
    try {
      const detail = await fetchAdminClientDetail(userId, true);
      setClientDetail(detail);
      setEditPlan(detail.subscription.plan_code || 'starter');
      setEditStatus(detail.subscription.status || 'active');
      setEditNotes(detail.subscription.notes || '');
    } catch (err) {
      Alert.alert('Load failed', err instanceof Error ? err.message : 'Unable to load client.');
      setSelectedUserId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!selectedUserId) return;
    const detail = await fetchAdminClientDetail(selectedUserId, false);
    setClientDetail(detail);
  };

  const handleSaveSubscription = async () => {
    if (!selectedUserId || !canMutate) return;
    setSavingSub(true);
    try {
      await updateClientSubscription({
        businessId: selectedUserId,
        planCode: editPlan,
        status: editStatus,
        billingProvider: 'manual',
        billingCycle: 'monthly',
        periodEnd: null,
        notes: editNotes,
      });
      Alert.alert('Saved', 'Subscription updated.');
      await Promise.all([refreshDetail(), loadClients(), loadOverview()]);
    } catch (err) {
      Alert.alert('Update failed', err instanceof Error ? err.message : 'Unable to update subscription.');
    } finally {
      setSavingSub(false);
    }
  };

  const handleToggleSuspension = async () => {
    if (!selectedUserId || !clientDetail || !canMutate) return;
    const nextSuspend = !clientDetail.credentials.is_suspended;
    setSuspending(true);
    try {
      await toggleUserSuspension(selectedUserId, nextSuspend, suspendReason);
      Alert.alert(nextSuspend ? 'Account suspended' : 'Account restored');
      setSuspendReason('');
      await Promise.all([refreshDetail(), loadClients(), loadOverview()]);
    } catch (err) {
      Alert.alert('Action failed', err instanceof Error ? err.message : 'Unable to update status.');
    } finally {
      setSuspending(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!supabase || !clientDetail?.credentials.email) return;
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(clientDetail.credentials.email);
      if (error) throw new Error(error.message);
      await recordAdminAuditEvent({
        action: 'admin.password_reset_sent',
        category: 'auth',
        severity: 'warning',
        targetUserId: clientDetail.credentials.user_id,
        targetBusinessId: clientDetail.credentials.user_id,
        targetEmail: clientDetail.credentials.email,
        summary: `Triggered password reset email for ${clientDetail.credentials.email}`,
      });
      Alert.alert('Reset sent', `Email sent to ${clientDetail.credentials.email}.`);
      await refreshDetail();
    } catch (err) {
      Alert.alert('Reset failed', err instanceof Error ? err.message : 'Unable to send reset email.');
    } finally {
      setSendingReset(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!isSuperAdmin || !newAdminEmail.trim()) return;
    setSavingAdmin(true);
    try {
      await upsertPlatformAdmin({
        email: newAdminEmail.trim(),
        role: newAdminRole,
        isActive: true,
        notes: newAdminNotes.trim(),
      });
      Alert.alert('Admin saved', `Access granted to ${newAdminEmail.trim()}.`);
      setNewAdminEmail('');
      setNewAdminNotes('');
      await loadAdmins();
    } catch (err) {
      Alert.alert('Failed', err instanceof Error ? err.message : 'Unable to add admin.');
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleSavePlan = async () => {
    if (!editingPlan || !canMutate) return;
    if (!editingPlan.code.trim() || !editingPlan.name.trim()) {
      Alert.alert('Missing details', 'Enter both a plan code and display name.');
      return;
    }
    setSavingPlan(true);
    try {
      const features = planFeaturesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      await upsertSubscriptionPlan({
        ...editingPlan,
        code: editingPlan.code.trim().toLowerCase(),
        name: editingPlan.name.trim(),
        features,
      });
      Alert.alert('Saved', `Plan "${editingPlan.name}" saved.`);
      setEditingPlan(null);
      const freshPlans = await fetchSubscriptionPlans(true);
      setPlans(freshPlans);
    } catch (err) {
      Alert.alert('Failed', err instanceof Error ? err.message : 'Unable to save plan.');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleDeleteSingleAuditLog = (log: AdminAuditLogRow) => {
    if (!canMutate) return;
    Alert.alert('Delete audit log?', 'This permanently removes this audit entry.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingLogs(true);
          try {
            await deleteAdminAuditLog(log.id);
            setInspectedLog(null);
            await Promise.all([loadAudit(), loadOverview()]);
          } catch (err) {
            Alert.alert('Delete failed', err instanceof Error ? err.message : 'Unable to delete log.');
          } finally {
            setDeletingLogs(false);
          }
        },
      },
    ]);
  };

  const handleDeleteVisibleAuditLogs = () => {
    if (!canMutate || !auditLogs.length) return;
    Alert.alert(
      'Delete displayed audit logs?',
      `Permanently delete ${auditLogs.length} displayed audit log${auditLogs.length === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingLogs(true);
            try {
              await deleteAdminAuditLogs({ logIds: auditLogs.map((l) => l.id) });
              await Promise.all([loadAudit(), loadOverview()]);
            } catch (err) {
              Alert.alert('Delete failed', err instanceof Error ? err.message : 'Unable to delete logs.');
            } finally {
              setDeletingLogs(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteSecurityLog = (logId: string) => {
    if (!canMutate) return;
    Alert.alert('Delete security log?', 'This permanently removes this security log entry.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingLogs(true);
          try {
            await deleteUserSecurityLog(logId);
            await loadAudit();
          } catch (err) {
            Alert.alert('Delete failed', err instanceof Error ? err.message : 'Unable to delete log.');
          } finally {
            setDeletingLogs(false);
          }
        },
      },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/sign-in');
        },
      },
    ]);
  };

  const sqlSnippet = `insert into public.platform_admins (email, role, notes)
values ('your-email@bookoraph.com', 'super_admin', 'Owner')
on conflict (lower(email)) do update set role = excluded.role, is_active = true;`;

  const tabTitles: Record<MainTab, string> = {
    overview: 'Overview',
    clients: 'Clients',
    audit: 'Audit logs',
    settings: 'Settings',
  };

  const adminInitials = (adminContext.email || session.user.email || 'A')
    .slice(0, 2)
    .toUpperCase();

  const bottomInset = Math.max(8, insets.bottom);

  const inspectedBusinessName = clientDetail?.business_profile?.business_name
    ? String(clientDetail.business_profile.business_name)
    : clientDetail?.credentials.email || 'Client';

  const inspectedInitials = inspectedBusinessName
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  const inspectedSlug = clientDetail?.business_profile?.slug
    ? String(clientDetail.business_profile.slug)
    : '';

  return (
    <View style={styles.root}>
      <Screen refreshing={refreshing} onRefresh={onRefresh} backgroundColor="#FFFFFF">
        <View style={styles.headerLine}>
          <Text style={styles.screenTitle}>{tabTitles[tab]}</Text>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Admin settings"
              onPress={() => setTab('settings')}
              style={({ pressed }) => [styles.avatarBtn, pressed && styles.pressed]}
            >
              <Text style={styles.avatarBtnText}>{adminInitials}</Text>
            </Pressable>
          </View>
        </View>

        {tab === 'overview' && (
          <View style={styles.sectionGap}>
            {overviewLoading && !stats ? (
              <Card>
                <ActivityIndicator color={colors.coral} />
              </Card>
            ) : (
              <>
                <View style={styles.metricGrid}>
                  <Metric
                    label="Businesses"
                    value={stats?.total_businesses ?? 0}
                    sublabel={`${stats?.total_auth_users ?? 0} total users`}
                    icon="storefront-outline"
                    tone="coral"
                  />
                  <Metric
                    label="Active plans"
                    value={stats?.active_subscriptions ?? 0}
                    sublabel="Default Starter"
                    icon="card-outline"
                    tone="lilac"
                  />
                  <Metric
                    label="Bookings"
                    value={stats?.total_appointments ?? 0}
                    sublabel={formatCurrency(stats?.total_paid_revenue_php)}
                    icon="calendar-outline"
                    tone="mint"
                  />
                  <Metric
                    label="Events (24h)"
                    value={stats?.audit_events_24h ?? 0}
                    sublabel={`${stats?.suspended_users ?? 0} suspended`}
                    icon="shield-outline"
                    tone="peach"
                  />
                </View>

                <Card style={styles.cardGap}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>Plans</Text>
                    <Pressable onPress={() => setTab('clients')}>
                      <Text style={styles.linkText}>View clients</Text>
                    </Pressable>
                  </View>
                  <View style={styles.tierRow}>
                    <View style={styles.tierChip}>
                      <Text style={styles.tierVal}>{stats?.free_count ?? 0}</Text>
                      <Text style={styles.tierLbl}>Free</Text>
                    </View>
                    <View style={[styles.tierChip, { backgroundColor: colors.peach }]}>
                      <Text style={styles.tierVal}>{stats?.starter_count ?? 0}</Text>
                      <Text style={styles.tierLbl}>Starter</Text>
                    </View>
                    <View style={[styles.tierChip, { backgroundColor: colors.mint }]}>
                      <Text style={styles.tierVal}>{stats?.pro_count ?? 0}</Text>
                      <Text style={styles.tierLbl}>Pro</Text>
                    </View>
                    <View style={[styles.tierChip, { backgroundColor: colors.lilac }]}>
                      <Text style={styles.tierVal}>{stats?.other_plan_count ?? 0}</Text>
                      <Text style={styles.tierLbl}>Other</Text>
                    </View>
                  </View>
                </Card>

                <NativeListGroup title="Recent activity">
                  {recentLogs.length === 0 ? (
                    <View style={{ padding: space.lg }}>
                      <Text style={styles.mutedSmall}>No activity yet.</Text>
                    </View>
                  ) : (
                    recentLogs.map((log, idx) => (
                      <NativeListRow
                        key={log.id}
                        first={idx === 0}
                        icon={log.severity === 'info' ? 'shield-checkmark-outline' : 'warning-outline'}
                        iconBg={log.severity === 'info' ? colors.mint : colors.coralSoft}
                        iconColor={log.severity === 'info' ? colors.success : colors.danger}
                        title={log.summary}
                        subtitle={`${log.actor_email || 'system'} · ${formatDateTime(log.created_at)}`}
                        onPress={() => setInspectedLog(log)}
                      />
                    ))
                  )}
                </NativeListGroup>
              </>
            )}
          </View>
        )}

        {tab === 'clients' && (
          <View style={styles.sectionGap}>
            <SearchField
              value={clientSearch}
              onChangeText={setClientSearch}
              placeholder="Search business, email, slug, city…"
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {(['business', 'all', 'staff', 'client'] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setAccountFilter(type)}
                  style={[styles.filterChip, accountFilter === type && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, accountFilter === type && styles.filterChipTextActive]}>
                    {type === 'business' ? 'Businesses' : type === 'all' ? 'All' : type === 'staff' ? 'Staff' : 'Customers'}
                  </Text>
                </Pressable>
              ))}
              {plans.map((p) => (
                <Pressable
                  key={p.code}
                  onPress={() => setPlanFilter(planFilter === p.code ? 'all' : p.code)}
                  style={[styles.filterChip, planFilter === p.code && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, planFilter === p.code && styles.filterChipTextActive]}>
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.mutedSmall}>
              {clients.length} of {clientsTotal} accounts
            </Text>

            {clientsLoading ? (
              <Card>
                <ActivityIndicator color={colors.coral} />
              </Card>
            ) : clients.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title="No clients found"
                message="Try adjusting your search or filter."
              />
            ) : (
              <View style={styles.clientList}>
                {clients.map((c) => {
                  const displayName = c.business_name || c.full_name || c.email || 'Account';
                  const initials = displayName
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <Pressable
                      key={c.user_id}
                      onPress={() => void openClient(c.user_id)}
                      style={({ pressed }) => [styles.clientRowCard, pressed && styles.pressed]}
                    >
                      <View style={styles.clientAvatar}>
                        <Text style={styles.clientAvatarText}>{initials || '?'}</Text>
                      </View>
                      <View style={styles.clientRowBody}>
                        <View style={styles.clientRowTop}>
                          <Text numberOfLines={1} style={styles.clientRowName}>
                            {displayName}
                          </Text>
                          <StatusBadge status={c.is_suspended ? 'blocked' : c.plan_code} />
                        </View>
                        <Text numberOfLines={1} style={styles.mutedSmall}>
                          {c.email || c.user_id}
                        </Text>
                        <Text numberOfLines={1} style={styles.clientRowMeta}>
                          {c.email_confirmed_at ? 'Verified' : 'Unverified'} · {c.auth_providers.join(', ') || 'email'} ·{' '}
                          {c.appointments_count} appts · {formatCurrency(c.monthly_price_php)}/mo
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {tab === 'audit' && (
          <View style={styles.sectionGap}>
            <SegmentedControl
              value={auditView}
              onChange={setAuditView}
              items={[
                { value: 'admin', label: 'Audit logs' },
                { value: 'security', label: 'Password logs' },
              ]}
            />

            <SearchField
              value={auditSearch}
              onChangeText={setAuditSearch}
              placeholder="Search email, action, or summary…"
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {(
                [
                  ['all', 'All dates'],
                  ['today', 'Today'],
                  ['7d', '7 days'],
                  ['30d', '30 days'],
                  ['custom', 'Custom range'],
                ] as [DateRangePreset, string][]
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setDatePreset(key)}
                  style={[styles.filterChip, datePreset === key && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, datePreset === key && styles.filterChipTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {datePreset === 'custom' && (
              <Card style={styles.cardGap}>
                <View style={styles.dateRow}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="From"
                      placeholder="YYYY-MM-DD"
                      value={customDateFrom}
                      onChangeText={setCustomDateFrom}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="To"
                      placeholder="YYYY-MM-DD"
                      value={customDateTo}
                      onChangeText={setCustomDateTo}
                    />
                  </View>
                </View>
              </Card>
            )}

            {auditView === 'admin' && (
              <View style={styles.rowBetween}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {['all', 'info', 'warning', 'critical'].map((sev) => (
                    <Pressable
                      key={sev}
                      onPress={() => setSeverityFilter(sev)}
                      style={[styles.filterChip, severityFilter === sev && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, severityFilter === sev && styles.filterChipTextActive]}>
                        {sev === 'all' ? 'All' : sev}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {canMutate && auditLogs.length > 0 ? (
                  <Pressable
                    onPress={handleDeleteVisibleAuditLogs}
                    disabled={deletingLogs}
                    style={({ pressed }) => [styles.deletePill, pressed && styles.pressed]}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    <Text style={styles.deletePillText}>{deletingLogs ? 'Deleting…' : 'Delete'}</Text>
                  </Pressable>
                ) : null}
              </View>
            )}

            {auditLoading ? (
              <Card>
                <ActivityIndicator color={colors.coral} />
              </Card>
            ) : auditView === 'admin' ? (
              auditLogs.length === 0 ? (
                <EmptyState icon="shield-outline" title="No logs" message="No events match your filters." />
              ) : (
                <NativeListGroup>
                  {auditLogs.map((log, idx) => (
                    <NativeListRow
                      key={log.id}
                      first={idx === 0}
                      icon={log.severity === 'info' ? 'shield-checkmark-outline' : 'alert-circle-outline'}
                      iconBg={log.severity === 'info' ? colors.mint : colors.coralSoft}
                      iconColor={log.severity === 'info' ? colors.success : colors.danger}
                      title={log.summary}
                      subtitle={`${log.action} · ${log.actor_email || 'system'} · ${formatDateTime(log.created_at)}`}
                      onPress={() => setInspectedLog(log)}
                    />
                  ))}
                </NativeListGroup>
              )
            ) : securityLogs.length === 0 ? (
              <EmptyState icon="key-outline" title="No security logs" message="No password update records." />
            ) : (
              <NativeListGroup>
                {securityLogs.map((sl, idx) => (
                  <NativeListRow
                    key={sl.id}
                    first={idx === 0}
                    icon="key-outline"
                    iconBg={colors.lilac}
                    iconColor={colors.navy}
                    title={sl.user_email || sl.user_id}
                    subtitle={`${sl.action} · ${formatDateTime(sl.created_at)}`}
                    badge={canMutate ? 'Delete' : undefined}
                    chevron={false}
                    onPress={canMutate ? () => handleDeleteSecurityLog(sl.id) : undefined}
                  />
                ))}
              </NativeListGroup>
            )}
          </View>
        )}

        {tab === 'settings' && (
          <View style={styles.sectionGap}>
            <Card style={styles.heroCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{adminInitials}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.heroTitle} numberOfLines={1}>
                  {adminContext.email || session.user.email}
                </Text>
                <Text style={styles.mutedSmall}>Role: {adminContext.role || 'admin'}</Text>
              </View>
            </Card>

            <View style={styles.rowBetween}>
              <Text style={styles.sectionCaps}>Subscription plans</Text>
              {canMutate ? (
                <Pressable
                  onPress={() => {
                    setEditingPlan({
                      code: '',
                      name: '',
                      description: '',
                      monthly_price_php: 0,
                      annual_price_php: 0,
                      currency: 'PHP',
                      max_staff: null,
                      max_locations: 1,
                      features: [],
                      xendit_plan_id: null,
                      is_active: true,
                      is_public: true,
                      sort_order: plans.length + 1,
                    });
                    setPlanFeaturesText('');
                  }}
                >
                  <Text style={styles.linkText}>+ Add plan</Text>
                </Pressable>
              ) : null}
            </View>
            <NativeListGroup>
              {plans.map((p, idx) => (
                <NativeListRow
                  key={p.code}
                  first={idx === 0}
                  icon="card-outline"
                  iconBg={p.code === 'pro' ? colors.mint : p.code === 'starter' ? colors.peach : colors.surfaceMuted}
                  iconColor={p.code === 'pro' ? colors.success : p.code === 'starter' ? colors.warning : colors.muted}
                  title={`${p.name} · ${formatCurrency(p.monthly_price_php)}/mo`}
                  subtitle={p.description}
                  badge={p.is_active ? 'Active' : 'Off'}
                  chevron={canMutate}
                  onPress={
                    canMutate
                      ? () => {
                          setEditingPlan(p);
                          setPlanFeaturesText(p.features.join('\n'));
                        }
                      : undefined
                  }
                />
              ))}
            </NativeListGroup>

            <NativeListGroup title="Admins">
              {adminsLoading ? (
                <View style={{ padding: space.lg }}>
                  <ActivityIndicator color={colors.coral} />
                </View>
              ) : (
                platformAdmins.map((pa, idx) => (
                  <NativeListRow
                    key={pa.id}
                    first={idx === 0}
                    icon="person-outline"
                    iconBg={colors.sky}
                    iconColor={colors.skyInk}
                    title={pa.email}
                    subtitle={`${pa.role} · ${pa.user_id ? 'Linked' : 'Pending'}`}
                    badge={pa.is_active ? 'Active' : 'Off'}
                    chevron={false}
                  />
                ))
              )}
            </NativeListGroup>

            {isSuperAdmin && (
              <Card style={styles.cardGap}>
                <Text style={styles.cardTitle}>Add admin</Text>
                <Field
                  label="Email"
                  keyboardType="email-address"
                  placeholder="partner@bookoraph.com"
                  value={newAdminEmail}
                  onChangeText={setNewAdminEmail}
                />
                <View style={styles.filterRow}>
                  {(['admin', 'support', 'viewer', 'super_admin'] as AdminRole[]).map((role) => (
                    <Pressable
                      key={role}
                      onPress={() => setNewAdminRole(role)}
                      style={[styles.filterChip, newAdminRole === role && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, newAdminRole === role && styles.filterChipTextActive]}>
                        {role}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Field label="Note" placeholder="Optional note" value={newAdminNotes} onChangeText={setNewAdminNotes} />
                <Button
                  label={savingAdmin ? 'Saving…' : 'Add admin'}
                  icon="add"
                  onPress={() => void handleAddAdmin()}
                  disabled={savingAdmin}
                />
              </Card>
            )}

            <NativeListGroup>
              <NativeListRow
                first
                icon="copy-outline"
                iconBg={colors.surfaceMuted}
                iconColor={colors.ink}
                title="Copy Supabase admin SQL"
                onPress={() => void copyOrShare('Supabase Admin SQL', sqlSnippet)}
              />
              {!needsOnboarding ? (
                <NativeListRow
                  icon="storefront-outline"
                  iconBg={colors.mint}
                  iconColor={colors.success}
                  title="Switch to salon app"
                  onPress={() => router.replace('/(tabs)')}
                />
              ) : null}
              <NativeListRow
                icon="log-out-outline"
                iconBg={colors.coralSoft}
                iconColor={colors.danger}
                title="Sign out"
                destructive
                chevron={false}
                onPress={handleSignOut}
              />
            </NativeListGroup>
          </View>
        )}
      </Screen>

      {/* Bottom Mobile Navigation Bar (mirrors client app) */}
      <View
        style={[
          styles.bottomBar,
          { height: 60 + bottomInset, paddingBottom: bottomInset },
        ]}
      >
        {(
          [
            ['overview', 'Overview', 'grid', 'grid-outline'],
            ['clients', 'Clients', 'people', 'people-outline'],
            ['audit', 'Audit', 'shield-checkmark', 'shield-checkmark-outline'],
            ['settings', 'Settings', 'settings', 'settings-outline'],
          ] as [MainTab, string, keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap][]
        ).map(([key, label, activeIcon, inactiveIcon]) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(key)}
              style={({ pressed }) => [styles.bottomTab, pressed && styles.pressed]}
            >
              <Ionicons
                name={active ? activeIcon : inactiveIcon}
                size={22}
                color={active ? colors.coral : colors.muted}
              />
              <Text style={[styles.bottomTabLabel, active && styles.bottomTabLabelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Client Inspector Sheet (styled like Clients profile drawer) */}
      <Modal
        visible={Boolean(selectedUserId)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setSelectedUserId(null);
          setClientDetail(null);
        }}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.drawerNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => {
                setSelectedUserId(null);
                setClientDetail(null);
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>
            <Text style={styles.drawerTitle}>Client</Text>
            {clientDetail?.credentials.email ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send password reset"
                onPress={() => void handleSendPasswordReset()}
                disabled={sendingReset}
                hitSlop={8}
                style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
              >
                <Ionicons name="key-outline" size={19} color={colors.ink} />
              </Pressable>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>

          {detailLoading || !clientDetail ? (
            <LoadingState message="Loading client…" />
          ) : (
            <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Profile Hero */}
              <View style={styles.profileHero}>
                <View style={styles.heroAvatar}>
                  <Text style={styles.heroAvatarText}>{inspectedInitials}</Text>
                </View>
                <Text style={styles.heroName}>{inspectedBusinessName}</Text>
                <Text style={styles.mutedSmall}>{clientDetail.credentials.email || 'No email'}</Text>
                <View style={styles.heroBadges}>
                  <StatusBadge status={clientDetail.subscription.plan_code} />
                  <StatusBadge
                    status={clientDetail.credentials.is_suspended ? 'blocked' : clientDetail.subscription.status}
                  />
                </View>

                <View style={styles.quickActionRow}>
                  <Pressable
                    onPress={() => void copyOrShare('User ID', clientDetail.credentials.user_id)}
                    style={({ pressed }) => [styles.quickPill, pressed && styles.pressed]}
                  >
                    <Ionicons name="copy-outline" size={15} color={colors.ink} />
                    <Text style={styles.quickPillText}>Copy ID</Text>
                  </Pressable>
                  {clientDetail.credentials.email ? (
                    <Pressable
                      onPress={() => void handleSendPasswordReset()}
                      disabled={sendingReset}
                      style={({ pressed }) => [styles.quickPill, pressed && styles.pressed]}
                    >
                      <Ionicons name="mail-outline" size={15} color={colors.ink} />
                      <Text style={styles.quickPillText}>{sendingReset ? 'Sending…' : 'Reset password'}</Text>
                    </Pressable>
                  ) : null}
                  {inspectedSlug ? (
                    <Pressable
                      onPress={() => void openExternalLink(`https://${inspectedSlug}.bookoraph.com/`)}
                      style={({ pressed }) => [styles.quickPill, pressed && styles.pressed]}
                    >
                      <Ionicons name="globe-outline" size={15} color={colors.ink} />
                      <Text style={styles.quickPillText}>Booking link</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <SegmentedControl
                value={inspectTab}
                onChange={setInspectTab}
                items={[
                  { value: 'credentials', label: 'Auth' },
                  { value: 'profile', label: 'Profile' },
                  { value: 'plan', label: 'Plan' },
                  { value: 'logs', label: 'Logs' },
                ]}
              />

              {inspectTab === 'credentials' && (
                <View style={styles.sectionGap}>
                  <NativeListGroup title="Account & credentials">
                    <NativeListRow
                      first
                      icon="mail-outline"
                      iconBg={colors.sky}
                      iconColor={colors.skyInk}
                      title={clientDetail.credentials.email || '—'}
                      subtitle={
                        clientDetail.credentials.email_confirmed_at
                          ? `Verified ${formatDateTime(clientDetail.credentials.email_confirmed_at)}`
                          : 'Email unverified'
                      }
                      chevron={false}
                    />
                    <NativeListRow
                      icon="call-outline"
                      iconBg={colors.mint}
                      iconColor={colors.success}
                      title={clientDetail.credentials.phone || 'No auth phone'}
                      subtitle={
                        clientDetail.credentials.phone_confirmed_at
                          ? `Verified ${formatDateTime(clientDetail.credentials.phone_confirmed_at)}`
                          : 'Phone'
                      }
                      chevron={false}
                    />
                    <NativeListRow
                      icon="lock-closed-outline"
                      iconBg={colors.lilac}
                      iconColor={colors.navy}
                      title={clientDetail.credentials.has_password ? 'Password set (encrypted)' : 'OAuth sign-in'}
                      subtitle={`Changed: ${formatDateTime(clientDetail.credentials.password_updated_at)}`}
                      chevron={false}
                    />
                    <NativeListRow
                      icon="key-outline"
                      iconBg={colors.peach}
                      iconColor={colors.warning}
                      title={clientDetail.credentials.identities.map((i) => i.provider).join(', ') || 'email'}
                      subtitle={`2FA factors: ${clientDetail.credentials.mfa_factors.length}`}
                      chevron={false}
                    />
                    <NativeListRow
                      icon="time-outline"
                      iconBg={colors.surfaceMuted}
                      iconColor={colors.muted}
                      title={`Last sign-in: ${formatDateTime(clientDetail.credentials.last_sign_in_at)}`}
                      subtitle={`Joined: ${formatDateTime(clientDetail.credentials.created_at)}`}
                      chevron={false}
                    />
                  </NativeListGroup>

                  <NativeListGroup>
                    <NativeListRow
                      first
                      icon="code-slash-outline"
                      iconBg={colors.surfaceMuted}
                      iconColor={colors.ink}
                      title={showRawMeta ? 'Hide metadata JSON' : 'View metadata JSON'}
                      onPress={() => setShowRawMeta((prev) => !prev)}
                    />
                  </NativeListGroup>

                  {showRawMeta && (
                    <Card>
                      <Text style={styles.jsonBlock}>
                        {JSON.stringify(
                          {
                            user_metadata: clientDetail.credentials.raw_user_meta_data,
                            app_metadata: clientDetail.credentials.raw_app_meta_data,
                          },
                          null,
                          2
                        )}
                      </Text>
                    </Card>
                  )}

                  {canMutate && clientDetail.credentials.user_id !== session.user.id && (
                    <Card style={styles.cardGap}>
                      <Field
                        label="Account status note"
                        placeholder="Reason (optional)"
                        value={suspendReason}
                        onChangeText={setSuspendReason}
                      />
                      <Button
                        label={
                          suspending
                            ? 'Updating…'
                            : clientDetail.credentials.is_suspended
                              ? 'Restore account'
                              : 'Suspend account'
                        }
                        icon={clientDetail.credentials.is_suspended ? 'checkmark-circle-outline' : 'ban-outline'}
                        danger={!clientDetail.credentials.is_suspended}
                        onPress={() => void handleToggleSuspension()}
                        disabled={suspending}
                      />
                    </Card>
                  )}
                </View>
              )}

              {inspectTab === 'profile' && (
                <View style={styles.sectionGap}>
                  {!clientDetail.business_profile ? (
                    <EmptyState
                      icon="storefront-outline"
                      title="No business profile"
                      message="This account has not completed business setup."
                    />
                  ) : (
                    <>
                      <View style={styles.metricGrid}>
                        <Metric label="Services" value={clientDetail.stats.services_count} icon="cut-outline" tone="coral" />
                        <Metric
                          label="Bookings"
                          value={clientDetail.stats.appointments_count}
                          icon="calendar-outline"
                          tone="mint"
                        />
                        <Metric label="Clients" value={clientDetail.stats.clients_count} icon="people-outline" tone="lilac" />
                        <Metric
                          label="Paid"
                          value={formatCurrency(clientDetail.stats.paid_revenue_php)}
                          icon="cash-outline"
                          tone="peach"
                        />
                      </View>

                      <NativeListGroup title="Business details">
                        <NativeListRow
                          first
                          icon="storefront-outline"
                          iconBg={colors.coralSoft}
                          iconColor={colors.coral}
                          title={String(clientDetail.business_profile.business_name || '—')}
                          subtitle={String(clientDetail.business_profile.industry || '—')}
                          chevron={false}
                        />
                        <NativeListRow
                          icon="globe-outline"
                          iconBg={colors.sky}
                          iconColor={colors.skyInk}
                          title={inspectedSlug ? `${inspectedSlug}.bookoraph.com` : 'No booking slug'}
                          subtitle="Booking page"
                          chevron={false}
                        />
                        <NativeListRow
                          icon="call-outline"
                          iconBg={colors.mint}
                          iconColor={colors.success}
                          title={`${String(clientDetail.business_profile.country_code || '')} ${String(clientDetail.business_profile.phone || '—')}`.trim()}
                          subtitle={String(clientDetail.business_profile.email || '—')}
                          chevron={false}
                        />
                        <NativeListRow
                          icon="location-outline"
                          iconBg={colors.peach}
                          iconColor={colors.warning}
                          title={
                            [
                              clientDetail.business_profile.address,
                              clientDetail.business_profile.city,
                              clientDetail.business_profile.country,
                            ]
                              .filter(Boolean)
                              .join(', ') || 'No address'
                          }
                          subtitle={`Theme: ${String(clientDetail.business_profile.brand_color || 'coral')} · ${String(clientDetail.business_profile.theme || 'Light')}`}
                          chevron={false}
                        />
                      </NativeListGroup>
                    </>
                  )}
                </View>
              )}

              {inspectTab === 'plan' && (
                <View style={styles.sectionGap}>
                  <NativeListGroup title="Current subscription">
                    <NativeListRow
                      first
                      icon="card-outline"
                      iconBg={colors.peach}
                      iconColor={colors.warning}
                      title={`${clientDetail.subscription.plan_name} · ${formatCurrency(clientDetail.subscription.amount_php)}/${clientDetail.subscription.billing_cycle}`}
                      subtitle={`Provider: ${clientDetail.subscription.billing_provider} · Updated ${formatDateTime(clientDetail.subscription.updated_at)}`}
                      badge={clientDetail.subscription.status}
                      chevron={false}
                    />
                  </NativeListGroup>

                  {canMutate && (
                    <Card style={styles.cardGap}>
                      <Text style={styles.cardTitle}>Update plan</Text>
                      <View style={styles.filterRow}>
                        {plans.map((p) => (
                          <Pressable
                            key={p.code}
                            onPress={() => setEditPlan(p.code)}
                            style={[styles.filterChip, editPlan === p.code && styles.filterChipActive]}
                          >
                            <Text style={[styles.filterChipText, editPlan === p.code && styles.filterChipTextActive]}>
                              {p.name} ({formatCurrency(p.monthly_price_php)})
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <View style={styles.filterRow}>
                        {['active', 'trialing', 'past_due', 'cancelled', 'expired'].map((st) => (
                          <Pressable
                            key={st}
                            onPress={() => setEditStatus(st)}
                            style={[styles.filterChip, editStatus === st && styles.filterChipActive]}
                          >
                            <Text style={[styles.filterChipText, editStatus === st && styles.filterChipTextActive]}>
                              {st}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <Field label="Note" placeholder="Optional note" value={editNotes} onChangeText={setEditNotes} />
                      <Button
                        label={savingSub ? 'Saving…' : 'Save plan'}
                        icon="checkmark-outline"
                        onPress={() => void handleSaveSubscription()}
                        disabled={savingSub}
                      />
                    </Card>
                  )}
                </View>
              )}

              {inspectTab === 'logs' && (
                <View style={styles.sectionGap}>
                  <NativeListGroup title="Audit history">
                    {clientDetail.recent_audit_logs.length === 0 ? (
                      <View style={{ padding: space.lg }}>
                        <Text style={styles.mutedSmall}>No audit history yet.</Text>
                      </View>
                    ) : (
                      clientDetail.recent_audit_logs.map((l, idx) => (
                        <NativeListRow
                          key={l.id}
                          first={idx === 0}
                          icon="shield-checkmark-outline"
                          iconBg={colors.mint}
                          iconColor={colors.success}
                          title={l.summary}
                          subtitle={`${l.action} · ${formatDateTime(l.created_at)}`}
                          chevron={false}
                        />
                      ))
                    )}
                  </NativeListGroup>

                  <NativeListGroup title="Password & security logs">
                    {clientDetail.recent_security_logs.length === 0 ? (
                      <View style={{ padding: space.lg }}>
                        <Text style={styles.mutedSmall}>No password logs.</Text>
                      </View>
                    ) : (
                      clientDetail.recent_security_logs.map((sl, idx) => (
                        <NativeListRow
                          key={sl.id}
                          first={idx === 0}
                          icon="key-outline"
                          iconBg={colors.lilac}
                          iconColor={colors.navy}
                          title={sl.action}
                          subtitle={`${sl.details || '—'} · ${formatDateTime(sl.created_at)}`}
                          chevron={false}
                        />
                      ))
                    )}
                  </NativeListGroup>
                </View>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Audit Log Detail Modal */}
      <Modal
        visible={Boolean(inspectedLog)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInspectedLog(null)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.drawerNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => setInspectedLog(null)}
              hitSlop={8}
              style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>
            <Text style={styles.drawerTitle}>Event detail</Text>
            {canMutate && inspectedLog ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete audit log"
                onPress={() => handleDeleteSingleAuditLog(inspectedLog)}
                disabled={deletingLogs}
                hitSlop={8}
                style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
              >
                <Ionicons name="trash-outline" size={19} color={colors.danger} />
              </Pressable>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>
          {inspectedLog && (
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <NativeListGroup>
                <NativeListRow
                  first
                  title={inspectedLog.summary}
                  subtitle={`${inspectedLog.action} · ${formatDateTime(inspectedLog.created_at)}`}
                  chevron={false}
                />
                <NativeListRow
                  title={inspectedLog.actor_email || 'system'}
                  subtitle={`Role: ${inspectedLog.actor_role}`}
                  chevron={false}
                />
                <NativeListRow
                  title={inspectedLog.target_email || 'No target email'}
                  subtitle="Target"
                  chevron={false}
                />
              </NativeListGroup>
              {inspectedLog.before_state && (
                <Card style={styles.cardGap}>
                  <Text style={styles.cardTitle}>Before</Text>
                  <Text style={styles.jsonBlock}>{JSON.stringify(inspectedLog.before_state, null, 2)}</Text>
                </Card>
              )}
              {inspectedLog.after_state && (
                <Card style={styles.cardGap}>
                  <Text style={styles.cardTitle}>After</Text>
                  <Text style={styles.jsonBlock}>{JSON.stringify(inspectedLog.after_state, null, 2)}</Text>
                </Card>
              )}
              <Card style={styles.cardGap}>
                <Text style={styles.cardTitle}>Metadata</Text>
                <Text style={styles.jsonBlock}>{JSON.stringify(inspectedLog.metadata || {}, null, 2)}</Text>
              </Card>
              {canMutate && (
                <Button
                  label={deletingLogs ? 'Deleting…' : 'Delete log'}
                  icon="trash-outline"
                  danger
                  onPress={() => handleDeleteSingleAuditLog(inspectedLog)}
                  disabled={deletingLogs}
                />
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Plan Editor Sheet */}
      <Modal
        visible={Boolean(editingPlan)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingPlan(null)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.drawerNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => setEditingPlan(null)}
              hitSlop={8}
              style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>
            <Text style={styles.drawerTitle}>{editingPlan?.code ? `Edit ${editingPlan.name}` : 'Add plan'}</Text>
            <View style={{ width: 40 }} />
          </View>
          {editingPlan && (
            <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Field
                label="Plan code"
                placeholder="e.g. growth"
                value={editingPlan.code}
                onChangeText={(v) => setEditingPlan({ ...editingPlan, code: v })}
              />
              <Field
                label="Display name"
                placeholder="e.g. Growth"
                value={editingPlan.name}
                onChangeText={(v) => setEditingPlan({ ...editingPlan, name: v })}
              />
              <Field
                label="Description"
                placeholder="Short summary"
                value={editingPlan.description}
                onChangeText={(v) => setEditingPlan({ ...editingPlan, description: v })}
              />
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Monthly (PHP)"
                    keyboardType="numeric"
                    value={String(editingPlan.monthly_price_php)}
                    onChangeText={(v) => setEditingPlan({ ...editingPlan, monthly_price_php: Number(v) || 0 })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Annual (PHP)"
                    keyboardType="numeric"
                    value={String(editingPlan.annual_price_php)}
                    onChangeText={(v) => setEditingPlan({ ...editingPlan, annual_price_php: Number(v) || 0 })}
                  />
                </View>
              </View>
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Max staff"
                    placeholder="Unlimited"
                    keyboardType="numeric"
                    value={editingPlan.max_staff === null ? '' : String(editingPlan.max_staff)}
                    onChangeText={(v) =>
                      setEditingPlan({ ...editingPlan, max_staff: v.trim() ? Number(v) || 1 : null })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Max locations"
                    placeholder="Unlimited"
                    keyboardType="numeric"
                    value={editingPlan.max_locations === null ? '' : String(editingPlan.max_locations)}
                    onChangeText={(v) =>
                      setEditingPlan({ ...editingPlan, max_locations: v.trim() ? Number(v) || 1 : null })
                    }
                  />
                </View>
              </View>
              <Field
                label="Xendit plan ID (optional)"
                placeholder="repl_..."
                value={editingPlan.xendit_plan_id || ''}
                onChangeText={(v) => setEditingPlan({ ...editingPlan, xendit_plan_id: v.trim() || null })}
              />
              <Field
                label="Features (one per line)"
                multiline
                value={planFeaturesText}
                onChangeText={setPlanFeaturesText}
              />
              <Card style={styles.cardGap}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Active plan</Text>
                  <Switch
                    value={editingPlan.is_active}
                    onValueChange={(val) => setEditingPlan({ ...editingPlan, is_active: val })}
                    trackColor={{ false: colors.line, true: colors.coral }}
                  />
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Visible to owners</Text>
                  <Switch
                    value={editingPlan.is_public}
                    onValueChange={(val) => setEditingPlan({ ...editingPlan, is_public: val })}
                    trackColor={{ false: colors.line, true: colors.coral }}
                  />
                </View>
              </Card>
              <Button
                label={savingPlan ? 'Saving…' : 'Save plan'}
                icon="checkmark-outline"
                onPress={() => void handleSavePlan()}
                disabled={savingPlan}
              />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.md,
  },
  screenTitle: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.7 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBtnText: { color: colors.coral, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  sectionGap: { gap: space.md },
  cardGap: { gap: space.sm },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  mutedSmall: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  linkText: { color: colors.coral, fontSize: 13, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tierRow: { flexDirection: 'row', gap: 8 },
  tierChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#F5F4F2',
    alignItems: 'center',
  },
  tierVal: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  tierLbl: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  filterChipActive: { backgroundColor: colors.coralSoft, borderColor: colors.coral },
  filterChipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: colors.coral },
  clientList: { gap: 10 },
  clientRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  clientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientAvatarText: { color: colors.coral, fontSize: 15, fontWeight: '800' },
  clientRowBody: { flex: 1, gap: 2 },
  clientRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  clientRowName: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '700' },
  clientRowMeta: { color: colors.muted, fontSize: 11.5, marginTop: 2 },
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.coral, fontSize: 16, fontWeight: '800' },
  heroTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 7,
    backgroundColor: Platform.OS === 'web' ? 'rgba(255, 255, 255, 0.92)' : '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as ViewStyle)
      : {}),
  },
  bottomTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bottomTabLabel: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  bottomTabLabelActive: { color: colors.coral, fontWeight: '700' },
  modalSafe: { flex: 1, backgroundColor: '#FFFFFF' },
  drawerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  drawerTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  modalScroll: { padding: space.lg, gap: space.md, paddingBottom: 60 },
  profileHero: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  heroAvatar: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroAvatarText: { color: colors.coral, fontSize: 22, fontWeight: '800' },
  heroName: { color: colors.ink, fontSize: 21, fontWeight: '800', textAlign: 'center' },
  heroBadges: { flexDirection: 'row', gap: 8, marginTop: 4 },
  quickActionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 10 },
  quickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  quickPillText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  jsonBlock: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: colors.ink,
    backgroundColor: '#F6F5F3',
    padding: 10,
    borderRadius: 10,
  },
  dateRow: { flexDirection: 'row', gap: 10 },
  deletePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#F5C4BE',
    backgroundColor: colors.coralSoft,
  },
  deletePillText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  sectionCaps: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    paddingHorizontal: 6,
  },
});
