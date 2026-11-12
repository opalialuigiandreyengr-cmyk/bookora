import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import { MarkdownText } from '@/components/markdown-text';
import { RobotIcon } from '@/components/robot-icon';
import { Button, Card, StatusBadge } from '@/components/ui';
import {
  askBookoraAssistant,
  ASSISTANT_QUICK_PROMPTS,
  DEFAULT_FREE_MODEL,
  OPENROUTER_FREE_MODELS,
  type AssistantAction,
  type AssistantChatMessage,
  type AssistantToolCall,
} from '@/lib/assistant';
import { goBackOrReplace } from '@/lib/navigation';
import { authStorage } from '@/lib/storage';
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

function confirmDestructive(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const {
    session,
    appointments,
    services,
    clients,
    blockEvents,
    businessProfile,
    saveBusinessProfile,
    addAppointment,
    updateAppointmentStatus,
    deleteAppointment,
    addService,
    deleteService,
    addClient,
    deleteClient,
    addBlockTime,
    deleteBlockTime,
  } = useApp();

  const ownerKey = session?.user?.id || 'owner';
  const chatStorageKey = `bookora_ai_chat_v1_${ownerKey}`;
  const modelStorageKey = `bookora_ai_model_v1_${ownerKey}`;

  const [messages, setMessages] = useState<AssistantChatMessage[]>(() => {
    try {
      const raw = authStorage?.getItem(chatStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { messages?: AssistantChatMessage[] };
      return Array.isArray(parsed?.messages) ? parsed.messages : [];
    } catch {
      return [];
    }
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    try {
      const savedModel = authStorage?.getItem(modelStorageKey);
      if (savedModel && OPENROUTER_FREE_MODELS.some((m) => m.id === savedModel)) {
        return savedModel;
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_FREE_MODEL;
  });
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [liveTools, setLiveTools] = useState<AssistantToolCall[]>([]);
  const [liveThinking, setLiveThinking] = useState('');
  const [liveReply, setLiveReply] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [setupNotice, setSetupNotice] = useState('');
  const [executedKeys, setExecutedKeys] = useState<Record<string, 'running' | 'done'>>(() => {
    try {
      const raw = authStorage?.getItem(chatStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as { executedKeys?: Record<string, 'running' | 'done'> };
      return parsed?.executedKeys && typeof parsed.executedKeys === 'object' ? parsed.executedKeys : {};
    } catch {
      return {};
    }
  });

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const seqRef = useRef(1000);
  const abortRef = useRef<AbortController | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    try {
      if (messages.length === 0) {
        authStorage?.removeItem(chatStorageKey);
      } else {
        authStorage?.setItem(
          chatStorageKey,
          JSON.stringify({ messages: messages.slice(-60), executedKeys })
        );
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [messages, executedKeys, chatStorageKey]);

  useEffect(() => {
    try {
      authStorage?.setItem(modelStorageKey, selectedModel);
    } catch {
      // Ignore storage errors
    }
  }, [selectedModel, modelStorageKey]);

  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sSub = Keyboard.addListener(showEv, () => setKeyboardOpen(true));
    const hSub = Keyboard.addListener(hideEv, () => setKeyboardOpen(false));
    return () => {
      sSub.remove();
      hSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!sending) return;
    elapsedRef.current = 0;
    const interval = setInterval(() => {
      elapsedRef.current = Number((elapsedRef.current + 0.1).toFixed(1));
      setElapsedSeconds(elapsedRef.current);
    }, 100);
    return () => clearInterval(interval);
  }, [sending]);

  const nextId = (prefix: string) => {
    seqRef.current += 1;
    return `${prefix}_${Date.now()}_${seqRef.current}`;
  };

  const scrollToBottom = (animated = true) => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated });
    }, animated ? 80 : 20);
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLiveTools([]);
    setLiveThinking('');
    setLiveReply('');
    setSending(false);
  };

  const clearSavedChat = async () => {
    const ok = await confirmDestructive(
      'Delete saved chat?',
      'Remove this conversation history from local storage?'
    );
    if (!ok) return;
    handleStop();
    setMessages([]);
    setExecutedKeys({});
    setExpandedThinking({});
    setExpandedTools({});
    setSetupNotice('');
    try {
      authStorage?.removeItem(chatStorageKey);
    } catch {
      // Ignore storage errors
    }
  };

  const deleteSingleMessage = (msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
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

    const controller = new AbortController();
    abortRef.current = controller;
    elapsedRef.current = 0;
    setElapsedSeconds(0);
    setLiveTools([]);
    setLiveThinking('');
    setLiveReply('');
    setSending(true);
    setSetupNotice('');
    scrollToBottom();

    const apiHistory = nextThread.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const upsertLiveTool = (tool: AssistantToolCall) => {
      setLiveTools((prev) => {
        const idx = prev.findIndex((t) => t.id === tool.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = tool;
          return next;
        }
        return [...prev, tool];
      });
      scrollToBottom();
    };

    const result = await askBookoraAssistant(apiHistory, selectedModel, controller.signal, {
      onToolStart: upsertLiveTool,
      onToolDone: upsertLiveTool,
      onThinkingDelta: (chunk) => {
        setLiveThinking((prev) => prev + chunk);
        scrollToBottom(false);
      },
      onContentDelta: (chunk) => {
        setLiveReply((prev) => prev + chunk);
        scrollToBottom(false);
      },
    });
    const finalElapsed = Math.max(0.1, elapsedRef.current);
    abortRef.current = null;
    setSending(false);
    setLiveTools([]);
    setLiveThinking('');
    setLiveReply('');

    if (result.aborted) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId('s'),
          role: 'assistant',
          content: `_Stopped after ${finalElapsed}s._`,
          thinkingSeconds: finalElapsed,
        },
      ]);
      scrollToBottom();
      return;
    }

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
            thinkingSeconds: finalElapsed,
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
        thinking: result.thinking,
        thinkingSeconds: result.thinkingSeconds ?? finalElapsed,
        toolCalls: result.toolCalls,
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
        const normTime = normalizeTime24h(action.data.appointment_time);
        const normName = (action.data.customer_name || '').trim().toLowerCase();
        const duplicateBooking = appointments.find(
          (a) =>
            !['cancelled', 'no_show'].includes(a.status) &&
            a.appointment_date === action.data.appointment_date &&
            normalizeTime24h(a.appointment_time) === normTime &&
            a.customer_name.trim().toLowerCase() === normName
        );
        if (duplicateBooking) {
          throw new Error(
            `Duplicate booking: ${action.data.customer_name} already has a booking on ${action.data.appointment_date} at ${normTime}. Did not proceed.`
          );
        }

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
          appointment_time: normTime,
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

        const existingNames = new Set(services.map((s) => s.name.trim().toLowerCase()));
        const seenInBatch = new Set<string>();
        const duplicates: string[] = [];
        for (const item of items) {
          const keyName = (item.name || '').trim().toLowerCase();
          if (!keyName) continue;
          if (existingNames.has(keyName) || seenInBatch.has(keyName)) {
            duplicates.push(item.name.trim());
          }
          seenInBatch.add(keyName);
        }
        if (duplicates.length > 0) {
          throw new Error(
            `Duplicate service found (${duplicates.join(', ')}) — already exists in Services. Did not proceed.`
          );
        }

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
        const normName = (action.data.full_name || '').trim().toLowerCase();
        const normPhone = (action.data.phone || '').replace(/\s+/g, '');
        const normEmail = (action.data.email || '').trim().toLowerCase();
        const duplicateClient = clients.find(
          (c) =>
            (normName && c.full_name.trim().toLowerCase() === normName) ||
            (normPhone && c.phone && c.phone.replace(/\s+/g, '') === normPhone) ||
            (normEmail && c.email && c.email.trim().toLowerCase() === normEmail)
        );
        if (duplicateClient) {
          throw new Error(
            `Duplicate client found (${duplicateClient.full_name}) already exists in Clients. Did not proceed.`
          );
        }

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
        const duplicateBlock = blockEvents.find(
          (b) => b.event_date === action.data.event_date && normalizeTime24h(b.start_time) === start
        );
        if (duplicateBlock) {
          throw new Error(
            `Duplicate block time: "${duplicateBlock.title}" already exists on ${action.data.event_date} at ${start}. Did not proceed.`
          );
        }

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
        return;
      }

      if (action.type === 'delete_service') {
        const target =
          services.find((s) => action.data.service_id && s.id === action.data.service_id) ||
          services.find((s) => s.name.trim().toLowerCase() === (action.data.name || '').trim().toLowerCase());
        if (!target) {
          throw new Error(`Service "${action.data.name}" not found in Services. Did not delete.`);
        }
        const ok = await confirmDestructive(
          'Delete service?',
          `Permanently delete "${target.name}" from Services? This cannot be undone.`
        );
        if (!ok) {
          setExecutedKeys((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          return;
        }
        const err = await deleteService(target.id);
        if (err) throw new Error(err);
        setExecutedKeys((prev) => ({ ...prev, [key]: 'done' }));
        Alert.alert('Service deleted', `"${target.name}" removed from Services.`);
        return;
      }

      if (action.type === 'delete_appointment') {
        const target =
          appointments.find((a) => action.data.appointment_id && a.id === action.data.appointment_id) ||
          appointments.find(
            (a) =>
              (!action.data.customer_name ||
                a.customer_name.trim().toLowerCase() === action.data.customer_name.trim().toLowerCase()) &&
              (!action.data.appointment_date || a.appointment_date === action.data.appointment_date)
          );
        if (!target) {
          throw new Error('Matching booking not found. Did not delete.');
        }
        const ok = await confirmDestructive(
          'Delete booking?',
          `Permanently delete ${target.customer_name}'s booking (${target.service_names}) on ${target.appointment_date} at ${target.appointment_time}?`
        );
        if (!ok) {
          setExecutedKeys((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          return;
        }
        const err = await deleteAppointment(target.id);
        if (err) throw new Error(err);
        setExecutedKeys((prev) => ({ ...prev, [key]: 'done' }));
        Alert.alert('Booking deleted', `${target.customer_name}'s booking was deleted.`);
        return;
      }

      if (action.type === 'delete_client') {
        const target =
          clients.find((c) => action.data.client_id && c.id === action.data.client_id) ||
          clients.find(
            (c) => c.full_name.trim().toLowerCase() === (action.data.full_name || '').trim().toLowerCase()
          );
        if (!target) {
          throw new Error(`Client "${action.data.full_name || ''}" not found. Did not delete.`);
        }
        const ok = await confirmDestructive(
          'Delete client?',
          `Permanently delete client "${target.full_name}" from Clients? This cannot be undone.`
        );
        if (!ok) {
          setExecutedKeys((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          return;
        }
        const err = await deleteClient(target.id);
        if (err) throw new Error(err);
        setExecutedKeys((prev) => ({ ...prev, [key]: 'done' }));
        Alert.alert('Client deleted', `"${target.full_name}" removed from Clients.`);
        return;
      }

      if (action.type === 'delete_block_time') {
        const start = action.data.start_time ? normalizeTime24h(action.data.start_time) : '';
        const target =
          blockEvents.find((b) => action.data.block_id && b.id === action.data.block_id) ||
          blockEvents.find(
            (b) =>
              (!action.data.event_date || b.event_date === action.data.event_date) &&
              (!start || normalizeTime24h(b.start_time) === start) &&
              (!action.data.title ||
                b.title.trim().toLowerCase() === action.data.title.trim().toLowerCase())
          );
        if (!target) {
          throw new Error('Blocked time entry not found. Did not delete.');
        }
        const ok = await confirmDestructive(
          'Delete blocked time?',
          `Permanently remove "${target.title}" (${target.event_date} at ${target.start_time})?`
        );
        if (!ok) {
          setExecutedKeys((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          return;
        }
        const err = await deleteBlockTime(target.id);
        if (err) throw new Error(err);
        setExecutedKeys((prev) => ({ ...prev, [key]: 'done' }));
        Alert.alert('Blocked time removed', `"${target.title}" was deleted.`);
        return;
      }

      if (action.type === 'add_time_off') {
        const startDate = action.data.startDate;
        const endDate = action.data.endDate || startDate;
        const startTime = normalizeTime24h(action.data.startTime || '09:00');
        const endTime = normalizeTime24h(action.data.endTime || '18:00');
        const title = (action.data.title || 'Time off').trim();
        const existingRules = Array.isArray(businessProfile.time_off) ? businessProfile.time_off : [];
        const duplicateRule = existingRules.find(
          (r) =>
            r.startDate === startDate &&
            normalizeTime24h(r.startTime) === startTime &&
            r.title.trim().toLowerCase() === title.toLowerCase()
        );
        if (duplicateRule) {
          throw new Error(
            `Duplicate time off: "${duplicateRule.title}" on ${startDate} already exists. Did not proceed.`
          );
        }
        const nextRules = [
          ...existingRules,
          {
            id: nextId('to'),
            title,
            startDate,
            endDate,
            startTime,
            endTime,
            allDay: Boolean(action.data.allDay),
            repeat: action.data.repeat || 'none',
          },
        ];
        const err = await saveBusinessProfile({ time_off: nextRules });
        if (err) throw new Error(err);
        setExecutedKeys((prev) => ({ ...prev, [key]: 'done' }));
        Alert.alert('Time off added', `${title} on ${startDate} saved.`);
        return;
      }

      if (action.type === 'delete_time_off') {
        const existingRules = Array.isArray(businessProfile.time_off) ? businessProfile.time_off : [];
        const target =
          existingRules.find((r) => action.data.time_off_id && r.id === action.data.time_off_id) ||
          existingRules.find(
            (r) =>
              (!action.data.startDate || r.startDate === action.data.startDate) &&
              (!action.data.title ||
                r.title.trim().toLowerCase() === action.data.title.trim().toLowerCase())
          );
        if (!target) {
          throw new Error('Time off entry not found. Did not delete.');
        }
        const ok = await confirmDestructive(
          'Delete time off?',
          `Permanently remove "${target.title}" (${target.startDate}) from Business Hours & Time Off?`
        );
        if (!ok) {
          setExecutedKeys((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          return;
        }
        const err = await saveBusinessProfile({
          time_off: existingRules.filter((r) => r.id !== target.id),
        });
        if (err) throw new Error(err);
        setExecutedKeys((prev) => ({ ...prev, [key]: 'done' }));
        Alert.alert('Time off deleted', `"${target.title}" was removed.`);
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

  const activeModelObj = OPENROUTER_FREE_MODELS.find((m) => m.id === selectedModel) || OPENROUTER_FREE_MODELS[0];

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

        {/* Compact floating dropdown trigger inside header (takes zero extra vertical space) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose AI model"
          onPress={() => setShowModelMenu(true)}
          style={({ pressed }) => [styles.headerTitleBtn, pressed && styles.pressed]}
        >
          <Text style={styles.pageTitle}>Ask AI</Text>
          <View style={styles.modelInlineRow}>
            <Text style={styles.pageSub}>{activeModelObj.label}</Text>
            <Ionicons name="chevron-down" size={12} color={colors.muted} />
          </View>
        </Pressable>

        {messages.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete saved chat"
            hitSlop={8}
            onPress={() => void clearSavedChat()}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={18} color={colors.muted} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      {/* Floating Dropdown Overlay Menu (takes zero layout space) */}
      <Modal
        visible={showModelMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModelMenu(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setShowModelMenu(false)}>
          <View style={[styles.menuPopover, { marginTop: insets.top + 54 }]}>
            <Text style={styles.menuHeading}>Free OpenRouter Models</Text>
            {OPENROUTER_FREE_MODELS.map((m) => {
              const active = m.id === selectedModel;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    setSelectedModel(m.id);
                    setShowModelMenu(false);
                  }}
                  style={({ pressed }) => [
                    styles.menuItem,
                    active && styles.menuItemActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuItemLabel, active && styles.menuItemLabelActive]}>{m.label}</Text>
                    <Text style={styles.menuItemNote}>{m.note}</Text>
                  </View>
                  {active ? <Ionicons name="checkmark" size={18} color={colors.coral} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
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
              <View style={styles.welcomeHero}>
                <View style={styles.welcomeInlineRow}>
                  <View style={styles.sparkleBadge}>
                    <RobotIcon size={17} color={colors.coral} />
                  </View>
                  <Text style={styles.welcomeTitle}>Ask AI</Text>
                </View>
                <Text style={styles.welcomeMetaLine}>
                  {services.length} services · {appointments.length} bookings · {clients.length} clients
                </Text>
              </View>

              <View style={styles.promptsList}>
                {ASSISTANT_QUICK_PROMPTS.map((prompt) => (
                  <Pressable
                    key={prompt}
                    onPress={() => void sendMessage(prompt)}
                    style={({ pressed }) => [styles.promptChip, pressed && styles.pressed]}
                  >
                    <RobotIcon size={14} color={colors.coral} />
                    <Text style={styles.promptChipText}>{prompt}</Text>
                    <Ionicons name="arrow-forward" size={13} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.messagesWrap}>
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const showThought = Boolean(expandedThinking[msg.id]);
                const toolCalls = !isUser && Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
                const hasToolsBlock = toolCalls.length > 0;
                const hasThinkingBlock = !isUser && (Boolean(msg.thinking) || msg.thinkingSeconds != null);

                return (
                  <View key={msg.id} style={[styles.msgGroup, isUser ? styles.msgGroupUser : styles.msgGroupBot]}>
                    {hasToolsBlock ? (
                      <View style={styles.toolsListWrap}>
                        {toolCalls.map((t) => {
                          const toolKey = `${msg.id}_${t.id}`;
                          const isOpen = Boolean(expandedTools[toolKey]);
                          return (
                            <View key={t.id} style={styles.singleToolItem}>
                              <Pressable
                                onPress={() =>
                                  setExpandedTools((prev) => ({ ...prev, [toolKey]: !prev[toolKey] }))
                                }
                                style={({ pressed }) => [styles.toolPill, pressed && styles.pressed]}
                              >
                                <Ionicons
                                  name={
                                    t.status === 'error'
                                      ? 'alert-circle'
                                      : 'checkmark-circle'
                                  }
                                  size={13}
                                  color={t.status === 'error' ? colors.danger : colors.success}
                                />
                                <Text style={styles.toolPillText}>
                                  {t.page} · {t.count} · {t.duration_ms}ms
                                </Text>
                                <Ionicons
                                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                                  size={12}
                                  color={colors.muted}
                                />
                              </Pressable>
                              {isOpen ? (
                                <View style={styles.toolDetailBox}>
                                  <Text style={styles.toolFuncName}>{t.tool}()</Text>
                                  {t.summary ? <Text style={styles.toolSummary}>{t.summary}</Text> : null}
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}

                    {hasThinkingBlock ? (
                      <View style={styles.thinkingWrap}>
                        <Pressable
                          disabled={!msg.thinking}
                          onPress={() =>
                            setExpandedThinking((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                          }
                          style={({ pressed }) => [styles.thinkingPill, pressed && styles.pressed]}
                        >
                          <Ionicons name="bulb-outline" size={13} color={colors.muted} />
                          <Text style={styles.thinkingPillText}>
                            Thought for {msg.thinkingSeconds ?? 0.5}s
                            {msg.model ? ` · ${msg.model.split('/').pop()?.replace(':free', '')}` : ''}
                          </Text>
                          {msg.thinking ? (
                            <Ionicons
                              name={showThought ? 'chevron-up' : 'chevron-down'}
                              size={13}
                              color={colors.muted}
                            />
                          ) : null}
                        </Pressable>

                        {showThought && msg.thinking ? (
                          <View style={styles.thinkingBox}>
                            <MarkdownText content={msg.thinking} style={styles.thinkingText} />
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowBot]}>
                      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
                        {isUser ? (
                          <Text style={[styles.bubbleText, styles.bubbleTextUser]}>{msg.content}</Text>
                        ) : (
                          <MarkdownText
                            content={msg.content}
                            style={[styles.bubbleText, styles.bubbleTextBot]}
                          />
                        )}
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Delete message"
                        hitSlop={6}
                        onPress={() => deleteSingleMessage(msg.id)}
                        style={({ pressed }) => [styles.msgDeleteBtn, pressed && styles.pressed]}
                      >
                        <Ionicons name="trash-outline" size={12} color={colors.muted} />
                      </Pressable>
                    </View>

                    {!isUser && msg.actions && msg.actions.length > 0 ? (
                      <View style={styles.actionsList}>
                        {msg.actions.map((action, idx) => {
                          const key = `${msg.id}_${idx}`;
                          const state = executedKeys[key];
                          const isDraft = action.type === 'draft_message';
                          const isDelete = action.type.startsWith('delete_');
                          return (
                            <Card key={key} style={[styles.actionCard, isDelete && styles.actionCardDelete]}>
                              <View style={styles.actionTop}>
                                <Text style={styles.actionLabel}>{action.label || 'Suggested action'}</Text>
                                {state === 'done' ? <StatusBadge status="active" /> : null}
                              </View>
                              {isDraft && action.data.message ? (
                                <MarkdownText content={action.data.message} style={styles.draftPreview} />
                              ) : null}
                              <View style={styles.actionBtns}>
                                <Button
                                  label={
                                    state === 'done'
                                      ? isDraft
                                        ? 'Copied'
                                        : isDelete
                                          ? 'Deleted'
                                          : 'Completed'
                                      : state === 'running'
                                        ? 'Working…'
                                        : isDraft
                                          ? 'Copy message'
                                          : isDelete
                                            ? 'Confirm delete'
                                            : 'Confirm & run'
                                  }
                                  icon={
                                    state === 'done'
                                      ? 'checkmark-circle-outline'
                                      : isDraft
                                        ? 'copy-outline'
                                        : isDelete
                                          ? 'trash-outline'
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
                <View style={styles.liveWrap}>
                  {liveTools.map((t) => (
                    <View key={t.id} style={styles.liveScanPill}>
                      {t.status === 'running' ? (
                        <ActivityIndicator size="small" color={colors.coral} />
                      ) : (
                        <Ionicons
                          name={t.status === 'error' ? 'alert-circle' : 'checkmark-circle'}
                          size={13}
                          color={t.status === 'error' ? colors.danger : colors.success}
                        />
                      )}
                      <Text style={styles.liveScanText}>
                        {t.status === 'running'
                          ? `Querying ${t.page}…`
                          : `${t.page} · ${t.count} · ${t.duration_ms}ms`}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.liveThinkingRow}>
                  <View style={styles.loadingBubble}>
                    <ActivityIndicator size="small" color={colors.coral} />
                    <Text style={styles.mutedSmall}>Thinking… {elapsedSeconds.toFixed(1)}s</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleStop}
                    style={({ pressed }) => [styles.stopChip, pressed && styles.pressed]}
                  >
                    <Ionicons name="stop" size={12} color={colors.danger} />
                    <Text style={styles.stopChipText}>Stop</Text>
                  </Pressable>
                  </View>
                  {liveThinking ? (
                    <View style={styles.liveThinkingPreviewBox}>
                      <Text style={styles.thinkingText}>{liveThinking}</Text>
                    </View>
                  ) : null}
                  {liveReply ? (
                    <View style={[styles.bubble, styles.bubbleBot]}>
                      <MarkdownText content={liveReply} style={[styles.bubbleText, styles.bubbleTextBot]} />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>

        <View
          style={[
            styles.composerOuter,
            { paddingBottom: keyboardOpen ? 6 : Math.max(insets.bottom, 10) },
          ]}
        >
          <View style={styles.composerBar}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask AI anything…"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={1000}
              style={styles.input}
              onSubmitEditing={() => {
                if (Platform.OS === 'web' && !sending) void sendMessage();
              }}
            />
            {sending ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop generating"
                onPress={handleStop}
                style={({ pressed }) => [styles.stopBtn, pressed && styles.pressed]}
              >
                <Ionicons name="stop" size={16} color="#FFFFFF" />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                disabled={!draft.trim()}
                onPress={() => void sendMessage()}
                style={({ pressed }) => [
                  styles.sendBtn,
                  !draft.trim() && styles.sendBtnDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
              </Pressable>
            )}
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
  headerTitleBtn: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: radius.md,
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  modelInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageSub: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
    alignItems: 'center',
  },
  menuPopover: {
    width: 290,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.sm,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  menuHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: radius.md,
  },
  menuItemActive: {
    backgroundColor: colors.coralSoft,
  },
  menuItemLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  menuItemLabelActive: {
    color: colors.coral,
  },
  menuItemNote: {
    fontSize: 11,
    color: colors.muted,
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xl,
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
    paddingTop: space.sm,
  },
  welcomeHero: {
    gap: 6,
    paddingHorizontal: 2,
  },
  welcomeInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sparkleBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  welcomeMetaLine: {
    fontSize: 12.5,
    fontWeight: '500',
    color: colors.muted,
    paddingLeft: 40,
  },
  promptsList: {
    gap: 7,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    gap: 6,
  },
  msgGroupUser: {
    alignItems: 'flex-end',
  },
  msgGroupBot: {
    alignItems: 'flex-start',
  },
  toolsListWrap: {
    maxWidth: '94%',
    gap: 5,
    alignItems: 'flex-start',
  },
  singleToolItem: {
    gap: 4,
    alignSelf: 'flex-start',
  },
  toolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: '#FFF5F3',
    borderWidth: 1,
    borderColor: '#FAD7D0',
  },
  toolPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  toolDetailBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 2,
  },
  toolFuncName: {
    fontSize: 10.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.coral,
  },
  toolSummary: {
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.muted,
  },
  liveWrap: {
    gap: 6,
  },
  liveScanPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: '#FFF5F3',
    borderWidth: 1,
    borderColor: '#FAD7D0',
  },
  liveScanText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.ink,
  },
  thinkingWrap: {
    maxWidth: '92%',
    gap: 6,
  },
  thinkingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: '#F3F4F6',
  },
  thinkingPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  thinkingBox: {
    backgroundColor: '#FAFAFB',
    borderLeftWidth: 2,
    borderLeftColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  thinkingText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    maxWidth: '94%',
  },
  bubbleRowUser: {
    flexDirection: 'row-reverse',
  },
  bubbleRowBot: {
    flexDirection: 'row',
  },
  msgDeleteBtn: {
    padding: 4,
    opacity: 0.55,
  },
  bubble: {
    flexShrink: 1,
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
  actionCardDelete: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFFBFB',
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
  liveThinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveThinkingPreviewBox: {
    backgroundColor: '#FAFAFB',
    borderLeftWidth: 2,
    borderLeftColor: colors.coral,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    maxWidth: '92%',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F5F6F8',
    borderRadius: radius.pill,
  },
  stopChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.coralSoft,
  },
  stopChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  mutedSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  composerOuter: {
    paddingHorizontal: space.md,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#F8F9FB',
  },
  input: {
    flex: 1,
    minHeight: 34,
    maxHeight: 104,
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontSize: 14,
    color: colors.ink,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.ink,
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
