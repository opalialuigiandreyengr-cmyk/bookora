import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import {
  Button,
  Card,
  NativeListGroup,
  NativeListRow,
  Screen,
  SegmentedControl,
  StatusBadge,
} from '@/components/ui';
import {
  calculateCustomerCheckoutPricing,
  computeNextDueDate,
  createSubscriptionCheckout,
  verifySubscriptionCheckout,
  type PublicSubscriptionPlan,
  type SubscriptionCheckoutSession,
} from '@/lib/billing';
import { openExternalLink } from '@/lib/external-links';
import { goBackOrReplace } from '@/lib/navigation';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';

const formatCurrency = (amount: number) =>
  `₱${Number(amount ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

const formatDate = (value: Date | string | null | undefined) => {
  if (!value) return '—';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const PAYMENT_CHANNELS = [
  { label: 'Google Pay', icon: 'logo-google' as const },
  { label: 'Apple Pay', icon: 'logo-apple' as const },
  { label: 'GCash / Maya Card', icon: 'wallet-outline' as const },
  { label: 'Visa / Mastercard', icon: 'card-outline' as const },
  { label: 'PayPal', icon: 'cash-outline' as const },
];

export default function BillingScreen() {
  const {
    subscription,
    subscriptionPlans,
    checkoutSessions,
    subscriptionAlert,
    refreshSubscription,
  } = useApp();

  const [refreshing, setRefreshing] = useState(false);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [checkoutPlan, setCheckoutPlan] = useState<PublicSubscriptionPlan | null>(null);
  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [activeInvoiceUrl, setActiveInvoiceUrl] = useState<string | null>(null);
  const [activeExternalId, setActiveExternalId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState('');

  const plansToShow = useMemo<PublicSubscriptionPlan[]>(() => {
    if (subscriptionPlans.length > 0) return subscriptionPlans;
    return [
      {
        code: 'free',
        name: 'Free',
        description: 'Perfect for getting started.',
        monthly_price_php: 0,
        annual_price_php: 0,
        currency: 'PHP',
        max_staff: 1,
        max_locations: 1,
        features: ['1 business location', 'Basic booking calendar', 'Up to 1 staff', 'Service management'],
        sort_order: 1,
      },
      {
        code: 'starter',
        name: 'Starter',
        description: 'Ideal for small salons.',
        monthly_price_php: 249,
        annual_price_php: 2490,
        currency: 'PHP',
        max_staff: 3,
        max_locations: 1,
        features: ['1 business location', 'Up to 3 staff', 'Online booking page', 'Automated reminders', 'Customer management'],
        sort_order: 2,
      },
      {
        code: 'pro',
        name: 'Pro',
        description: 'For growing salons.',
        monthly_price_php: 499,
        annual_price_php: 4990,
        currency: 'PHP',
        max_staff: null,
        max_locations: 3,
        features: ['Up to 3 locations', 'Unlimited staff', 'Service packages', 'Payments (GCash, Maya, cards)', 'Reports & analytics'],
        sort_order: 3,
      },
    ];
  }, [subscriptionPlans]);

  const currentCode = subscription?.plan_code || 'starter';
  const currentPlanObj = plansToShow.find((p) => p.code === currentCode) || plansToShow[1] || plansToShow[0];
  const nextDue = computeNextDueDate(subscription);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshSubscription();
    setRefreshing(false);
  };

  const openPaymentSheet = (plan: PublicSubscriptionPlan) => {
    setCheckoutPlan(plan);
    setActiveInvoiceUrl(null);
    setActiveExternalId(null);
    setCheckoutError('');
  };

  const handleVerifyPayment = useCallback(
    async (externalId?: string, silentPending = false) => {
      setVerifyingPayment(true);
      setCheckoutError('');
      try {
        const res = await verifySubscriptionCheckout(externalId ? { externalId } : undefined);
        if (!res.ok) {
          if (!silentPending) {
            setCheckoutError(res.error || 'Could not verify payment status yet.');
          }
          return;
        }
        if (res.verified || res.status === 'paid') {
          await refreshSubscription();
          setCheckoutPlan(null);
          setActiveInvoiceUrl(null);
          setActiveExternalId(null);
          Alert.alert('Payment confirmed', res.message || 'Your subscription is now active.');
          return;
        }
        if (res.status === 'expired' || res.status === 'failed') {
          await refreshSubscription();
          setActiveInvoiceUrl(null);
          setCheckoutError(res.message || `Checkout ${res.status}. Please create a new payment session.`);
          return;
        }
        if (!silentPending) {
          Alert.alert('Still pending', res.message || 'Waiting for payment confirmation.');
        }
      } finally {
        setVerifyingPayment(false);
      }
    },
    [refreshSubscription]
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get('checkout_status') || params.get('xendit_status');
    const externalId = params.get('external_id') || undefined;
    if (!checkoutStatus) return;

    const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
    window.history.replaceState({}, '', cleanUrl);

    if (checkoutStatus === 'failed') {
      Alert.alert('Payment not completed', 'The checkout was cancelled or failed. You can try again anytime.');
      return;
    }

    const timer = setTimeout(() => {
      void handleVerifyPayment(externalId, false);
    }, 150);
    return () => clearTimeout(timer);
  }, [handleVerifyPayment]);

  const handlePayWithGateway = async () => {
    if (!checkoutPlan) return;
    setCreatingCheckout(true);
    setCheckoutError('');
    const redirectUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/app/billing`
        : 'https://bookoraph.com/app/billing';

    const result = await createSubscriptionCheckout({
      planCode: checkoutPlan.code,
      billingCycle: cycle,
      redirectUrl,
    });
    setCreatingCheckout(false);

    if (!result.ok || !result.checkoutUrl) {
      setCheckoutError(
        result.configured
          ? result.error || 'Could not start checkout session.'
          : 'Lemon Squeezy keys are not enabled yet. Configure LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, and LEMONSQUEEZY_MONTHLY_VARIANT_ID in Supabase Edge Function secrets.'
      );
      return;
    }

    setActiveInvoiceUrl(result.checkoutUrl);
    setActiveExternalId(result.externalId);
    await refreshSubscription();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(result.checkoutUrl);
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(result.checkoutUrl);
      await handleVerifyPayment(result.externalId || undefined, true);
      await refreshSubscription();
    } catch {
      await openExternalLink(result.checkoutUrl);
    }
  };

  const handleSessionPress = async (sessionRow: SubscriptionCheckoutSession) => {
    if (sessionRow.status === 'pending' && sessionRow.xendit_invoice_url) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.assign(sessionRow.xendit_invoice_url);
        return;
      }
      await openExternalLink(sessionRow.xendit_invoice_url);
      return;
    }
    Alert.alert(
      `${sessionRow.target_plan_code.toUpperCase()} (${sessionRow.billing_cycle})`,
      `Amount: ${formatCurrency(sessionRow.amount_php)}\nStatus: ${sessionRow.status}\nDate: ${formatDate(sessionRow.paid_at || sessionRow.created_at)}`
    );
  };

  const checkoutPrice = checkoutPlan
    ? cycle === 'annual'
      ? checkoutPlan.annual_price_php
      : checkoutPlan.monthly_price_php
    : 0;
  const checkoutPricing = calculateCustomerCheckoutPricing(checkoutPrice);

  return (
    <View style={styles.root}>
      <Screen
        backgroundColor="#FFFFFF"
        refreshing={refreshing}
        onRefresh={onRefresh}
        style={styles.screenContent}
        fixedHeader={
          <View style={styles.pageHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={() => goBackOrReplace('/(tabs)/more')}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>
            <Text pointerEvents="none" style={styles.pageTitle}>
              Plan & Billing
            </Text>
            <View style={styles.headerSpacer} />
          </View>
        }
      >
        {/* Monthly Billing Notification Banner */}
        {subscriptionAlert ? (
          <Card
            style={[
              styles.alertCard,
              subscriptionAlert.level === 'urgent' ? styles.alertUrgent : styles.alertWarning,
            ]}
          >
            <View style={styles.alertRow}>
              <View
                style={[
                  styles.alertIcon,
                  { backgroundColor: subscriptionAlert.level === 'urgent' ? colors.coralSoft : colors.peach },
                ]}
              >
                <Ionicons
                  name={subscriptionAlert.level === 'urgent' ? 'alert-circle' : 'notifications'}
                  size={18}
                  color={subscriptionAlert.level === 'urgent' ? colors.danger : colors.warning}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.alertTitle}>{subscriptionAlert.title}</Text>
                <Text style={styles.alertMessage}>{subscriptionAlert.message}</Text>
              </View>
            </View>
            <Button
              label={subscriptionAlert.ctaLabel}
              icon="card-outline"
              compact
              onPress={() => {
                if (subscriptionAlert.pendingInvoiceUrl) {
                  void openExternalLink(subscriptionAlert.pendingInvoiceUrl);
                } else if (currentPlanObj) {
                  openPaymentSheet(currentPlanObj);
                }
              }}
            />
          </Card>
        ) : null}

        {/* Current Plan Card */}
        <Card style={styles.currentCard}>
          <View style={styles.rowBetween}>
            <View style={{ gap: 2 }}>
              <Text style={styles.mutedSmall}>Current plan</Text>
              <Text style={styles.currentPlanName}>{subscription?.plan_name || currentPlanObj?.name || 'Starter'}</Text>
            </View>
            <StatusBadge status={subscription?.status || 'active'} />
          </View>

          <View style={styles.currentMetaGrid}>
            <View style={styles.currentMetaBox}>
              <Text style={styles.mutedSmall}>Monthly rate</Text>
              <Text style={styles.currentMetaVal}>
                {formatCurrency(subscription?.amount_php ?? currentPlanObj?.monthly_price_php ?? 249)}
                <Text style={styles.mutedSmall}>/{subscription?.billing_cycle === 'annual' ? 'yr' : 'mo'}</Text>
              </Text>
            </View>
            <View style={styles.currentMetaBox}>
              <Text style={styles.mutedSmall}>Next billing date</Text>
              <Text style={styles.currentMetaVal}>{nextDue ? formatDate(nextDue) : 'Monthly cycle'}</Text>
            </View>
          </View>

          {Number(subscription?.amount_php ?? currentPlanObj?.monthly_price_php ?? 0) > 0 && currentPlanObj ? (
            <Button
              label="Settle monthly payment"
              icon="card-outline"
              secondary
              compact
              onPress={() => openPaymentSheet(currentPlanObj)}
            />
          ) : null}
        </Card>

        {/* Billing Cycle Switch */}
        <SegmentedControl
          value={cycle}
          onChange={setCycle}
          items={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'annual', label: 'Annual', badge: '-17%' },
          ]}
        />

        {/* Plans List */}
        <View style={styles.plansStack}>
          {plansToShow.map((plan) => {
            const isCurrent = plan.code === currentCode;
            const price = cycle === 'annual' ? plan.annual_price_php : plan.monthly_price_php;
            const isFree = price <= 0;
            const isUpgrade =
              !isCurrent &&
              price > (cycle === 'annual' ? currentPlanObj?.annual_price_php ?? 0 : currentPlanObj?.monthly_price_php ?? 0);
            return (
              <Card key={plan.code} style={[styles.planCard, isCurrent && styles.planCardCurrent]}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={styles.planTitleRow}>
                      <Text style={styles.planName}>{plan.name}</Text>
                      {isCurrent ? <StatusBadge status="active" /> : null}
                    </View>
                    <Text style={styles.mutedSmall}>{plan.description}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    {cycle === 'annual' && plan.monthly_price_php > 0 && plan.annual_price_php < plan.monthly_price_php * 12 && (
                      <View style={styles.savePillRow}>
                        <Text style={styles.strikeAnnualPrice}>
                          {formatCurrency(plan.monthly_price_php * 12)}
                        </Text>
                        <View style={styles.saveBadge}>
                          <Text style={styles.saveBadgeText}>Save 17%</Text>
                        </View>
                      </View>
                    )}
                    <Text style={styles.planPrice}>{formatCurrency(price)}</Text>
                    <Text style={styles.mutedSmall}>
                      /{cycle === 'annual' ? 'year' : 'month'}
                      {cycle === 'annual' && price > 0 ? ` (${formatCurrency(Math.round(price / 12))}/mo)` : ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.featureList}>
                  {plan.features.map((feat) => (
                    <View key={feat} style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      <Text style={styles.featureText}>{feat}</Text>
                    </View>
                  ))}
                </View>

                {isCurrent ? (
                  isFree ? (
                    <Button label="Current plan" icon="checkmark" secondary compact disabled onPress={() => {}} />
                  ) : (
                    <Button
                      label="Renew / pay monthly"
                      icon="card-outline"
                      secondary
                      compact
                      onPress={() => openPaymentSheet(plan)}
                    />
                  )
                ) : isFree ? (
                  <Button
                    label="Free tier"
                    icon="sparkles-outline"
                    secondary
                    compact
                    disabled
                    onPress={() => {}}
                  />
                ) : (
                  <Button
                    label={isUpgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                    icon="arrow-up-circle-outline"
                    compact
                    onPress={() => openPaymentSheet(plan)}
                  />
                )}
              </Card>
            );
          })}
        </View>

        {/* Payment & Invoice History */}
        <NativeListGroup title="Payment history">
          {checkoutSessions.length === 0 ? (
            <View style={{ padding: space.lg }}>
              <Text style={styles.mutedSmall}>No payment receipts yet.</Text>
            </View>
          ) : (
            checkoutSessions.map((row, idx) => (
              <NativeListRow
                key={row.id}
                first={idx === 0}
                icon={row.status === 'paid' ? 'checkmark-circle-outline' : 'receipt-outline'}
                iconBg={row.status === 'paid' ? colors.mint : row.status === 'pending' ? colors.peach : colors.coralSoft}
                iconColor={row.status === 'paid' ? colors.success : row.status === 'pending' ? colors.warning : colors.danger}
                title={`${row.target_plan_code.toUpperCase()} · ${formatCurrency(row.amount_php)}`}
                subtitle={`${row.billing_cycle} · ${formatDate(row.paid_at || row.created_at)}`}
                badge={row.status}
                chevron={row.status === 'pending' && Boolean(row.xendit_invoice_url)}
                onPress={() => void handleSessionPress(row)}
              />
            ))
          )}
          {checkoutSessions.some((s) => s.status === 'pending') && (
            <View style={{ padding: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }}>
              <Button
                label={verifyingPayment ? 'Checking payment…' : 'Verify pending payment'}
                icon="refresh-outline"
                secondary
                disabled={verifyingPayment}
                onPress={() => {
                  const latestPending = checkoutSessions.find((s) => s.status === 'pending');
                  void handleVerifyPayment(latestPending?.external_id, false);
                }}
              />
            </View>
          )}
        </NativeListGroup>
      </Screen>

      {/* Subscription Checkout Sheet */}
      <Modal
        visible={Boolean(checkoutPlan)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCheckoutPlan(null)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.drawerNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => setCheckoutPlan(null)}
              hitSlop={8}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>
            <Text style={styles.drawerTitle}>Subscription payment</Text>
            <View style={styles.headerSpacer} />
          </View>

          {checkoutPlan && (
            <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Card style={styles.checkoutSummary}>
                <Text style={styles.mutedSmall}>Bookora PH subscription</Text>
                <Text style={styles.checkoutPlanTitle}>{checkoutPlan.name} Plan</Text>
                <Text style={styles.checkoutAmount}>{formatCurrency(checkoutPricing.totalPhp)}</Text>
                <Text style={styles.mutedSmall}>
                  {formatCurrency(checkoutPricing.basePhp)} plan + {formatCurrency(checkoutPricing.feePhp)} processing fee · Billed{' '}
                  {cycle === 'annual' ? 'annually' : 'every month'}
                </Text>
              </Card>

              <NativeListGroup title="Payment summary">
                <NativeListRow
                  first
                  icon="layers-outline"
                  iconBg={colors.coralSoft}
                  iconColor={colors.coral}
                  title="Plan"
                  value={`${checkoutPlan.name} (${cycle === 'annual' ? 'Annual' : 'Monthly'})`}
                  chevron={false}
                />
                <NativeListRow
                  icon="pricetag-outline"
                  iconBg={colors.sky}
                  iconColor={colors.skyInk}
                  title="Plan price"
                  value={formatCurrency(checkoutPricing.basePhp)}
                  chevron={false}
                />
                <NativeListRow
                  icon="shield-checkmark-outline"
                  iconBg={colors.peach}
                  iconColor={colors.warning}
                  title="Processing fee"
                  subtitle="Google Pay, Card & PayPal gateway fee"
                  value={`+${formatCurrency(checkoutPricing.feePhp)}`}
                  chevron={false}
                />
                <NativeListRow
                  icon="cash-outline"
                  iconBg={colors.mint}
                  iconColor={colors.success}
                  title="Total due"
                  value={formatCurrency(checkoutPricing.totalPhp)}
                  chevron={false}
                />
              </NativeListGroup>

              <Card style={styles.cardGap}>
                <Text style={styles.cardTitle}>Supported payment methods</Text>
                <View style={styles.channelsRow}>
                  {PAYMENT_CHANNELS.map((ch) => (
                    <View key={ch.label} style={styles.channelPill}>
                      <Ionicons name={ch.icon} size={14} color={colors.ink} />
                      <Text style={styles.channelText}>{ch.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.mutedSmall}>
                  Link your GCash Mastercard or Maya Visa card inside Google Pay, Apple Pay, or pay directly by card or PayPal.
                </Text>
              </Card>

              {checkoutError ? (
                <Card style={styles.errorBox}>
                  <Text style={styles.errorTitle}>Checkout notice</Text>
                  <Text style={styles.mutedSmall}>{checkoutError}</Text>
                </Card>
              ) : null}

              {activeInvoiceUrl ? (
                <View style={styles.checkoutActions}>
                  <Button
                    label="Open checkout page"
                    icon="open-outline"
                    onPress={() => void openExternalLink(activeInvoiceUrl)}
                  />
                  <Button
                    label={verifyingPayment ? 'Checking payment…' : "I've paid · Verify payment"}
                    icon="refresh-outline"
                    secondary
                    disabled={verifyingPayment}
                    onPress={() => void handleVerifyPayment(activeExternalId || undefined, false)}
                  />
                </View>
              ) : (
                <Button
                  label={
                    creatingCheckout
                      ? 'Preparing checkout…'
                      : `Pay ${formatCurrency(checkoutPricing.totalPhp)} with Google Pay / Card`
                  }
                  icon="lock-closed-outline"
                  disabled={creatingCheckout}
                  onPress={() => void handlePayWithGateway()}
                />
              )}

              {creatingCheckout ? <ActivityIndicator color={colors.coral} style={{ marginTop: 8 }} /> : null}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  screenContent: {
    paddingTop: space.lg,
  },
  savePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  strikeAnnualPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  saveBadge: {
    backgroundColor: colors.mint,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  saveBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.success,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 38 },
  pressed: { opacity: 0.72 },
  alertCard: { gap: 12 },
  alertUrgent: { borderColor: '#F5C4BE', backgroundColor: '#FFF7F6' },
  alertWarning: { borderColor: '#F6DFC0', backgroundColor: '#FFFDF8' },
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  alertIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  alertMessage: { color: colors.muted, fontSize: 12.5, lineHeight: 18 },
  currentCard: { gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  mutedSmall: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  currentPlanName: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  currentMetaGrid: { flexDirection: 'row', gap: 10 },
  currentMetaBox: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    gap: 2,
  },
  currentMetaVal: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  plansStack: { gap: 12 },
  planCard: { gap: 12 },
  planCardCurrent: { borderColor: colors.coral, borderWidth: 1.5 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  planPrice: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  featureList: { gap: 6 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { color: colors.ink, fontSize: 13, flex: 1 },
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
  checkoutSummary: { alignItems: 'center', gap: 4, paddingVertical: 18 },
  checkoutPlanTitle: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  checkoutAmount: { color: colors.coral, fontSize: 32, fontWeight: '800', marginTop: 4 },
  cardGap: { gap: 10 },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  channelsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  channelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
  },
  channelText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  errorBox: { borderColor: '#F6DFC0', backgroundColor: '#FFFDF8', gap: 4 },
  errorTitle: { color: colors.warning, fontSize: 13, fontWeight: '700' },
  checkoutActions: { gap: 10 },
});
