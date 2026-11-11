import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { type ComponentRef, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { Button, Card, StatusBadge } from '@/components/ui';
import {
  askBookoraAssistant,
  ASSISTANT_QUICK_PROMPTS,
  OPENROUTER_FREE_MODELS,
  type AssistantAction,
  type AssistantChatMessage,
} from '@/lib/assistant';
import { goBackOrReplace } from '@/lib/navigation';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';

function normalizeTime24h(raw?: string): string {
  const input = (raw || '').trim().toUpperCase();
  if (!input) return '09:00';
  const match = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return input.slice(0, 5) || '09:00';
  let h = Number(match[1]);
  const m = Number(match[2] || '0');
  const ampm = match[3];
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(Math.max(0, Math.min(23, h))).padStart(2, '0')}:${String(Math.max(0, Math.min(59, m))).padStart(2, '0')}`;
}

function minutesBetween(start: string, end?: string): number {
  if (!end) return 60;
  const [sh, sm] = normalizeTime24h(start).split(':').map(Number);
  const [eh, em] = normalizeTime24h(end).split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff >= 5 ? diff : 60;
}

export default function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const {
    businessName,
    appointments,
    services,
    clients,
    addAppointment,
    updateAppointmentStatus,
    addService,
    addClient,
    addBlockTime,
  } = useApp();

  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState('openrouter/free');
  const [customModel, setCustomModel] = useState('');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [setupNotice, setSetupNotice] = useState('');
  const [executedKeys, setExecutedKeys] = useState<Record<string, 'running' | 'done'>>({});
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const seqRef = useRef(0);

  const nextId = (prefix: string) => {
    seqRef.current += 1;
    return `${prefix}_${seqRef.current}`;
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
  };

  const sendMessage = async (textOverride?: string) => {
    const content = (textOverride ?? draft).trim();
    if (!content || sending) return;

    const userMsg: AssistantChatMessage = {
      id: nextId('u'),
      role: 'user',
      content,
    };
    const nextThread = [...messages, userMsg];
    setMessages(nextThread);
    if (!textOverride) setDraft('');
    setSending(true);
    setSetupNotice('');
    scrollToBottom();

    const apiHistory = nextThread.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const activeModel =
      customModel.trim().endsWith(':free') || customModel.trim() === 'openrouter/free'
        ? customModel.trim()
        : selectedModel;
    const result = await askBookoraAssistant(apiHistory, activeModel);
    setSending(false);

    if (!result.ok) {
      if (!result.configured) {
        setSetupNotice(
          result.error ||
            'Add OPENROUTER_API_KEY in Supabase Edge Function secrets and deploy bookora-ai-assistant to turn on AI.'
        );
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId('e'),
            role: 'assistant',
            content: result.error || 'Could not get a response right now. Please try again.',
          },
        ]);
      }
      scrollToBottom();
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: nextId('a'),
        role: 'assistant',
        content: result.reply,
        actions: result.actions,
        model: result.model,
      },
    ]);
    scrollToBottom();
  };

  const copyOrShareText = async (text: string) => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        Alert.alert('Copied', 'Message copied to clipboard.');
        return;
      }
      await Share.share({ message: text });
    } catch {
      // Ignore cancelled share
    }
  };

  const handleRunAction = async (key: string, action: AssistantAction) => {
    if (executedKeys[key]) return;
    setExecutedKeys((prev) => ({ ...prev, [key]: 'running' }));

    try {
      if (action.type === 'draft_message') {
        await copyOrShareText(action.data.message);
        setExecutedKeys((prev) => ({ ...prev, [key]: 'done' }));
        return;
      }

      if (action.type === 'create_appointment') {
        const matchedService = services.find((s) =>
          s.name.toLowerCase().includes((action.data.service_names || '').toLowerCase().trim())
        );
        const matchedClient = clients.find((c) =>
          c.full_name.toLowerCase().includes((action.data.customer_name || '').toLowerCase().trim())
        );

        const res = await addAppointment({
          customer_name: action.data.customer_name,
          customer_phone: action.data.customer_phone || matchedClient?.phone || '',
          customer_email: action.data.customer_email || matchedClient?.email || '',
          service_names: action.data.service_names || matchedService?.name || 'Service',
          appointment_date: action.data.appointment_date,
          appointment_time: normalizeTime24h(action.data.appointment_time),
          duration_minutes: Number(action.data.duration_minutes || matchedService?.duration_minutes || 60),
          total_price: String(action.data.total_price || matchedService?.price || '0'),
          customer_note: action.data.customer_note || 'Booked via Bookora AI',
          status: action.data.status || 'approved',
        });
        if (res.error) throw new Error(res.error);
        setExecutedKeys((prev) => ({ ...prev, [key]: 'done' }));
        Alert.alert('Booked', `${action.data.customer_name} has been added to your calendar.`);
        return;
      }

      if (action.type === 'update_appointment_status') {
        let targetId = action.data.appointment_id;
        if (!targetId) {
          const nameNeedle = (action.data.customer_name || '').toLowerCase().trim();
          const dateNeedle = (action.data.appointment_date || '').trim();
          const found = appointments.find((a) => {
            const nameMatch = !nameNeedle || a.customer_name.toLowerCase().includes(nameNeedle);
            const dateMatch = !dateNeedle || a.appointment_date === dateNeedle;
            return nameMatch && dateMatch;
          });
          targetId = found?.id;
        }
        if (!targetId) {
          throw new Error('Matching appointment not found in your calendar.');
        }
        const err = await updateAppointmentStatus(targetId, action.data.new_status);
        if (err) throw new Error(err);
        setExecutedKeys((prev) => ({ ...prev, [key]: 'done' }));
        Alert.alert('Updated', `Appointment marked as ${action.data.new_status}.`);
        return;
      }

      if (action.type === 'create_service') {
        const items = Array.isArray(action.data.items) ? action.data.items : [];
        if (items.length === 0) throw new Error('No services to add.');
        for (const item of items) {
          const err = await addService({
            name: item.name,
            price: item.price,
            duration_minutes: Number(item.duration_minutes || 60),
            category: item.category || 'General',
            description: item.description || '',
            show_on_booking_page: true,
          });
          if (err) throw new Error(err);
        }
        setExecutedKeys((prev) => ({ ...prev, [key]: 'done' }));
        Alert.alert('Services added', `${items.length} service${items.length === 1 ? '' : 's'} saved to your catalog.`);
        return;
      }

      if (action.type === 'create_client') {
        const err = await addClient({
          full_name: action.data.full_name,
          phone: action.data.phone || '',
          email: action.data.email || '',
          notes: action.data.notes || '',
        });
        if (err) throw new Error(err);
        setExecutedKeys((prev) => ({ ...prev, [key]: 'done' }));
        Alert.alert('Client saved', `${action.data.full_name} added to Clients.`);
        return;
      }

      if (action.type === 'block_time') {
        const start = normalizeTime24h(action.data.start_time);
        const duration = minutesBetween(start, action.data.end_time);
        const err = await addBlockTime({
          title: action.data.title || 'Blocked time',
          event_date: action.data.event_date,
          start_time: start,
          duration_minutes: duration,
          personal_event: false,
          notes: action.data.note || '',
        });
        if (err) throw new Error(err);
        setExecutedKeys((prev) => ({ ...prev, [key]: 'done' }));
        Alert.alert('Time blocked', `${action.data.title} on ${action.data.event_date} saved.`);
      }
    } catch (err) {
      setExecutedKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      Alert.alert('Action failed', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.pageHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => goBackOrReplace('/(tabs)')}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.pageTitle}>Bookora AI</Text>
          <Text style={styles.pageSub}>{businessName} · Owner Copilot</Text>
        </View>
        {messages.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear chat"
            hitSlop={8}
            onPress={() => {
              setMessages([]);
              setExecutedKeys({});
              setSetupNotice('');
            }}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={18} color={colors.muted} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      {/* Free Model Selector Bar */}
      <View style={styles.modelBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowModelPicker((v) => !v)}
          style={({ pressed }) => [styles.modelPill, pressed && styles.pressed]}
        >
          <Ionicons name="hardware-chip-outline" size={14} color={colors.coral} />
          <Text style={styles.modelPillText} numberOfLines={1}>
            Model:{' '}
            {customModel.trim().endsWith(':free')
              ? customModel.trim()
              : OPENROUTER_FREE_MODELS.find((m) => m.id === selectedModel)?.label || selectedModel}
          </Text>
          <Ionicons name={showModelPicker ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
        </Pressable>
      </View>

      {showModelPicker ? (
        <View style={styles.modelDrawer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modelChipRow}>
            {OPENROUTER_FREE_MODELS.map((m) => {
              const active = !customModel.trim().endsWith(':free') && selectedModel === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    setSelectedModel(m.id);
                    setCustomModel('');
                    setShowModelPicker(false);
                  }}
                  style={({ pressed }) => [
                    styles.modelChoiceChip,
                    active && styles.modelChoiceChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.modelChoiceLabel, active && styles.modelChoiceLabelActive]}>{m.label}</Text>
                  <Text style={styles.modelChoiceNote}>{m.note}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <TextInput
            value={customModel}
            onChangeText={setCustomModel}
            placeholder="Or paste any OpenRouter :free model ID (e.g. google/gemma-4-31b-it:free)"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.modelCustomInput}
          />
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {setupNotice ? (
            <Card style={styles.noticeCard}>
              <View style={styles.noticeHead}>
                <Ionicons name="key-outline" size={17} color={colors.warning} />
                <Text style={styles.noticeTitle}>OpenRouter setup required</Text>
              </View>
              <Text style={styles.noticeText}>{setupNotice}</Text>
            </Card>
          ) : null}

          {messages.length === 0 ? (
            <View style={styles.welcomeWrap}>
              <Card style={styles.welcomeCard}>
                <View style={styles.sparkleBadge}>
                  <Ionicons name="sparkles" size={20} color={colors.coral} />
                </View>
                <Text style={styles.welcomeTitle}>Your AI business assistant</Text>
                <Text style={styles.welcomeBody}>
                  Ask in English or Taglish to check bookings & revenue, add services, block time, book clients, or
                  draft customer reminders.
                </Text>
                <View style={styles.contextRow}>
                  <View style={styles.contextChip}>
                    <Text style={styles.contextChipText}>{appointments.length} bookings</Text>
                  </View>
                  <View style={styles.contextChip}>
                    <Text style={styles.contextChipText}>{services.length} services</Text>
                  </View>
                  <View style={styles.contextChip}>
                    <Text style={styles.contextChipText}>{clients.length} clients</Text>
                  </View>
                </View>
              </Card>

              <Text style={styles.promptSectionLabel}>Try asking</Text>
              <View style={styles.promptsList}>
                {ASSISTANT_QUICK_PROMPTS.map((prompt) => (
                  <Pressable
                    key={prompt}
                    onPress={() => void sendMessage(prompt)}
                    style={({ pressed }) => [styles.promptChip, pressed && styles.pressed]}
                  >
                    <Ionicons name="sparkles-outline" size={14} color={colors.coral} />
                    <Text style={styles.promptChipText}>{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.messagesWrap}>
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <View key={msg.id} style={[styles.msgGroup, isUser ? styles.msgGroupUser : styles.msgGroupBot]}>
                    <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
                      <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextBot]}>
                        {msg.content}
                      </Text>
                    </View>

                    {!isUser && msg.actions && msg.actions.length > 0 ? (
                      <View style={styles.actionsList}>
                        {msg.actions.map((action, idx) => {
                          const key = `${msg.id}_${idx}`;
                          const state = executedKeys[key];
                          const isDraft = action.type === 'draft_message';
                          return (
                            <Card key={key} style={styles.actionCard}>
                              <View style={styles.actionTop}>
                                <Text style={styles.actionLabel}>{action.label || 'Suggested action'}</Text>
                                {state === 'done' ? <StatusBadge status="active" /> : null}
                              </View>
                              {isDraft && action.data.message ? (
                                <Text style={styles.draftPreview}>{action.data.message}</Text>
                              ) : null}
                              <View style={styles.actionBtns}>
                                <Button
                                  label={
                                    state === 'done'
                                      ? isDraft
                                        ? 'Copied'
                                        : 'Completed'
                                      : state === 'running'
                                        ? 'Working…'
                                        : isDraft
                                          ? 'Copy message'
                                          : 'Confirm & run'
                                  }
                                  icon={
                                    state === 'done'
                                      ? 'checkmark-circle-outline'
                                      : isDraft
                                        ? 'copy-outline'
                                        : 'flash-outline'
                                  }
                                  compact
                                  secondary={state === 'done'}
                                  disabled={state === 'running' || (state === 'done' && !isDraft)}
                                  onPress={() => void handleRunAction(key, action)}
                                />
                                {state === 'done' && action.type === 'create_appointment' ? (
                                  <Button
                                    label="Calendar"
                                    icon="calendar-outline"
                                    compact
                                    secondary
                                    onPress={() => router.push('/(tabs)/calendar')}
                                  />
                                ) : null}
                                {state === 'done' && action.type === 'create_service' ? (
                                  <Button
                                    label="Services"
                                    icon="cut-outline"
                                    compact
                                    secondary
                                    onPress={() => router.push('/services')}
                                  />
                                ) : null}
                                {state === 'done' && action.type === 'create_client' ? (
                                  <Button
                                    label="Clients"
                                    icon="people-outline"
                                    compact
                                    secondary
                                    onPress={() => router.push('/(tabs)/clients')}
                                  />
                                ) : null}
                              </View>
                            </Card>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}

              {sending ? (
                <View style={styles.loadingBubble}>
                  <ActivityIndicator size="small" color={colors.coral} />
                  <Text style={styles.mutedSmall}>Thinking…</Text>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>

        <View style={[styles.composerOuter, { paddingBottom: Math.max(insets.bottom + 14, 22) }]}>
          <View style={styles.composerBar}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask Bookora AI anything…"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={1000}
              style={styles.input}
              onSubmitEditing={() => {
                if (Platform.OS === 'web') void sendMessage();
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={!draft.trim() || sending}
              onPress={() => void sendMessage()}
              style={({ pressed }) => [
                styles.sendBtn,
                (!draft.trim() || sending) && styles.sendBtnDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  headerBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  pageSub: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  scrollContent: {
    padding: space.lg,
    gap: space.md,
    flexGrow: 1,
  },
  noticeCard: {
    backgroundColor: colors.peach,
    borderColor: '#F3D1BA',
    gap: 6,
  },
  noticeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  welcomeWrap: {
    gap: space.md,
  },
  welcomeCard: {
    gap: space.sm,
    backgroundColor: '#FAFAFB',
  },
  sparkleBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  welcomeBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  contextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  contextChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  contextChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  promptSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  promptsList: {
    gap: 8,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  promptChipText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  messagesWrap: {
    gap: space.md,
  },
  msgGroup: {
    gap: 8,
  },
  msgGroupUser: {
    alignItems: 'flex-end',
  },
  msgGroupBot: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: colors.coral,
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    backgroundColor: '#F5F6F8',
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  bubbleTextBot: {
    color: colors.ink,
  },
  actionsList: {
    width: '100%',
    gap: 8,
  },
  actionCard: {
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  actionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  draftPreview: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: radius.sm,
  },
  actionBtns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F5F6F8',
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  mutedSmall: {
    fontSize: 12,
    color: colors.muted,
  },
  modelBar: {
    paddingHorizontal: space.lg,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  modelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FAFAFB',
  },
  modelPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    maxWidth: 240,
  },
  modelDrawer: {
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: '#FAFAFB',
    gap: 8,
  },
  modelChipRow: {
    gap: 8,
  },
  modelChoiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    gap: 2,
  },
  modelChoiceChipActive: {
    borderColor: colors.coral,
    backgroundColor: colors.coralSoft,
  },
  modelChoiceLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  modelChoiceLabelActive: {
    color: colors.coral,
  },
  modelChoiceNote: {
    fontSize: 11,
    color: colors.muted,
  },
  modelCustomInput: {
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 12,
    color: colors.ink,
  },
  composerOuter: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#F8F9FB',
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 110,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.ink,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.72,
  },
});

