import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { Button, Card, EmptyState, Field, IconButton, Screen, SearchField, StatusBadge } from '@/components/ui';
import { openExternalLink } from '@/lib/external-links';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';
import type { Appointment, Client } from '@/types';

const QUICK_TAGS = ['regular', 'VIP', 'returning', 'bridal', 'new'];

const parsePrice = (raw?: string, finalAmount?: number | null) => {
  if (finalAmount != null) return Number(finalAmount) || 0;
  return Number(String(raw || '0').replace(/[^0-9.-]+/g, '')) || 0;
};

const money = (value: number) =>
  value.toLocaleString('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

const displayDate = (value: string) => {
  if (!value || value === '—') return '—';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function Clients() {
  const {
    clients,
    appointments,
    addClient,
    updateClient,
    deleteClient,
    mergeClients,
    refreshing,
    refresh,
  } = useApp();

  const [query, setQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [clientSheetProgress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!selectedClient) {
      clientSheetProgress.setValue(0);
      return;
    }
    const animation = Animated.timing(clientSheetProgress, {
      toValue: 1,
      duration: reduceMotionEnabled ? 120 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [clientSheetProgress, reduceMotionEnabled, selectedClient]);

  // Editor state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [notes, setNotes] = useState('');
  const [blocked, setBlocked] = useState(false);

  const historyFor = (client: Client): Appointment[] => {
    const cEmail = (client.email || '').trim().toLowerCase();
    const cName = client.full_name.trim().toLowerCase();
    return appointments.filter(
      (item) =>
        (cEmail && (item.customer_email || '').trim().toLowerCase() === cEmail) ||
        item.customer_name.trim().toLowerCase() === cName
    );
  };

  // Detect duplicate pairs like ClientMergePanel on web
  const duplicatePairs = useMemo(() => {
    const seen = new Set<string>();
    const pairs: [Client, Client][] = [];
    for (const client of clients) {
      const emailKey = (client.email || '').trim().toLowerCase();
      const namePhoneKey = `${client.full_name.trim().toLowerCase()}|${(client.phone || '').trim()}`;
      const key = emailKey || namePhoneKey;
      if (!key || key === '|' || seen.has(key)) continue;
      const dup = clients.find((other) => {
        if (other.id === client.id) return false;
        const otherEmail = (other.email || '').trim().toLowerCase();
        const otherNamePhone = `${other.full_name.trim().toLowerCase()}|${(other.phone || '').trim()}`;
        return (emailKey && otherEmail === emailKey) || (!emailKey && otherNamePhone === namePhoneKey);
      });
      if (dup) {
        pairs.push([client, dup]);
        seen.add(key);
      }
    }
    return pairs;
  }, [clients]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (!q) return true;
      return [client.full_name, client.email || '', client.phone || '', ...(client.tags || [])].some((val) =>
        val.toLowerCase().includes(q)
      );
    });
  }, [clients, query]);

  const openNewClient = () => {
    clientSheetProgress.stopAnimation();
    clientSheetProgress.setValue(0);
    setSelectedClient({
      id: '',
      business_id: '',
      full_name: '',
      email: '',
      phone: '',
      notes: '',
      tags: [],
      blocked: false,
    });
    setName('');
    setEmail('');
    setPhone('');
    setTagsText('');
    setNotes('');
    setBlocked(false);
    setEditing(true);
  };

  const openClientDetail = (client: Client) => {
    clientSheetProgress.stopAnimation();
    clientSheetProgress.setValue(0);
    setSelectedClient(client);
    setName(client.full_name);
    setEmail(client.email || '');
    setPhone(client.phone || '');
    setTagsText((client.tags || []).join(', '));
    setNotes(client.notes || '');
    setBlocked(Boolean(client.blocked));
    setEditing(false);
  };

  const startEditingSelected = () => {
    if (!selectedClient) return;
    setName(selectedClient.full_name);
    setEmail(selectedClient.email || '');
    setPhone(selectedClient.phone || '');
    setTagsText((selectedClient.tags || []).join(', '));
    setNotes(selectedClient.notes || '');
    setBlocked(Boolean(selectedClient.blocked));
    setEditing(true);
  };

  const toggleQuickTag = (tag: string) => {
    const current = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    setTagsText(next.join(', '));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Add the client’s name first.');
      return;
    }
    const parsedTags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    setSaving(true);
    if (selectedClient?.id) {
      const err = await updateClient(selectedClient.id, {
        full_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        notes: notes.trim(),
        tags: parsedTags,
        blocked,
      });
      setSaving(false);
      if (err) {
        Alert.alert('Could not update client', err);
        return;
      }
      setSelectedClient({
        ...selectedClient,
        full_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        notes: notes.trim(),
        tags: parsedTags,
        blocked,
      });
      setEditing(false);
    } else {
      const err = await addClient({
        full_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        notes: notes.trim(),
        tags: parsedTags,
        blocked,
      });
      setSaving(false);
      if (err) {
        Alert.alert('Could not save client', err);
        return;
      }
      setSelectedClient(null);
      setEditing(false);
    }
  };

  const handleDelete = (client: Client) => {
    Alert.alert('Delete client?', `Remove ${client.full_name} from your client book?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const err = await deleteClient(client.id);
          if (err) Alert.alert('Could not delete client', err);
          else setSelectedClient(null);
        },
      },
    ]);
  };

  const handleMerge = (survivor: Client, duplicate: Client) => {
    Alert.alert(
      'Merge duplicate client?',
      `Merge ${duplicate.full_name} into ${survivor.full_name}? Notes and tags will be combined.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          onPress: async () => {
            setMergingId(duplicate.id);
            const err = await mergeClients(survivor, duplicate);
            setMergingId(null);
            if (err) Alert.alert('Could not merge clients', err);
          },
        },
      ]
    );
  };

  const exportClientsCsv = async () => {
    const csvCell = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Name', 'Email', 'Phone', 'Tags', 'Notes', 'Booking access', 'Appointments', 'Lifetime spend'],
      ...visible.map((client) => {
        const hist = historyFor(client);
        const spend = hist.reduce((s, item) => s + parsePrice(item.total_price, item.final_total_amount), 0);
        return [
          client.full_name,
          client.email || '',
          client.phone || '',
          (client.tags || []).join(', '),
          client.notes || '',
          client.blocked ? 'blocked' : 'active',
          hist.length,
          spend.toFixed(2),
        ];
      }),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
    try {
      await Share.share({
        title: 'bookora-clients.csv',
        message: csv,
      });
    } catch {
      // Share dismissed
    }
  };

  const selectedHistory = selectedClient?.id ? historyFor(selectedClient) : [];
  const selectedSpend = selectedHistory.reduce(
    (sum, item) => sum + parsePrice(item.total_price, item.final_total_amount),
    0
  );
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastVisit =
    selectedHistory
      .map((item) => item.appointment_date)
      .filter((d) => d && d <= todayStr)
      .sort()
      .at(-1) || '—';
  const nextVisit =
    selectedHistory
      .map((item) => item.appointment_date)
      .filter((d) => d && d >= todayStr)
      .sort()[0] || '—';

  return (
    <>
      <Screen
        refreshing={refreshing}
        onRefresh={refresh}
        backgroundColor="#FFFFFF"
        floatingAction={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add client"
            onPress={openNewClient}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          >
            <Ionicons name="add" size={25} color="#FFFFFF" />
          </Pressable>
        }
      >
        <View style={styles.headerLine}>
          <Text style={styles.title}>Clients</Text>
        </View>

        {/* Duplicate Merge Banner */}
        {duplicatePairs.length > 0 ? (
          <Card style={styles.mergeCard}>
            <View style={styles.mergeHeader}>
              <Ionicons name="git-merge-outline" size={18} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.mergeTitle}>Possible duplicate clients</Text>
                <Text style={styles.mergeSub}>Review and merge matching records</Text>
              </View>
            </View>
            {duplicatePairs.map(([survivor, duplicate]) => (
              <View key={`${survivor.id}-${duplicate.id}`} style={styles.mergeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mergeName}>{survivor.full_name}</Text>
                  <Text style={styles.mergeMeta}>
                    {survivor.email || survivor.phone || 'No contact'} + {duplicate.full_name}
                  </Text>
                </View>
                <Pressable
                  disabled={mergingId === duplicate.id}
                  onPress={() => handleMerge(survivor, duplicate)}
                  style={styles.mergeBtn}
                >
                  <Text style={styles.mergeBtnText}>{mergingId === duplicate.id ? 'Merging…' : 'Merge'}</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}

        <SearchField value={query} onChangeText={setQuery} placeholder="Search name, email, phone, or tag" />

        <View style={styles.list}>
          {visible.map((client) => {
            const initials = client.full_name
              .split(/\s+/)
              .map((part) => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();
            const clientHistory = historyFor(client);
            return (
              <Pressable
                key={client.id}
                onPress={() => openClientDetail(client)}
                style={({ pressed }) => [styles.clientCard, pressed && styles.pressed]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials || '?'}</Text>
                </View>
                <View style={styles.copy}>
                  <View style={styles.nameRow}>
                    <Text numberOfLines={1} style={styles.name}>
                      {client.full_name}
                    </Text>
                    {client.blocked ? <StatusBadge status="blocked" /> : null}
                  </View>
                  <Text numberOfLines={1} style={styles.contact}>
                    {client.phone || client.email || 'No contact details'}
                  </Text>
                  <View style={styles.tagRow}>
                    <Text style={styles.visitCount}>
                      {clientHistory.length} visit{clientHistory.length === 1 ? '' : 's'}
                    </Text>
                    {(client.tags || []).slice(0, 3).map((tag) => (
                      <View key={tag} style={styles.tagBadge}>
                        <Text style={styles.tagBadgeText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                  {client.notes ? (
                    <Text numberOfLines={1} style={styles.notes}>
                      {client.notes}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            );
          })}
        </View>

        {!visible.length ? (
          <EmptyState
            icon="people-outline"
            title={query ? 'No matching clients' : 'No clients yet'}
            message={
              query
                ? 'Try a different search term.'
                : 'Add your first client to start building a relationship history.'
            }
            actionLabel="Add client"
            onAction={openNewClient}
          />
        ) : null}
      </Screen>

      {/* Client Profile & Editor Drawer Modal */}
      <Modal
        visible={Boolean(selectedClient)}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => {
          setSelectedClient(null);
          setEditing(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close client profile"
            style={styles.modalDismissArea}
            onPress={() => {
              setSelectedClient(null);
              setEditing(false);
            }}
          />
        <Animated.View
          style={[
            styles.clientSheet,
            {
              transform: [
                {
                  translateY: clientSheetProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [reduceMotionEnabled ? 0 : 380, 0],
                  }),
                },
              ],
            },
          ]}
        >
        <SafeAreaView edges={['bottom']} style={styles.clientSheetSafe}>
          <View style={styles.sheetHandle} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            {/* Top Bar */}
            <View style={styles.drawerNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to clients"
                onPress={() => {
                  if (editing && selectedClient?.id) {
                    setEditing(false);
                  } else {
                    setSelectedClient(null);
                    setEditing(false);
                  }
                }}
                hitSlop={8}
                style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconPressed]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>
              <Text style={styles.drawerHeaderTitle}>
                {!selectedClient?.id ? 'Add client' : editing ? 'Edit client' : 'Client profile'}
              </Text>
              <View style={styles.drawerRightActions}>
                {selectedClient?.id && !editing ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Edit client"
                      onPress={startEditingSelected}
                      hitSlop={8}
                      style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconPressed]}
                    >
                      <Ionicons name="pencil" size={18} color={colors.ink} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Delete client"
                      onPress={() => handleDelete(selectedClient)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconPressed]}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </>
                ) : (
                  <View style={{ width: 42 }} />
                )}
              </View>
            </View>

            <KeyboardAwareScrollView
              contentContainerStyle={styles.drawerContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Hero Avatar */}
              <View style={styles.profileHero}>
                <View style={styles.heroAvatar}>
                  <Text style={styles.heroAvatarText}>
                    {(editing ? name : selectedClient?.full_name || '?')
                      .split(/\s+/)
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                    .toUpperCase() || '?'}
                  </Text>
                </View>
                <View style={styles.heroCopy}>
                  <Text numberOfLines={1} style={styles.heroName}>
                    {editing ? name || 'New client' : selectedClient?.full_name}
                  </Text>
                  <Text numberOfLines={1} style={styles.heroContact}>
                    {editing
                      ? email || phone || 'Add client details'
                      : selectedClient?.phone || selectedClient?.email || 'No contact details'}
                  </Text>
                  {selectedClient?.blocked ? <StatusBadge status="blocked" /> : null}
                </View>
              </View>

              {/* View Mode */}
              {selectedClient?.id && !editing ? (
                <>
                  {/* Quick Contact Actions */}
                  <View style={styles.contactActionsRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Email client"
                      accessibilityState={{ disabled: !selectedClient.email }}
                      disabled={!selectedClient.email}
                      onPress={() => {
                        if (!selectedClient.email) return;
                        void openExternalLink(`mailto:${selectedClient.email}`).then((opened) => {
                          if (!opened) Alert.alert('Email unavailable', 'No email app is available on this device.');
                        });
                      }}
                      style={({ pressed }) => [
                        styles.contactActionBtn,
                        !selectedClient.email && styles.contactActionDisabled,
                        pressed && styles.contactActionPressed,
                      ]}
                    >
                      <View style={[styles.contactActionIcon, styles.contactActionIconEmail]}>
                        <Ionicons name="mail-outline" size={18} color={colors.navy} />
                      </View>
                      <Text style={styles.contactActionLabel}>Email</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Call client"
                      accessibilityState={{ disabled: !selectedClient.phone }}
                      disabled={!selectedClient.phone}
                      onPress={() => {
                        if (!selectedClient.phone) return;
                        void openExternalLink(`tel:${selectedClient.phone}`).then((opened) => {
                          if (!opened) Alert.alert('Calling unavailable', 'This device cannot start a phone call.');
                        });
                      }}
                      style={({ pressed }) => [
                        styles.contactActionBtn,
                        !selectedClient.phone && styles.contactActionDisabled,
                        pressed && styles.contactActionPressed,
                      ]}
                    >
                      <View style={[styles.contactActionIcon, styles.contactActionIconCall]}>
                        <Ionicons name="call-outline" size={18} color={colors.success} />
                      </View>
                      <Text style={styles.contactActionLabel}>Call</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Message client"
                      accessibilityState={{ disabled: !selectedClient.phone }}
                      disabled={!selectedClient.phone}
                      onPress={() => {
                        if (!selectedClient.phone) return;
                        void openExternalLink(`sms:${selectedClient.phone}`).then((opened) => {
                          if (!opened) Alert.alert('Messaging unavailable', 'No messaging app is available on this device.');
                        });
                      }}
                      style={({ pressed }) => [
                        styles.contactActionBtn,
                        !selectedClient.phone && styles.contactActionDisabled,
                        pressed && styles.contactActionPressed,
                      ]}
                    >
                      <View style={[styles.contactActionIcon, styles.contactActionIconMessage]}>
                        <Ionicons name="chatbubble-outline" size={18} color={colors.warning} />
                      </View>
                      <Text style={styles.contactActionLabel}>Message</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Book appointment for client"
                      onPress={() => {
                        setSelectedClient(null);
                        router.push('/(tabs)/calendar');
                      }}
                      style={({ pressed }) => [
                        styles.contactActionBtn,
                        pressed && styles.contactActionPressed,
                      ]}
                    >
                      <View style={[styles.contactActionIcon, styles.contactActionIconAccent]}>
                        <Ionicons name="calendar-outline" size={18} color={colors.coral} />
                      </View>
                      <Text style={[styles.contactActionLabel, { color: colors.coral }]}>Book</Text>
                    </Pressable>
                  </View>

                  <View style={styles.profileSection}>
                    <Text style={styles.profileSectionTitle}>Contact details</Text>
                    <View style={styles.detailCard}>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Email</Text>
                        <Text numberOfLines={2} style={styles.detailValue}>
                          {selectedClient.email || 'Not added'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Phone</Text>
                        <Text numberOfLines={2} style={styles.detailValue}>
                          {selectedClient.phone || 'Not added'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Tags</Text>
                        <Text style={styles.detailValue}>
                          {(selectedClient.tags || []).length
                            ? (selectedClient.tags || []).join(', ')
                            : 'No tags'}
                        </Text>
                      </View>
                      <View style={[styles.detailRow, styles.detailRowStack, { borderBottomWidth: 0 }]}>
                        <Text style={styles.detailLabel}>Notes</Text>
                        <Text style={styles.detailNoteValue}>
                          {selectedClient.notes || 'No internal notes'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.profileSection}>
                    <Text style={styles.profileSectionTitle}>Client activity</Text>
                    <View style={styles.statsGrid}>
                      <View style={[styles.statBox, styles.statBoxRight, styles.statBoxBottom]}>
                        <Text style={styles.statNumber}>{selectedHistory.length}</Text>
                        <Text style={styles.statCaption}>Visits</Text>
                      </View>
                      <View style={[styles.statBox, styles.statBoxBottom]}>
                        <Text style={styles.statNumber}>{money(selectedSpend)}</Text>
                        <Text style={styles.statCaption}>Lifetime spend</Text>
                      </View>
                      <View style={[styles.statBox, styles.statBoxRight]}>
                        <Text style={styles.statNumber}>{displayDate(lastVisit)}</Text>
                        <Text style={styles.statCaption}>Last visit</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statNumber}>{displayDate(nextVisit)}</Text>
                        <Text style={styles.statCaption}>Next appointment</Text>
                      </View>
                    </View>
                  </View>

                  {/* Appointment History */}
                  <View style={styles.historySection}>
                    <Text style={styles.historyTitle}>Appointment history</Text>
                    {selectedHistory.length > 0 ? (
                      selectedHistory.map((appt) => (
                        <Pressable
                          key={appt.id}
                          onPress={() => {
                            setSelectedClient(null);
                            router.push({ pathname: '/booking/[id]', params: { id: appt.id } });
                          }}
                          style={({ pressed }) => [styles.historyItem, pressed && styles.pressed]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.historyService}>{appt.service_names}</Text>
                            <Text style={styles.historyDate}>
                              {displayDate(appt.appointment_date)} · {appt.appointment_time}
                            </Text>
                          </View>
                          <Text style={styles.historyPrice}>{appt.total_price || '₱0'}</Text>
                          <StatusBadge status={appt.status} />
                        </Pressable>
                      ))
                    ) : (
                      <View style={styles.emptyHistory}>
                        <Text style={styles.emptyHistoryText}>No appointment history yet.</Text>
                      </View>
                    )}
                  </View>
                </>
              ) : (
                /* Edit / Create Client Form */
                <View style={styles.form}>
                  <Field
                    label="Full name *"
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Anna Reyes"
                    maxLength={100}
                  />
                  <Field
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="client@example.com"
                    keyboardType="email-address"
                    maxLength={150}
                  />
                  <Field
                    label="Phone"
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+63 900 000 0000"
                    keyboardType="phone-pad"
                    maxLength={40}
                  />
                  <View style={styles.tagInputGroup}>
                    <Field
                      label="Tags"
                      hint="Comma-separated"
                      value={tagsText}
                      onChangeText={setTagsText}
                      placeholder="regular, bridal, VIP"
                    />
                    <View style={styles.quickTagsRow}>
                      {QUICK_TAGS.map((tag) => {
                        const active = tagsText
                          .split(',')
                          .map((t) => t.trim())
                          .includes(tag);
                        return (
                          <Pressable
                            key={tag}
                            onPress={() => toggleQuickTag(tag)}
                            style={[styles.quickTagChip, active && styles.quickTagChipActive]}
                          >
                            <Text style={[styles.quickTagText, active && styles.quickTagTextActive]}>
                              + {tag}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <Field
                    label="Internal notes"
                    hint={`Internal only · ${notes.length}/500`}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Preferences, allergies, nail shade, or reminders"
                    multiline
                    maxLength={500}
                  />

                  <View style={styles.blockToggleCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.blockToggleTitle}>Block online booking</Text>
                      <Text style={styles.blockToggleSub}>
                        Prevent this customer from creating new public bookings.
                      </Text>
                    </View>
                    <Switch
                      value={blocked}
                      onValueChange={setBlocked}
                      trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                      thumbColor={blocked ? colors.coral : '#fff'}
                    />
                  </View>

                  <View style={styles.formFooter}>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Cancel"
                        secondary
                        icon="close"
                        onPress={() => {
                          if (selectedClient?.id) setEditing(false);
                          else setSelectedClient(null);
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label={saving ? 'Saving…' : 'Save client'}
                        disabled={saving}
                        icon="checkmark"
                        onPress={() => void handleSave()}
                      />
                    </View>
                  </View>
                </View>
              )}
            </KeyboardAwareScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
        </Animated.View>
        </View>
      </Modal>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
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
  mergeCard: { backgroundColor: '#FFFBF5', borderColor: '#F3D9B1', gap: space.sm },
  mergeHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mergeTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  mergeSub: { color: colors.muted, fontSize: 12 },
  mergeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F3D9B1',
  },
  mergeName: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  mergeMeta: { color: colors.muted, fontSize: 12 },
  mergeBtn: {
    backgroundColor: colors.navy,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  mergeBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 78,
    paddingVertical: 13,
    paddingHorizontal: 2,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.lilac,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.navy, fontSize: 15, fontWeight: '800' },
  copy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { color: colors.ink, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  contact: { color: colors.muted, fontSize: 12, marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
  visitCount: { color: colors.navy, fontSize: 11, fontWeight: '700' },
  tagBadge: {
    backgroundColor: colors.canvas,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tagBadgeText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  notes: { color: colors.muted, fontSize: 11, marginTop: 5, fontStyle: 'italic' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  modalDismissArea: { flex: 1 },
  clientSheet: {
    width: '100%',
    height: '88%',
    overflow: 'hidden',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  clientSheetSafe: { flex: 1 },
  sheetHandle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    marginTop: 8,
    borderRadius: 2,
    backgroundColor: '#D5D9DD',
  },
  drawerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  drawerHeaderTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  drawerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconPressed: { opacity: 0.55 },
  drawerContent: { paddingHorizontal: space.lg, paddingBottom: 36, gap: 16 },
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: { color: colors.skyInk, fontSize: 19, fontWeight: '800' },
  heroCopy: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 3 },
  heroName: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  heroContact: { color: colors.muted, fontSize: 12 },
  contactActionsRow: {
    flexDirection: 'row',
    gap: 2,
    padding: 4,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  contactActionBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  contactActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactActionIconEmail: { backgroundColor: colors.lilac },
  contactActionIconCall: { backgroundColor: colors.mint },
  contactActionIconMessage: { backgroundColor: colors.peach },
  contactActionIconAccent: { backgroundColor: colors.coralSoft },
  contactActionDisabled: { opacity: 0.4 },
  contactActionPressed: { opacity: 0.55 },
  contactActionLabel: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  profileSection: { gap: 5 },
  profileSectionTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  detailCard: {
    paddingVertical: 2,
    backgroundColor: '#FFFFFF',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  detailLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  detailValue: { color: colors.ink, fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'right' },
  detailRowStack: { flexDirection: 'column', gap: 5 },
  detailNoteValue: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  statBox: { width: '50%', minHeight: 72, padding: 12, gap: 4 },
  statBoxRight: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.line },
  statBoxBottom: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  statNumber: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  statCaption: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  historySection: { gap: space.sm },
  historyTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 62,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingVertical: 10,
  },
  historyService: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  historyDate: { color: colors.muted, fontSize: 12, marginTop: 2 },
  historyPrice: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  emptyHistory: { paddingVertical: 18 },
  emptyHistoryText: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  form: { gap: space.md },
  tagInputGroup: { gap: 8 },
  quickTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickTagChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  quickTagChipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  quickTagText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  quickTagTextActive: { color: '#fff' },
  blockToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.canvas,
  },
  blockToggleTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  blockToggleSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  formFooter: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
