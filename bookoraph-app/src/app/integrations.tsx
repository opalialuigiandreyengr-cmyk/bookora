import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { Button, Card, EmptyState, Field, Screen, StatusBadge } from '@/components/ui';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';
import type { IntegrationProvider } from '@/types';

const WEBHOOK_EVENTS = [
  'appointment.created',
  'appointment.updated',
  'appointment.cancelled',
  'payment.completed',
  'payment.failed',
  'client.created',
];

const PROVIDER_META: Record<
  IntegrationProvider,
  { label: string; category: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  google_calendar: {
    label: 'Google Calendar',
    category: 'Calendar Sync',
    icon: 'calendar-outline',
  },
  outlook_calendar: {
    label: 'Outlook Calendar',
    category: 'Calendar Sync',
    icon: 'calendar-clear-outline',
  },
  apple_calendar: {
    label: 'Apple iCloud Calendar',
    category: 'Calendar Sync',
    icon: 'logo-apple',
  },
  zoom: {
    label: 'Zoom Video Meetings',
    category: 'Video Links',
    icon: 'videocam-outline',
  },
  webhooks: {
    label: 'Outbound Webhooks',
    category: 'Automation',
    icon: 'git-network-outline',
  },
  accounting: {
    label: 'Accounting & Ledger Export',
    category: 'Finance',
    icon: 'calculator-outline',
  },
};

export default function IntegrationsScreen() {
  const {
    integrationConnections,
    apiTokens,
    webhookEndpoints,
    webhookDeliveries,
    toggleIntegrationConnection,
    rotateCalendarFeedToken,
    issueApiToken,
    revokeApiToken,
    saveWebhookEndpoint,
    deleteWebhookEndpoint,
    refreshing,
    refresh,
  } = useApp();

  const [feedUrl, setFeedUrl] = useState(
    'https://bookoraph.app/api/calendar/ics/live-feed.ics'
  );
  const [selectedScope, setSelectedScope] = useState<
    'webhooks:write' | 'api:read' | 'api:write'
  >('api:read');
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);

  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [whName, setWhName] = useState('');
  const [whUrl, setWhUrl] = useState('');
  const [whSecret, setWhSecret] = useState('');
  const [whEvents, setWhEvents] = useState<string[]>([
    'appointment.created',
    'payment.completed',
  ]);
  const [whActive, setWhActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const handleRotateFeed = async () => {
    const res = await rotateCalendarFeedToken();
    if (res.error) {
      Alert.alert('Could not rotate feed URL', res.error);
      return;
    }
    if (res.url) {
      setFeedUrl(res.url);
      Alert.alert('Feed token rotated', 'Your new private iCal URL is ready.');
    }
  };

  const handleShareFeed = async () => {
    await Share.share({
      title: 'Bookora Calendar ICS Feed',
      message: feedUrl,
    });
  };

  const handleIssueToken = async () => {
    setBusy(true);
    const result = await issueApiToken(selectedScope);
    setBusy(false);
    if (result.error) {
      Alert.alert('Could not issue token', result.error);
      return;
    }
    if (result.token) {
      setIssuedSecret(result.token);
    }
  };

  const toggleWebhookEvent = (evt: string) => {
    setWhEvents((prev) =>
      prev.includes(evt) ? prev.filter((item) => item !== evt) : [...prev, evt]
    );
  };

  const handleSaveWebhook = async () => {
    if (!whUrl.trim().startsWith('http')) {
      Alert.alert('Valid HTTPS URL required', 'Enter an endpoint starting with https://');
      return;
    }
    setBusy(true);
    const err = await saveWebhookEndpoint({
      id: '',
      name: whName.trim() || 'Production Webhook',
      url: whUrl.trim(),
      signing_secret:
        whSecret.trim() || `whsec_${Math.random().toString(36).slice(2, 12)}`,
      events: whEvents,
      active: whActive,
      last_delivery_at: null,
      last_error: '',
    });
    setBusy(false);
    if (err) {
      Alert.alert('Could not save webhook', err);
      return;
    }
    setWebhookModalOpen(false);
    setWhName('');
    setWhUrl('');
    setWhSecret('');
  };

  const connectedCount = integrationConnections.filter(
    (item) => item.status === 'connected'
  ).length;

  return (
    <>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Card style={styles.heroCard}>
          <Text style={styles.eyebrow}>ECOSYSTEM, API & WEBHOOKS</Text>
          <Text style={styles.heroTitle}>Integrations & Webhooks</Text>
          <Text style={styles.heroSub}>
            Sync external calendars, connect video & accounting tools, and stream real-time webhook events.
          </Text>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Connected Providers</Text>
          <Text style={styles.sectionSub}>{connectedCount} active</Text>
        </View>

        <View style={styles.list}>
          {integrationConnections.map((conn) => {
            const meta = PROVIDER_META[conn.provider] || {
              label: conn.provider,
              category: 'Integration',
              icon: 'extension-puzzle-outline',
            };
            const isConnected = conn.status === 'connected';
            return (
              <Card key={conn.provider} style={styles.connCard}>
                <View style={styles.connRow}>
                  <View style={styles.connIcon}>
                    <Ionicons
                      name={meta.icon}
                      size={20}
                      color={isConnected ? colors.coral : colors.muted}
                    />
                  </View>
                  <View style={styles.flex1}>
                    <View style={styles.titleRow}>
                      <Text style={styles.connName}>{meta.label}</Text>
                      <StatusBadge status={conn.status} />
                    </View>
                    <Text style={styles.connCategory}>
                      {meta.category} •{' '}
                      {conn.external_account_label || 'Tap switch to connect'}
                    </Text>
                  </View>
                  <Switch
                    value={isConnected}
                    onValueChange={() => void toggleIntegrationConnection(conn.provider)}
                    trackColor={{ false: colors.line, true: colors.coral }}
                  />
                </View>
              </Card>
            );
          })}
        </View>

        {/* Private ICS Calendar Feed */}
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>iCal / ICS Calendar Feed</Text>
              <Text style={styles.sectionSub}>
                Subscribe in Apple Calendar, Google, or Outlook
              </Text>
            </View>
          </View>
          <View style={styles.codeBox}>
            <Text style={styles.codeText} numberOfLines={2}>
              {feedUrl}
            </Text>
          </View>
          <View style={styles.row2}>
            <View style={styles.flex1}>
              <Button
                label="Share Feed URL"
                icon="share-outline"
                secondary
                onPress={() => void handleShareFeed()}
                compact
              />
            </View>
            <View style={styles.flex1}>
              <Button
                label="Rotate Token"
                icon="refresh-outline"
                secondary
                onPress={() => void handleRotateFeed()}
                compact
              />
            </View>
          </View>
        </Card>

        {/* Outbound Webhooks */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Outbound Webhook Endpoints</Text>
            <Text style={styles.sectionSub}>{webhookEndpoints.length} configured</Text>
          </View>
          <Button
            label="Add Endpoint"
            icon="add"
            compact
            onPress={() => setWebhookModalOpen(true)}
          />
        </View>

        {webhookEndpoints.length === 0 ? (
          <EmptyState
            icon="git-network-outline"
            title="No webhook endpoints"
            message="Send signed JSON payloads to Zapier, Make, n8n, or your custom backend when bookings change."
            actionLabel="Add Webhook Endpoint"
            onAction={() => setWebhookModalOpen(true)}
          />
        ) : (
          <View style={styles.list}>
            {webhookEndpoints.map((ep) => (
              <Card key={ep.id} style={styles.whCard}>
                <View style={styles.whTop}>
                  <View style={styles.flex1}>
                    <View style={styles.titleRow}>
                      <Text style={styles.connName}>{ep.name}</Text>
                      <StatusBadge status={ep.active ? 'active' : 'paused'} />
                    </View>
                    <Text style={styles.whUrl}>{ep.url}</Text>
                  </View>
                  <Pressable
                    onPress={() => void deleteWebhookEndpoint(ep.id)}
                    style={styles.deleteBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </Pressable>
                </View>
                <View style={styles.chipsWrap}>
                  {ep.events.map((evt: string) => (
                    <View key={evt} style={styles.evtPill}>
                      <Text style={styles.evtText}>{evt}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Recent Webhook Deliveries */}
        {webhookDeliveries.length > 0 ? (
          <Card style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Webhook Deliveries</Text>
              <Text style={styles.sectionSub}>Latest HTTP dispatch logs</Text>
            </View>
            {webhookDeliveries.slice(0, 6).map((del) => (
              <View key={del.id} style={styles.deliveryRow}>
                <View style={styles.flex1}>
                  <Text style={styles.deliveryEvent}>{del.event_type}</Text>
                  <Text style={styles.deliveryMeta}>
                    Attempts: {del.attempt_count} • {del.created_at.slice(0, 16)}
                  </Text>
                </View>
                <StatusBadge
                  status={
                    del.response_status ? `HTTP ${del.response_status}` : del.status
                  }
                />
              </View>
            ))}
          </Card>
        ) : null}

        {/* Developer API Keys */}
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Personal API Tokens</Text>
              <Text style={styles.sectionSub}>
                Authenticate REST & automation scripts
              </Text>
            </View>
          </View>

          <Text style={styles.groupLabel}>Token scope</Text>
          <View style={styles.chipsWrap}>
            {(['api:read', 'api:write', 'webhooks:write'] as const).map((scope) => {
              const active = selectedScope === scope;
              return (
                <Pressable
                  key={scope}
                  onPress={() => setSelectedScope(scope)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {scope}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Button
            label={busy ? 'Generating…' : 'Generate API Token'}
            icon="key-outline"
            onPress={() => void handleIssueToken()}
            disabled={busy}
            compact
          />

          {issuedSecret ? (
            <View style={styles.secretBanner}>
              <Text style={styles.secretTitle}>Copy your new API token now:</Text>
              <Text selectable style={styles.secretCode}>
                {issuedSecret}
              </Text>
            </View>
          ) : null}

          {apiTokens.map((tok) => (
            <View key={tok.id} style={styles.tokenRow}>
              <View style={styles.flex1}>
                <Text style={styles.connName}>{tok.token_prefix}••••</Text>
                <Text style={styles.deliveryMeta}>
                  Scopes: {tok.scopes.join(', ')} • Created {tok.created_at.slice(0, 10)}
                </Text>
              </View>
              <Pressable
                onPress={() => void revokeApiToken(tok.id)}
                style={styles.deleteBtn}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          ))}
        </Card>
      </Screen>

      {/* Add Webhook Modal */}
      <Modal
        visible={webhookModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setWebhookModalOpen(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Webhook Endpoint</Text>
              <Pressable
                onPress={() => setWebhookModalOpen(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Field
                label="Endpoint name"
                value={whName}
                onChangeText={setWhName}
                placeholder="e.g. CRM Booking Sync"
              />
              <Field
                label="Target HTTPS URL *"
                value={whUrl}
                onChangeText={setWhUrl}
                placeholder="https://hooks.zapier.com/..."
                keyboardType="url"
              />
              <Field
                label="Signing secret (optional)"
                value={whSecret}
                onChangeText={setWhSecret}
                placeholder="Auto-generated if blank"
              />

              <Text style={styles.groupLabel}>Subscribed events</Text>
              <View style={styles.chipsWrap}>
                {WEBHOOK_EVENTS.map((evt) => {
                  const selected = whEvents.includes(evt);
                  return (
                    <Pressable
                      key={evt}
                      onPress={() => toggleWebhookEvent(evt)}
                      style={[styles.chip, selected && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                        {evt}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.switchRow}>
                <View style={styles.flex1}>
                  <Text style={styles.connName}>Endpoint active</Text>
                  <Text style={styles.deliveryMeta}>Deliver live events immediately</Text>
                </View>
                <Switch
                  value={whActive}
                  onValueChange={setWhActive}
                  trackColor={{ false: colors.line, true: colors.coral }}
                />
              </View>

              <Button
                label={busy ? 'Saving…' : 'Save Webhook Endpoint'}
                icon="checkmark-circle-outline"
                onPress={() => void handleSaveWebhook()}
                disabled={busy}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
    gap: 6,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.peach,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroSub: {
    fontSize: 13,
    lineHeight: 18,
    color: '#CBD5E1',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.muted,
  },
  list: {
    gap: space.sm,
  },
  card: {
    gap: space.md,
  },
  connCard: {
    paddingVertical: space.md,
  },
  connRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  connIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  connName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  connCategory: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  codeBox: {
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    padding: space.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  codeText: {
    fontSize: 12,
    color: colors.ink,
  },
  row2: {
    flexDirection: 'row',
    gap: space.sm,
  },
  whCard: {
    gap: space.sm,
  },
  whTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  whUrl: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  evtPill: {
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  evtText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.coral,
  },
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  deliveryEvent: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  deliveryMeta: {
    fontSize: 11,
    color: colors.muted,
  },
  secretBanner: {
    backgroundColor: colors.peach,
    borderRadius: radius.md,
    padding: space.sm,
    gap: 4,
  },
  secretTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
  },
  secretCode: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: space.lg,
    gap: space.md,
    paddingBottom: space.xxl,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.coral,
    backgroundColor: colors.coralSoft,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  chipTextActive: {
    color: colors.coral,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
});
