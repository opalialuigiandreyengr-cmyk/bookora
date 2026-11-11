import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/app-text';
import { Button, Field, Screen, StatusBadge } from '@/components/ui';
import { computeNextDueDate } from '@/lib/billing';
import { goBackOrReplace } from '@/lib/navigation';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';
import type { NotificationSettings } from '@/types';

const LEAD_OPTIONS = [2, 24, 48, 72] as const;
const isValidTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

function PreferenceToggle({
  label,
  hint,
  value,
  onValueChange,
  last = false,
}: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, last && styles.rowLast]}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleHint}>{hint}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
        thumbColor={value ? colors.coral : '#FFFFFF'}
      />
    </View>
  );
}

export default function NotificationsScreen() {
  const {
    notificationSettings,
    notificationEvents,
    subscription,
    subscriptionAlert,
    saveNotificationSettings,
    retryNotificationEvent,
    refreshing,
    refresh,
  } = useApp();
  const nextDue = computeNextDueDate(subscription);

  const [settingsDraft, setSettingsDraft] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const settings = settingsDraft ?? notificationSettings;
  const hasChanges = useMemo(
    () => settingsDraft !== null && JSON.stringify(settingsDraft) !== JSON.stringify(notificationSettings),
    [notificationSettings, settingsDraft]
  );

  const update = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
    setSettingsDraft((current) => ({ ...(current ?? notificationSettings), [key]: value }));
  };

  const handleSave = async () => {
    if (!settings.sender_name.trim()) {
      Alert.alert('Sender name required', 'Add a sender name before saving.');
      return;
    }
    if (
      (settings.quiet_hours_start && !settings.quiet_hours_end) ||
      (!settings.quiet_hours_start && settings.quiet_hours_end)
    ) {
      Alert.alert('Quiet hours', 'Set both quiet-hours start and end times or leave both blank.');
      return;
    }
    if (
      (settings.quiet_hours_start && !isValidTime(settings.quiet_hours_start)) ||
      (settings.quiet_hours_end && !isValidTime(settings.quiet_hours_end))
    ) {
      Alert.alert('Check quiet hours', 'Use a valid 24-hour time such as 22:00 or 08:30.');
      return;
    }
    if (
      settings.quiet_hours_start &&
      settings.quiet_hours_start === settings.quiet_hours_end
    ) {
      Alert.alert('Check quiet hours', 'Start and end times must be different.');
      return;
    }
    setSaving(true);
    const err = await saveNotificationSettings(settings);
    setSaving(false);
    if (err) Alert.alert('Could not save settings', err);
    else {
      setSettingsDraft(null);
      Alert.alert('Saved', 'Notification settings have been updated.');
    }
  };

  const handleRetry = async (eventId: string) => {
    setRetryingId(eventId);
    const err = await retryNotificationEvent(eventId);
    setRetryingId(null);
    if (err) Alert.alert('Could not requeue notification', err);
    else Alert.alert('Requeued', 'Notification has been scheduled for retry.');
  };

  const renderTimeOptions = (
    selected: number,
    key: 'reminder_lead_hours' | 'no_show_followup_delay_hours',
    suffix: string
  ) => (
    <View style={styles.chipsRow}>
      {LEAD_OPTIONS.map((hours) => {
        const active = selected === hours;
        return (
          <Pressable
            key={hours}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => update(key, hours)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {hours}h {suffix}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Screen
      backgroundColor={colors.surface}
      refreshing={refreshing}
      onRefresh={refresh}
      style={styles.screen}
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
        <Text pointerEvents="none" style={styles.pageTitle}>Notifications</Text>
        <View style={styles.headerSpacer} />
        </View>
      }
    >
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Subscription & billing</Text>
          <Text style={styles.sectionHint}>Monthly plan reminders and settlement notices.</Text>
        </View>
        <Pressable
          onPress={() => router.push('/billing' as Href)}
          style={({ pressed }) => [styles.billingBanner, subscriptionAlert && styles.billingBannerAlert, pressed && styles.pressed]}
        >
          <View style={styles.billingBannerLeft}>
            <View style={[styles.billingIcon, subscriptionAlert && { backgroundColor: colors.coralSoft }]}>
              <Ionicons
                name={subscriptionAlert ? 'alert-circle-outline' : 'card-outline'}
                size={18}
                color={subscriptionAlert ? colors.danger : colors.coral}
              />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.toggleLabel}>
                {subscriptionAlert
                  ? subscriptionAlert.title
                  : `${subscription?.plan_name || 'Starter'} · ₱${Number(subscription?.amount_php ?? 249).toLocaleString('en-PH')}/mo`}
              </Text>
              <Text style={styles.toggleHint}>
                {subscriptionAlert
                  ? subscriptionAlert.message
                  : nextDue
                    ? `Next monthly billing: ${nextDue.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : 'Tap to upgrade or settle monthly payment via Xendit'}
              </Text>
            </View>
          </View>
          <Text style={styles.billingCta}>{subscriptionAlert ? subscriptionAlert.ctaLabel : 'Billing'} ›</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Booking updates</Text>
          <Text style={styles.sectionHint}>Choose what Bookora sends automatically.</Text>
        </View>

        <View style={styles.settingsList}>
          <PreferenceToggle
            label="Customer confirmations"
            hint="Sent when a booking request is received or approved."
            value={settings.customer_confirmation_enabled}
            onValueChange={(value) => update('customer_confirmation_enabled', value)}
          />

          <PreferenceToggle
            label="Appointment reminders"
            hint="Remind clients before upcoming appointments."
            value={settings.reminder_enabled}
            onValueChange={(value) => update('reminder_enabled', value)}
          />
          {settings.reminder_enabled ? (
            <View style={styles.inlineOption}>
              <Text style={styles.optionLabel}>Send reminder</Text>
              {renderTimeOptions(settings.reminder_lead_hours, 'reminder_lead_hours', 'before')}
            </View>
          ) : null}

          <PreferenceToggle
            label="No-show follow-up"
            hint="Follow up after an appointment is marked no-show."
            value={settings.no_show_followup_enabled}
            onValueChange={(value) => update('no_show_followup_enabled', value)}
          />
          {settings.no_show_followup_enabled ? (
            <View style={styles.inlineOption}>
              <Text style={styles.optionLabel}>Send follow-up</Text>
              {renderTimeOptions(
                settings.no_show_followup_delay_hours,
                'no_show_followup_delay_hours',
                'after'
              )}
            </View>
          ) : null}

          <View style={[styles.formBlock, styles.rowLast]}>
            <Text style={styles.toggleLabel}>Quiet hours</Text>
            <Text style={styles.toggleHint}>
              Messages queued during this window wait until it ends.
            </Text>
            <View style={styles.timeFields}>
              <View style={styles.timeField}>
                <Field
                  label="Start"
                  hint="24-hour time"
                  value={settings.quiet_hours_start}
                  onChangeText={(value) => update('quiet_hours_start', value)}
                  placeholder="22:00"
                />
              </View>
              <View style={styles.timeField}>
                <Field
                  label="End"
                  hint="24-hour time"
                  value={settings.quiet_hours_end}
                  onChangeText={(value) => update('quiet_hours_end', value)}
                  placeholder="08:00"
                />
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Email delivery</Text>
          <Text style={styles.sectionHint}>Control how messages appear to your clients.</Text>
        </View>

        <View style={styles.settingsList}>
          <PreferenceToggle
            label="Send email notifications"
            hint="Use email for confirmations, reminders, and follow-ups."
            value={settings.email_enabled}
            onValueChange={(value) => update('email_enabled', value)}
          />
          <View style={[styles.formBlock, styles.rowLast]}>
            <Field
              label="Sender name"
              value={settings.sender_name}
              onChangeText={(value) => update('sender_name', value)}
              placeholder="Your business name"
              maxLength={80}
            />
            <Field
              label="Email signature"
              value={settings.email_signature}
              onChangeText={(value) => update('email_signature', value)}
              placeholder="Thanks, Your team"
              multiline
              maxLength={1000}
            />
          </View>
        </View>
      </View>

      <Button
        label={saving ? 'Saving…' : 'Save changes'}
        disabled={saving || !hasChanges}
        icon="checkmark"
        onPress={() => void handleSave()}
      />

      <View style={styles.section}>
        <View style={styles.historyHeader}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent activity</Text>
            <Text style={styles.sectionHint}>Confirmation and reminder delivery history.</Text>
          </View>
          {notificationEvents.length > 0 ? (
            <Text style={styles.historyCount}>{notificationEvents.length}</Text>
          ) : null}
        </View>

        {notificationEvents.length === 0 ? (
          <View style={styles.emptyHistory}>
            <View style={styles.emptyIcon}>
              <Ionicons name="mail-outline" size={20} color={colors.navy} />
            </View>
            <Text style={styles.emptyTitle}>No delivery activity yet</Text>
            <Text style={styles.emptyMessage}>Sent notifications will appear here.</Text>
          </View>
        ) : (
          <View style={styles.historyList}>
            {notificationEvents.map((event, index) => (
              <View
                key={event.id}
                style={[
                  styles.historyItem,
                  index === notificationEvents.length - 1 && styles.rowLast,
                ]}
              >
                <View style={styles.historyMain}>
                  <View style={styles.historyTopRow}>
                    <Text style={styles.eventType}>{event.event_type.replace(/_/g, ' ')}</Text>
                    <StatusBadge status={event.status} />
                  </View>
                  <Text numberOfLines={1} style={styles.eventRecipient}>
                    {event.recipient}
                  </Text>
                  <Text style={styles.eventDate}>
                    {new Date(event.created_at).toLocaleString('en-PH', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </Text>
                  {event.status === 'failed' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Retry ${event.event_type.replace(/_/g, ' ')} notification`}
                      accessibilityState={{ disabled: retryingId === event.id }}
                      disabled={retryingId === event.id}
                      onPress={() => void handleRetry(event.id)}
                      style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                    >
                      <Ionicons name="refresh" size={14} color={colors.coral} />
                      <Text style={styles.retryText}>{retryingId === event.id ? 'Retrying…' : 'Retry delivery'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 14,
    paddingBottom: 80,
    gap: space.xxl,
  },
  pageHeader: {
    height: 44,
    marginTop: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
  },
  pageTitle: {
    position: 'absolute',
    left: 44,
    right: 44,
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: { width: 34, height: 44 },
  section: { gap: space.md },
  sectionHeader: { flex: 1, gap: 3 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  sectionHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  settingsList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  toggleRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  toggleCopy: { flex: 1, gap: 3 },
  toggleLabel: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  toggleHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  rowLast: { borderBottomWidth: 0 },
  inlineOption: {
    gap: space.sm,
    paddingTop: 2,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  optionLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.canvas,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: colors.navy },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  pressed: { opacity: 0.65 },
  formBlock: {
    gap: space.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  timeFields: { flexDirection: 'row', gap: space.sm },
  timeField: { flex: 1 },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  historyCount: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.canvas,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
  },
  historyList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  historyItem: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  historyMain: { gap: 3 },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  eventType: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  eventRecipient: { color: colors.ink, fontSize: 12 },
  eventDate: { color: colors.muted, fontSize: 11.5 },
  retryButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    paddingRight: 8,
  },
  retryText: { color: colors.coral, fontSize: 12, fontWeight: '700' },
  emptyHistory: { alignItems: 'center', gap: 6, paddingVertical: space.xxl },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  emptyMessage: { color: colors.muted, fontSize: 12 },
  billingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  billingBannerAlert: {
    borderColor: '#F5C4BE',
    backgroundColor: '#FFF7F6',
  },
  billingBannerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  billingIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billingCta: { color: colors.coral, fontSize: 12.5, fontWeight: '800' },
});
