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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import {
  Button,
  Card,
  EmptyState,
  Field,
  LoadingState,
  Metric,
  PageHeader,
  Screen,
  SearchField,
  StatusBadge,
} from '@/components/ui';
import {
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
  type AdminAuditLogRow,
  type AdminClientDetail,
  type AdminClientRow,
  type AdminOverviewStats,
  type AdminRole,
  type PlatformAdminRow,
  type SubscriptionPlanRow,
  type UserSecurityLogRow,
} from '@/lib/admin';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';

type MainTab = 'overview' | 'clients' | 'audit' | 'admins';
type DrawerTab = 'credentials' | 'profile' | 'plan' | 'logs';

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
      Alert.alert('Copied', `${label} copied to clipboard.`);
      return;
    } catch {
      // Fallback to share below
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

  // Client Detail Modal
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [clientDetail, setClientDetail] = useState<AdminClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('credentials');
  const [editPlan, setEditPlan] = useState('starter');
  const [editStatus, setEditStatus] = useState('active');
  const [editProvider, setEditProvider] = useState('manual');
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
  const [inspectedLog, setInspectedLog] = useState<AdminAuditLogRow | null>(null);

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
        fetchAdminAuditLogs({ limit: 8, offset: 0 }),
        fetchSubscriptionPlans(true),
      ]);
      setStats(nextStats);
      setRecentLogs(logsRes.rows);
      setPlans(planRows);
    } catch (err) {
      Alert.alert('Admin Overview Error', err instanceof Error ? err.message : 'Unable to load admin stats.');
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
      Alert.alert('Clients Error', err instanceof Error ? err.message : 'Unable to load Bookora clients.');
    } finally {
      setClientsLoading(false);
    }
  }, [accountFilter, clientSearch, planFilter]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      if (auditView === 'admin') {
        const { rows } = await fetchAdminAuditLogs({
          search: auditSearch,
          category: 'all',
          severity: severityFilter,
          limit: 60,
          offset: 0,
        });
        setAuditLogs(rows);
      } else {
        const { rows } = await fetchUserSecurityLogs({
          search: auditSearch,
          limit: 60,
          offset: 0,
        });
        setSecurityLogs(rows);
      }
    } catch (err) {
      Alert.alert('Audit Log Error', err instanceof Error ? err.message : 'Unable to load audit logs.');
    } finally {
      setAuditLoading(false);
    }
  }, [auditSearch, auditView, severityFilter]);

  const loadAdmins = useCallback(async () => {
    setAdminsLoading(true);
    try {
      const rows = await fetchPlatformAdmins();
      setPlatformAdmins(rows);
    } catch (err) {
      Alert.alert('Admins Error', err instanceof Error ? err.message : 'Unable to load platform admins.');
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
    if (!adminContext.is_admin || tab !== 'admins') return;
    const timer = setTimeout(() => {
      void loadAdmins();
    }, 0);
    return () => clearTimeout(timer);
  }, [adminContext.is_admin, loadAdmins, tab]);

  if (loading) return <LoadingState message="Loading admin console…" />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!adminContext.is_admin) {
    return (
      <Screen>
        <PageHeader eyebrow="Restricted" title="Admin Access Required" description="This account is not listed in public.platform_admins." />
        <EmptyState
          icon="shield-outline"
          title="No Platform Admin Role"
          message="Add your verified email to public.platform_admins in Supabase SQL Editor, then reopen the app."
          actionLabel={needsOnboarding ? 'Go to Onboarding' : 'Open Workspace'}
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
    if (tab === 'admins') await loadAdmins();
    setRefreshing(false);
  };

  const openClient = async (userId: string) => {
    setSelectedUserId(userId);
    setDrawerTab('credentials');
    setDetailLoading(true);
    setSuspendReason('');
    try {
      const detail = await fetchAdminClientDetail(userId, true);
      setClientDetail(detail);
      setEditPlan(detail.subscription.plan_code || 'starter');
      setEditStatus(detail.subscription.status || 'active');
      setEditProvider(detail.subscription.billing_provider || 'manual');
      setEditNotes(detail.subscription.notes || '');
    } catch (err) {
      Alert.alert('Client Load Failed', err instanceof Error ? err.message : 'Unable to inspect client.');
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
        billingProvider: editProvider,
        billingCycle: 'monthly',
        periodEnd: null,
        notes: editNotes,
      });
      Alert.alert('Subscription Updated', 'Plan saved and recorded in audit logs.');
      await Promise.all([refreshDetail(), loadClients(), loadOverview()]);
    } catch (err) {
      Alert.alert('Update Failed', err instanceof Error ? err.message : 'Unable to update subscription.');
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
      Alert.alert(nextSuspend ? 'Account Suspended' : 'Account Restored', 'Action recorded in audit logs.');
      setSuspendReason('');
      await Promise.all([refreshDetail(), loadClients(), loadOverview()]);
    } catch (err) {
      Alert.alert('Action Failed', err instanceof Error ? err.message : 'Unable to update suspension status.');
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
        summary: `Triggered password reset email for ${clientDetail.credentials.email} from mobile admin`,
      });
      Alert.alert('Reset Sent', `Password reset email sent to ${clientDetail.credentials.email}.`);
      await refreshDetail();
    } catch (err) {
      Alert.alert('Reset Failed', err instanceof Error ? err.message : 'Unable to send reset email.');
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
      Alert.alert('Admin Saved', `Access granted to ${newAdminEmail.trim()}.`);
      setNewAdminEmail('');
      setNewAdminNotes('');
      await loadAdmins();
    } catch (err) {
      Alert.alert('Failed', err instanceof Error ? err.message : 'Unable to save platform admin.');
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/sign-in');
  };

  const sqlSnippet = `insert into public.platform_admins (email, role, notes)
values ('your-email@bookoraph.com', 'super_admin', 'Founder')
on conflict (lower(email)) do update set role = excluded.role, is_active = true;`;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <PageHeader
        eyebrow={`Platform Admin · ${adminContext.role || 'admin'}`}
        title="Bookora Control"
        description={adminContext.email || session.user.email || ''}
        action={
          <Pressable
            accessibilityLabel="Sign out"
            onPress={() => void handleSignOut()}
            style={styles.headerActionBtn}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.ink} />
          </Pressable>
        }
      />

      {/* Top Segmented Navigation */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {(
          [
            ['overview', 'Overview', 'pulse-outline'],
            ['clients', 'Clients', 'business-outline'],
            ['audit', 'Audit Logs', 'shield-checkmark-outline'],
            ['admins', 'Plans & Admins', 'settings-outline'],
          ] as [MainTab, string, keyof typeof Ionicons.glyphMap][]
        ).map(([key, label, icon]) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[styles.tabPill, active && styles.tabPillActive]}
            >
              <Ionicons name={icon} size={15} color={active ? '#fff' : colors.ink} />
              <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

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
                  label="Business Clients"
                  value={stats?.total_businesses ?? 0}
                  sublabel={`${stats?.total_auth_users ?? 0} auth users`}
                  icon="storefront-outline"
                  tone="coral"
                />
                <Metric
                  label="Active Plans"
                  value={stats?.active_subscriptions ?? 0}
                  sublabel="Starter default active"
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
                  label="Audit (24h)"
                  value={stats?.audit_events_24h ?? 0}
                  sublabel={`${stats?.suspended_users ?? 0} suspended`}
                  icon="shield-outline"
                  tone="peach"
                />
              </View>

              <Card style={styles.cardGap}>
                <Text style={styles.cardTitle}>Subscription Tiers</Text>
                <Text style={styles.muted}>
                  Existing businesses were set to Starter until you enable the Xendit paywall.
                </Text>
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
                <Button label="Browse Clients" icon="people-outline" onPress={() => setTab('clients')} />
              </Card>

              <Card style={styles.cardGap}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Recent Security & Audit Events</Text>
                  <Pressable onPress={() => setTab('audit')}>
                    <Text style={styles.linkText}>View all</Text>
                  </Pressable>
                </View>
                {recentLogs.length === 0 ? (
                  <Text style={styles.muted}>No audit events recorded yet.</Text>
                ) : (
                  recentLogs.map((log) => (
                    <Pressable key={log.id} style={styles.listItem} onPress={() => setInspectedLog(log)}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.itemTitle}>{log.summary}</Text>
                        <Text style={styles.mutedSmall}>
                          {log.action} · {log.actor_email || 'system'} · {formatDateTime(log.created_at)}
                        </Text>
                      </View>
                      <StatusBadge status={log.severity === 'info' ? 'active' : 'failed'} />
                    </Pressable>
                  ))
                )}
              </Card>
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
                  {type === 'business' ? 'Businesses' : type === 'all' ? 'All Users' : type === 'staff' ? 'Staff' : 'Customers'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {[{ code: 'all', name: 'All Plans' }, ...plans].map((p) => (
              <Pressable
                key={p.code}
                onPress={() => setPlanFilter(p.code)}
                style={[styles.filterChip, planFilter === p.code && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, planFilter === p.code && styles.filterChipTextActive]}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.mutedSmall}>
            Showing {clients.length} of {clientsTotal} accounts
          </Text>

          {clientsLoading ? (
            <Card>
              <ActivityIndicator color={colors.coral} />
            </Card>
          ) : clients.length === 0 ? (
            <EmptyState
              icon="business-outline"
              title="No Clients Found"
              message="Try clearing your search or switching plan/account filters."
            />
          ) : (
            clients.map((c) => (
              <Pressable key={c.user_id} onPress={() => void openClient(c.user_id)}>
                <Card style={styles.clientCard}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.itemTitle}>{c.business_name || c.full_name || 'No Business Profile'}</Text>
                      <Text style={styles.mutedSmall}>{c.email || c.user_id}</Text>
                    </View>
                    <StatusBadge status={c.is_suspended ? 'blocked' : c.plan_code} />
                  </View>

                  <View style={styles.metaStrip}>
                    <Text style={styles.metaPill}>
                      {c.email_confirmed_at ? '✓ Verified' : 'Unverified'}
                    </Text>
                    <Text style={styles.metaPill}>{c.auth_providers.join(', ') || 'email'}</Text>
                    {c.mfa_enabled ? <Text style={styles.metaPill}>2FA</Text> : null}
                    <Text style={styles.metaPill}>
                      {c.appointments_count} appts · {c.services_count} services
                    </Text>
                  </View>

                  <View style={styles.rowBetween}>
                    <Text style={styles.mutedSmall}>
                      {c.slug ? `/${c.slug}` : c.account_type} · {c.subscription_status} ({formatCurrency(c.monthly_price_php)}/mo)
                    </Text>
                    <Text style={styles.linkText}>Inspect ›</Text>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </View>
      )}

      {tab === 'audit' && (
        <View style={styles.sectionGap}>
          <View style={styles.segmentRow}>
            <Pressable
              onPress={() => setAuditView('admin')}
              style={[styles.segmentBtn, auditView === 'admin' && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, auditView === 'admin' && styles.segmentTextActive]}>
                Admin & Platform Logs
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setAuditView('security')}
              style={[styles.segmentBtn, auditView === 'security' && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, auditView === 'security' && styles.segmentTextActive]}>
                Password & Security Logs
              </Text>
            </Pressable>
          </View>

          <SearchField
            value={auditSearch}
            onChangeText={setAuditSearch}
            placeholder="Search actor, target email, or action…"
          />

          {auditView === 'admin' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {['all', 'info', 'warning', 'critical'].map((sev) => (
                <Pressable
                  key={sev}
                  onPress={() => setSeverityFilter(sev)}
                  style={[styles.filterChip, severityFilter === sev && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, severityFilter === sev && styles.filterChipTextActive]}>
                    {sev === 'all' ? 'All Severities' : sev}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {auditLoading ? (
            <Card>
              <ActivityIndicator color={colors.coral} />
            </Card>
          ) : auditView === 'admin' ? (
            auditLogs.length === 0 ? (
              <EmptyState icon="shield-outline" title="No Audit Logs" message="No events match your current filters." />
            ) : (
              auditLogs.map((log) => (
                <Pressable key={log.id} onPress={() => setInspectedLog(log)}>
                  <Card style={styles.cardGap}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.codeText}>{log.action}</Text>
                      <StatusBadge status={log.severity === 'info' ? 'active' : 'failed'} />
                    </View>
                    <Text style={styles.itemTitle}>{log.summary}</Text>
                    <Text style={styles.mutedSmall}>
                      Actor: {log.actor_email || 'system'} ({log.actor_role}) · {formatDateTime(log.created_at)}
                    </Text>
                  </Card>
                </Pressable>
              ))
            )
          ) : securityLogs.length === 0 ? (
            <EmptyState icon="key-outline" title="No Security Logs" message="No password update records found." />
          ) : (
            securityLogs.map((sl) => (
              <Card key={sl.id} style={styles.cardGap}>
                <View style={styles.rowBetween}>
                  <Text style={styles.codeText}>{sl.action}</Text>
                  <Text style={styles.mutedSmall}>{formatDateTime(sl.created_at)}</Text>
                </View>
                <Text style={styles.itemTitle}>{sl.user_email || sl.user_id}</Text>
                <Text style={styles.mutedSmall}>
                  {sl.business_name || '—'} · {sl.details || 'Password updated'}
                </Text>
              </Card>
            ))
          )}
        </View>
      )}

      {tab === 'admins' && (
        <View style={styles.sectionGap}>
          <Card style={styles.cardGap}>
            <Text style={styles.cardTitle}>Subscription Tiers & Xendit Paywall</Text>
            {plans.map((p) => (
              <View key={p.code} style={styles.listItem}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.itemTitle}>
                    {p.name} ({formatCurrency(p.monthly_price_php)}/mo)
                  </Text>
                  <Text style={styles.mutedSmall}>
                    {p.description} · Staff: {p.max_staff ?? 'Unlimited'} · Locations: {p.max_locations ?? 'Unlimited'}
                  </Text>
                </View>
                <StatusBadge status={p.is_active ? 'active' : 'paused'} />
              </View>
            ))}
            <Text style={styles.mutedSmall}>
              Xendit checkout & webhook Edge Functions (`xendit-create-checkout` & `xendit-webhook`) are ready in Supabase. Add `XENDIT_SECRET_KEY` and `XENDIT_CALLBACK_TOKEN` when going live.
            </Text>
          </Card>

          <Card style={styles.cardGap}>
            <Text style={styles.cardTitle}>Platform Admins</Text>
            {adminsLoading ? (
              <ActivityIndicator color={colors.coral} />
            ) : (
              platformAdmins.map((pa) => (
                <View key={pa.id} style={styles.listItem}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.itemTitle}>{pa.email}</Text>
                    <Text style={styles.mutedSmall}>
                      {pa.role} · {pa.user_id ? 'Auth linked' : 'Pending first sign-in'}
                    </Text>
                  </View>
                  <StatusBadge status={pa.is_active ? 'active' : 'paused'} />
                </View>
              ))
            )}

            {isSuperAdmin && (
              <View style={styles.formGap}>
                <Field
                  label="Grant Admin Email"
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
                <Field
                  label="Notes"
                  placeholder="e.g. Ops lead"
                  value={newAdminNotes}
                  onChangeText={setNewAdminNotes}
                />
                <Button
                  label={savingAdmin ? 'Saving…' : 'Grant Admin Access'}
                  icon="shield-checkmark-outline"
                  onPress={() => void handleAddAdmin()}
                  disabled={savingAdmin}
                />
              </View>
            )}

            <Button
              label="Copy Supabase Admin SQL"
              icon="copy-outline"
              secondary
              compact
              onPress={() => void copyOrShare('Supabase Admin SQL', sqlSnippet)}
            />
          </Card>

          {!needsOnboarding && (
            <Button
              label="Open My Salon Workspace"
              icon="storefront-outline"
              secondary
              onPress={() => router.replace('/(tabs)')}
            />
          )}
        </View>
      )}

      {/* Client Detail Modal */}
      <Modal
        visible={Boolean(selectedUserId)}
        animationType="slide"
        onRequestClose={() => {
          setSelectedUserId(null);
          setClientDetail(null);
        }}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>Inspect Client</Text>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {clientDetail?.business_profile?.business_name
                  ? String(clientDetail.business_profile.business_name)
                  : clientDetail?.credentials.email || 'Loading…'}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close"
              onPress={() => {
                setSelectedUserId(null);
                setClientDetail(null);
              }}
              style={styles.headerActionBtn}
            >
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>

          {detailLoading || !clientDetail ? (
            <LoadingState message="Loading client credentials & profile…" />
          ) : (
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {(
                  [
                    ['credentials', 'Credentials'],
                    ['profile', 'Business Profile'],
                    ['plan', 'Subscription'],
                    ['logs', 'Logs'],
                  ] as [DrawerTab, string][]
                ).map(([key, label]) => (
                  <Pressable
                    key={key}
                    onPress={() => setDrawerTab(key)}
                    style={[styles.filterChip, drawerTab === key && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, drawerTab === key && styles.filterChipTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {drawerTab === 'credentials' && (
                <View style={styles.sectionGap}>
                  <Card style={styles.infoBanner}>
                    <Text style={styles.itemTitle}>Password Security Note</Text>
                    <Text style={styles.mutedSmall}>
                      Supabase Auth hashes passwords with one-way bcrypt, so raw passwords are never readable. You can verify password status, auth identities, 2FA, metadata, and trigger a reset below.
                    </Text>
                  </Card>

                  <Card style={styles.cardGap}>
                    <Pressable onPress={() => void copyOrShare('User ID', clientDetail.credentials.user_id)}>
                      <Text style={styles.mutedSmall}>User ID (tap to copy)</Text>
                      <Text style={styles.codeText}>{clientDetail.credentials.user_id}</Text>
                    </Pressable>
                    <View style={styles.kvRow}>
                      <Text style={styles.mutedSmall}>Primary Email</Text>
                      <Text style={styles.itemTitle}>{clientDetail.credentials.email || '—'}</Text>
                      <Text style={styles.mutedSmall}>
                        {clientDetail.credentials.email_confirmed_at
                          ? `Verified ${formatDateTime(clientDetail.credentials.email_confirmed_at)}`
                          : 'Unverified'}
                      </Text>
                    </View>
                    <View style={styles.kvRow}>
                      <Text style={styles.mutedSmall}>Auth Phone</Text>
                      <Text style={styles.itemTitle}>{clientDetail.credentials.phone || 'Not set'}</Text>
                    </View>
                    <View style={styles.kvRow}>
                      <Text style={styles.mutedSmall}>Password & 2FA</Text>
                      <Text style={styles.itemTitle}>
                        {clientDetail.credentials.has_password ? 'Password Set (bcrypt)' : 'OAuth / Passwordless'} ·{' '}
                        {clientDetail.credentials.mfa_factors.length} 2FA factors
                      </Text>
                      <Text style={styles.mutedSmall}>
                        Password updated: {formatDateTime(clientDetail.credentials.password_updated_at)}
                      </Text>
                    </View>
                    <View style={styles.kvRow}>
                      <Text style={styles.mutedSmall}>Last Sign-In & Created</Text>
                      <Text style={styles.itemTitle}>{formatDateTime(clientDetail.credentials.last_sign_in_at)}</Text>
                      <Text style={styles.mutedSmall}>Created: {formatDateTime(clientDetail.credentials.created_at)}</Text>
                    </View>
                    <View style={styles.kvRow}>
                      <Text style={styles.mutedSmall}>Auth Providers</Text>
                      <Text style={styles.itemTitle}>
                        {clientDetail.credentials.identities.map((i) => i.provider).join(', ') || 'email'}
                      </Text>
                    </View>
                  </Card>

                  <Card style={styles.cardGap}>
                    <Text style={styles.cardTitle}>Raw User & App Metadata</Text>
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

                  {clientDetail.credentials.email && (
                    <Button
                      label={sendingReset ? 'Sending…' : 'Send Password Reset Email'}
                      icon="mail-outline"
                      secondary
                      onPress={() => void handleSendPasswordReset()}
                      disabled={sendingReset}
                    />
                  )}

                  {canMutate && clientDetail.credentials.user_id !== session.user.id && (
                    <Card style={styles.cardGap}>
                      <Field
                        label="Suspension / Restore Reason"
                        placeholder="Logged to security audit"
                        value={suspendReason}
                        onChangeText={setSuspendReason}
                      />
                      <Button
                        label={
                          suspending
                            ? 'Updating…'
                            : clientDetail.credentials.is_suspended
                              ? 'Restore Account'
                              : 'Suspend Account'
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

              {drawerTab === 'profile' && (
                <View style={styles.sectionGap}>
                  {!clientDetail.business_profile ? (
                    <EmptyState
                      icon="storefront-outline"
                      title="No Business Profile"
                      message="This account has not completed business onboarding yet."
                    />
                  ) : (
                    <>
                      <Card style={styles.cardGap}>
                        <Text style={styles.cardTitle}>{String(clientDetail.business_profile.business_name || 'Business')}</Text>
                        <Text style={styles.mutedSmall}>
                          Slug: /{String(clientDetail.business_profile.slug || '—')} ·{' '}
                          {String(clientDetail.business_profile.industry || '—')}
                        </Text>
                        <Text style={styles.mutedSmall}>
                          Email: {String(clientDetail.business_profile.email || '—')}
                        </Text>
                        <Text style={styles.mutedSmall}>
                          Phone: {String(clientDetail.business_profile.country_code || '')}{' '}
                          {String(clientDetail.business_profile.phone || '—')}
                        </Text>
                        <Text style={styles.mutedSmall}>
                          Address:{' '}
                          {[
                            clientDetail.business_profile.address,
                            clientDetail.business_profile.city,
                            clientDetail.business_profile.country,
                          ]
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </Text>
                        <Text style={styles.mutedSmall}>
                          Branding: {String(clientDetail.business_profile.brand_color || 'coral')} ·{' '}
                          {String(clientDetail.business_profile.theme || 'Light')}
                        </Text>
                      </Card>

                      <View style={styles.metricGrid}>
                        <Metric label="Services" value={clientDetail.stats.services_count} icon="cut-outline" tone="coral" />
                        <Metric
                          label="Appointments"
                          value={clientDetail.stats.appointments_count}
                          icon="calendar-outline"
                          tone="mint"
                        />
                        <Metric label="Clients" value={clientDetail.stats.clients_count} icon="people-outline" tone="lilac" />
                        <Metric
                          label="Paid Revenue"
                          value={formatCurrency(clientDetail.stats.paid_revenue_php)}
                          icon="cash-outline"
                          tone="peach"
                        />
                      </View>
                    </>
                  )}
                </View>
              )}

              {drawerTab === 'plan' && (
                <View style={styles.sectionGap}>
                  <Card style={styles.cardGap}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.cardTitle}>{clientDetail.subscription.plan_name}</Text>
                      <StatusBadge status={clientDetail.subscription.status} />
                    </View>
                    <Text style={styles.mutedSmall}>
                      Provider: {clientDetail.subscription.billing_provider} · {clientDetail.subscription.billing_cycle} (
                      {formatCurrency(clientDetail.subscription.amount_php)})
                    </Text>
                    <Text style={styles.mutedSmall}>
                      Updated: {formatDateTime(clientDetail.subscription.updated_at)}
                    </Text>
                  </Card>

                  {canMutate && (
                    <Card style={styles.cardGap}>
                      <Text style={styles.cardTitle}>Change Subscription Plan</Text>
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

                      <Text style={styles.mutedSmall}>Status</Text>
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

                      <Field
                        label="Audit Note"
                        placeholder="e.g. Manual upgrade to Pro"
                        value={editNotes}
                        onChangeText={setEditNotes}
                      />
                      <Button
                        label={savingSub ? 'Saving…' : 'Save Subscription Change'}
                        icon="checkmark-outline"
                        onPress={() => void handleSaveSubscription()}
                        disabled={savingSub}
                      />
                    </Card>
                  )}
                </View>
              )}

              {drawerTab === 'logs' && (
                <View style={styles.sectionGap}>
                  <Card style={styles.cardGap}>
                    <Text style={styles.cardTitle}>Client Audit Events</Text>
                    {clientDetail.recent_audit_logs.length === 0 ? (
                      <Text style={styles.mutedSmall}>No audit events yet.</Text>
                    ) : (
                      clientDetail.recent_audit_logs.map((l) => (
                        <View key={l.id} style={styles.listItem}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>{l.summary}</Text>
                            <Text style={styles.mutedSmall}>
                              {l.action} · {formatDateTime(l.created_at)}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </Card>

                  <Card style={styles.cardGap}>
                    <Text style={styles.cardTitle}>Password & Security Logs</Text>
                    {clientDetail.recent_security_logs.length === 0 ? (
                      <Text style={styles.mutedSmall}>No security log events.</Text>
                    ) : (
                      clientDetail.recent_security_logs.map((sl) => (
                        <View key={sl.id} style={styles.listItem}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>{sl.action}</Text>
                            <Text style={styles.mutedSmall}>
                              {sl.details || '—'} · {formatDateTime(sl.created_at)}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </Card>
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
        onRequestClose={() => setInspectedLog(null)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>Audit Event</Text>
              <Text style={styles.modalTitle}>{inspectedLog?.action}</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={() => setInspectedLog(null)} style={styles.headerActionBtn}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          {inspectedLog && (
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Card style={styles.cardGap}>
                <Text style={styles.itemTitle}>{inspectedLog.summary}</Text>
                <Text style={styles.mutedSmall}>
                  Actor: {inspectedLog.actor_email || 'system'} ({inspectedLog.actor_role})
                </Text>
                <Text style={styles.mutedSmall}>Target: {inspectedLog.target_email || '—'}</Text>
                <Text style={styles.mutedSmall}>When: {formatDateTime(inspectedLog.created_at)}</Text>
              </Card>
              {inspectedLog.before_state && (
                <Card style={styles.cardGap}>
                  <Text style={styles.cardTitle}>Before State</Text>
                  <Text style={styles.jsonBlock}>{JSON.stringify(inspectedLog.before_state, null, 2)}</Text>
                </Card>
              )}
              {inspectedLog.after_state && (
                <Card style={styles.cardGap}>
                  <Text style={styles.cardTitle}>After State</Text>
                  <Text style={styles.jsonBlock}>{JSON.stringify(inspectedLog.after_state, null, 2)}</Text>
                </Card>
              )}
              <Card style={styles.cardGap}>
                <Text style={styles.cardTitle}>Metadata</Text>
                <Text style={styles.jsonBlock}>{JSON.stringify(inspectedLog.metadata || {}, null, 2)}</Text>
              </Card>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRow: { gap: 8, paddingVertical: 2 },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  tabPillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabPillText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  tabPillTextActive: { color: '#fff' },
  sectionGap: { gap: space.md },
  cardGap: { gap: space.sm },
  formGap: { gap: space.md, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.line },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  itemTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  mutedSmall: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  linkText: { color: colors.coral, fontSize: 13, fontWeight: '700' },
  eyebrow: { color: colors.coral, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tierRow: { flexDirection: 'row', gap: 8 },
  tierChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#F4F1EC',
    alignItems: 'center',
  },
  tierVal: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  tierLbl: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: colors.coralSoft, borderColor: colors.coral },
  filterChipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: colors.coral },
  clientCard: { gap: 10 },
  metaStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F4F1EC',
    color: colors.ink,
    fontSize: 11,
    fontWeight: '600',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#F4F1EC',
  },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 9 },
  segmentBtnActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  segmentTextActive: { color: colors.ink },
  codeText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: colors.ink },
  modalSafe: { flex: 1, backgroundColor: colors.canvas },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  modalScroll: { padding: space.lg, gap: space.md, paddingBottom: 60 },
  infoBanner: { backgroundColor: colors.sky, borderColor: '#C5DFEF', gap: 4 },
  kvRow: { gap: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.line },
  jsonBlock: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: colors.ink,
    backgroundColor: '#F6F4F0',
    padding: 10,
    borderRadius: 10,
  },
});
