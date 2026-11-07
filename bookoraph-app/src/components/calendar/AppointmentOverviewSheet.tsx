import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Text } from '@/components/app-text';
import { openExternalLink } from '@/lib/external-links';
import { supabase } from '@/lib/supabase';
import { sendAppointmentUpdateEmail } from '@/lib/appointment-notifications';
import { useApp } from '@/providers/app-provider';
import { colors, radius } from '@/theme';
import type { Appointment, AppointmentStatus, Client, Service } from '@/types';
import { NewAppointmentModal } from './NewAppointmentModal';
import {
  AVATAR_COLORS,
  getInitials,
  pickAppointmentColor,
  parseDateKey,
} from './types';

interface AppointmentOverviewSheetProps {
  appointment: Appointment | null;
  page?: boolean;
  services: Service[];
  clients: Client[];
  onClose: () => void;
  onUpdateStatus: (id: string, status: AppointmentStatus, noShowReason?: string) => Promise<string | null>;
  onUpdateAppointment: (id: string, updates: Partial<Appointment>) => Promise<string | null>;
  onUpdateFinalAmount: (id: string, amount: number, note: string, sendEmail?: boolean) => Promise<string | null>;
  onCollectPayment: (
    appointment: Appointment,
    payment: { amount: number; method: string; note: string }
  ) => Promise<string | null>;
  onDeleteAppointment: (id: string) => Promise<string | null>;
}

export function AppointmentOverviewSheet({
  appointment,
  page = false,
  services,
  clients,
  onClose,
  onUpdateStatus,
  onUpdateAppointment,
  onUpdateFinalAmount,
  onCollectPayment,
  onDeleteAppointment,
}: AppointmentOverviewSheetProps) {
  // Local state
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<{ peg: string; receipt: string }>({ peg: '', receipt: '' });
  const [selectedAttachment, setSelectedAttachment] = useState<{ url: string; label: string } | null>(null);

  // Status confirm
  const [confirmAction, setConfirmAction] = useState<'approve' | 'cancel' | null>(null);
  const [cancelConfirmation, setCancelConfirmation] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Final amount
  const [finalAmount, setFinalAmount] = useState(() =>
    appointment?.final_total_amount != null ? String(appointment.final_total_amount) : ''
  );
  const [finalAmountNote, setFinalAmountNote] = useState(() => appointment?.final_amount_note || '');
  const [finalAmountSaving, setFinalAmountSaving] = useState(false);
  const [finalAmountConfirmOpen, setFinalAmountConfirmOpen] = useState(false);

  // Reminder
  const [reminderSentAt, setReminderSentAt] = useState<string | null>(
    () => appointment?.final_amount_sent_at || null
  );
  const [reminderSending, setReminderSending] = useState(false);

  // Payment modal
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'e_wallet' | 'other'>('cash');
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState('');
  const [addOns, setAddOns] = useState<{ id: number; name: string; amount: string }[]>([]);

  // Edit appointment modal
  const { appointments, businessName } = useApp();
  const [editOpen, setEditOpen] = useState(false);

  // Load attachments
  useEffect(() => {
    let active = true;
    const loadAttachments = async () => {
      if (!appointment) {
        setAttachmentUrls({ peg: '', receipt: '' });
        return;
      }
      const note = appointment.customer_note || '';
      const pegPath =
        appointment.peg_image_path ||
        note.match(/\[Peg Storage Path:\s*([^\]]+)\]/i)?.[1]?.trim() ||
        '';
      const receiptPath =
        appointment.payment_receipt_path ||
        note.match(/\[(?:Payment )?Receipt Storage Path:\s*([^\]]+)\]/i)?.[1]?.trim() ||
        '';

      const resolve = async (path: string) => {
        if (!path) return '';
        if (/^(https?:\/\/|data:image\/)/i.test(path)) return path;
        if (!supabase) return '';
        try {
          const result = await supabase.storage.from('booking-attachments').createSignedUrl(path, 3600);
          return result.data?.signedUrl || '';
        } catch {
          return '';
        }
      };

      const [peg, receipt] = await Promise.all([resolve(pegPath), resolve(receiptPath)]);
      if (active) setAttachmentUrls({ peg, receipt });
    };

    void loadAttachments();
    return () => {
      active = false;
    };
  }, [appointment]);

  if (!appointment) return null;

  // Formatting helpers
  const dateObj = parseDateKey(appointment.appointment_date);
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const cleanCustomerNote = (appointment.customer_note || '')
    .replace(/\s*\[(?:Peg|Payment )?Storage Path:\s*[^\]]+\]/gi, '')
    .replace(/\s*\[(?:Paid in Full|Deposit):\s*[^\]]+\]/gi, '')
    .trim();

  const colorKey = pickAppointmentColor(appointment.customer_name);
  const avatarStyle = AVATAR_COLORS[colorKey] ?? AVATAR_COLORS.coral;

  // Calculation for Payment modal
  const estimatedAmount = Number(String(appointment.total_price || '').replace(/[^0-9.-]+/g, '')) || 0;
  const baseAmount = appointment.final_total_amount ?? estimatedAmount;
  const addOnTotal = addOns.reduce((sum, item) => sum + (Number(item.amount.replace(/[^0-9.-]+/g, '')) || 0), 0);
  const subtotal = Math.max(0, baseAmount + addOnTotal);
  const rawDiscount = Number(discountValue.replace(/[^0-9.-]+/g, '')) || 0;
  const discountAmount =
    discountType === 'percent'
      ? Math.min(subtotal, (subtotal * Math.min(100, Math.max(0, rawDiscount))) / 100)
      : Math.min(subtotal, Math.max(0, rawDiscount));
  const paymentTotal = Math.max(0, subtotal - discountAmount);
  const alreadyPaid = Math.max(0, Number(appointment.payment_paid || 0));
  const balanceDue = Math.max(0, paymentTotal - alreadyPaid);

  // Status changes
  const handleConfirmStatusChange = async () => {
    if (!confirmAction || statusUpdating) return;
    if (confirmAction === 'cancel' && cancelConfirmation.trim().toUpperCase() !== 'YES') return;
    setStatusUpdating(true);
    try {
      const targetStatus: AppointmentStatus = confirmAction === 'approve' ? 'approved' : 'cancelled';
      const err = await onUpdateStatus(appointment.id, targetStatus);
      if (err) Alert.alert('Error', err);
      else {
        setConfirmAction(null);
        setCancelConfirmation('');
      }
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleMarkNoShow = () => {
    if (Alert.prompt) {
      Alert.prompt(
        'Mark No-show',
        'Internal no-show reason (optional):',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: (reason) => {
              void onUpdateStatus(appointment.id, 'no_show', reason || '');
            },
          },
        ],
        'plain-text'
      );
    } else {
      Alert.alert('Mark as No-show?', 'This appointment will be marked as a no-show.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => void onUpdateStatus(appointment.id, 'no_show', 'No-show'),
        },
      ]);
    }
  };

  const handleSaveFinalAmount = async (sendEmail: boolean) => {
    if (finalAmountSaving) return;
    const amount = Number(finalAmount.replace(/[^0-9.-]+/g, ''));
    if (!Number.isFinite(amount) || amount < 0) {
      Alert.alert('Invalid amount', 'Please enter a valid final amount.');
      return;
    }
    if (sendEmail && !appointment.customer_email?.trim()) {
      Alert.alert('Missing email', 'This appointment has no client email to send to.');
      return;
    }
    setFinalAmountSaving(true);
    try {
      const err = await onUpdateFinalAmount(appointment.id, amount, finalAmountNote, sendEmail);
      if (err) Alert.alert('Error', err);
      else {
        if (sendEmail) setFinalAmountConfirmOpen(false);
        Alert.alert('Success', sendEmail ? 'Final amount sent to the client' : 'Final amount saved');
      }
    } finally {
      setFinalAmountSaving(false);
    }
  };

  const handleSendReminder = async () => {
    if (reminderSending || reminderSentAt) return;
    if (!appointment.customer_email?.trim()) {
      Alert.alert('Missing email', 'This appointment has no client email.');
      return;
    }
    setReminderSending(true);
    try {
      const res = await sendAppointmentUpdateEmail({
        businessId: appointment.business_id,
        appointmentId: appointment.id,
        eventType: 'reminder',
      });
      if (!res.ok) {
        Alert.alert('Reminder failed', res.error || 'Could not send reminder');
      } else {
        const timestamp = new Date().toISOString();
        setReminderSentAt(timestamp);
        Alert.alert('Sent', 'Reminder sent successfully');
      }
    } finally {
      setReminderSending(false);
    }
  };

  const openPaymentCollector = () => {
    setPaymentAmount(balanceDue.toFixed(2));
    setPaymentOpen(true);
  };

  const handleRecordPayment = async () => {
    if (paymentSaving) return;
    const amount = Number(paymentAmount.replace(/[^0-9.-]+/g, '')) || 0;
    if (amount < 0 || amount > balanceDue) {
      Alert.alert('Invalid amount', `Enter an amount between ₱0.00 and ₱${balanceDue.toFixed(2)}.`);
      return;
    }
    const note = [
      `Final total: ₱${paymentTotal.toFixed(2)}`,
      ...(addOns.length
        ? [
            `Add-ons: ${addOns
              .filter((item) => item.name.trim())
              .map((item) => `${item.name.trim()} ₱${Number(item.amount || 0).toFixed(2)}`)
              .join(', ')}`,
          ]
        : []),
      ...(discountAmount ? [`Discount: -₱${discountAmount.toFixed(2)}`] : []),
    ].join(' · ');

    setPaymentSaving(true);
    try {
      const err = await onCollectPayment(appointment, { amount, method: paymentMethod, note });
      if (err) Alert.alert('Error', err);
      else {
        setPaymentOpen(false);
      }
    } finally {
      setPaymentSaving(false);
    }
  };

  const openEditModal = () => {
    setEditOpen(true);
  };

  const copyBookingId = () => {
    Alert.alert('Booking ID', `#${appointment.id.toUpperCase()}`);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Appointment',
      'Are you sure you want to permanently delete this appointment from your calendar?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const err = await onDeleteAppointment(appointment.id);
            if (err) Alert.alert('Error', err);
            else onClose();
          },
        },
      ]
    );
  };

  // Status Badge Helper
  const renderStatusPill = (status: AppointmentStatus) => {
    const pillStyles: Record<AppointmentStatus, { bg: string; text: string; label: string }> = {
      pending: { bg: '#FFFBEB', text: '#D97706', label: 'Pending' },
      approved: { bg: '#ECFDF5', text: '#059669', label: 'Approved' },
      completed: { bg: '#E6FCF5', text: '#0CA678', label: 'Completed' },
      cancelled: { bg: '#F1F5F9', text: '#64748B', label: 'Cancelled' },
      no_show: { bg: '#FEF2F2', text: '#DC2626', label: 'No-show' },
    };
    const current = pillStyles[status] || pillStyles.approved;
    return (
      <View style={[styles.statusPill, { backgroundColor: current.bg }]}>
        <Text style={[styles.statusPillText, { color: current.text }]}>{current.label}</Text>
      </View>
    );
  };

  const overviewContent = (
    <View style={page ? styles.pageContainer : styles.sheetContainer}>
          {/* Header */}
          <View style={styles.headerNav}>
            <View style={styles.headerLeft}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to calendar"
                onPress={onClose}
                style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>
              <View style={styles.headerTitleWrap}>
                <Text style={styles.headerTitleText}>Overview</Text>
                {renderStatusPill(appointment.status)}
              </View>
            </View>

            <View style={styles.headerRightActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit appointment"
                onPress={openEditModal}
                style={({ pressed }) => [styles.headerNavBtn, pressed && styles.pressed]}
              >
                <Ionicons name="create-outline" size={20} color={colors.ink} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More options"
                onPress={() => setMenuOpen((v) => !v)}
                style={({ pressed }) => [styles.headerNavBtn, pressed && styles.pressed]}
              >
                <Ionicons name="ellipsis-vertical" size={19} color={colors.ink} />
              </Pressable>
            </View>
          </View>

          {/* More Dropdown Menu */}
          {menuOpen && (
            <View style={styles.dropdownMenu}>
              {appointment.status === 'approved' && (
                <>
                  <Pressable
                    style={styles.dropdownItem}
                    onPress={() => {
                      setMenuOpen(false);
                      openPaymentCollector();
                    }}
                  >
                    <Ionicons name="checkmark-circle-outline" size={16} color={colors.ink} />
                    <Text style={styles.dropdownItemText}>Mark Completed</Text>
                  </Pressable>
                  <Pressable
                    style={styles.dropdownItem}
                    onPress={() => {
                      setMenuOpen(false);
                      handleMarkNoShow();
                    }}
                  >
                    <Ionicons name="close-circle-outline" size={16} color={colors.ink} />
                    <Text style={styles.dropdownItemText}>Mark No-show</Text>
                  </Pressable>
                </>
              )}
              {appointment.status === 'cancelled' && (
                <Pressable
                  style={styles.dropdownItem}
                  onPress={() => {
                    setMenuOpen(false);
                    void onUpdateStatus(appointment.id, 'approved');
                  }}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.ink} />
                  <Text style={styles.dropdownItemText}>Restore to Approved</Text>
                </Pressable>
              )}
              <Pressable
                style={styles.dropdownItem}
                onPress={() => {
                  setMenuOpen(false);
                  copyBookingId();
                }}
              >
                <Ionicons name="copy-outline" size={16} color={colors.ink} />
                <Text style={styles.dropdownItemText}>Copy Booking ID</Text>
              </Pressable>
              <Pressable
                style={[styles.dropdownItem, styles.dropdownItemDanger]}
                onPress={() => {
                  setMenuOpen(false);
                  handleDelete();
                }}
              >
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Text style={[styles.dropdownItemText, { color: colors.danger }]}>Delete Appointment</Text>
              </Pressable>
            </View>
          )}

          {/* Scrollable Overview Content */}
          <KeyboardAvoidingView
            behavior={page ? (Platform.OS === 'ios' ? 'padding' : 'height') : undefined}
            style={styles.pageKeyboard}
          >
          <ScrollView
            style={[styles.contentScroll, page && styles.pageContentScroll]}
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {/* Card 1: Service and Duration */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="cut-outline" size={15} color={colors.coral} />
                <Text style={styles.cardHeaderLabel}>SERVICE & DURATION</Text>
              </View>
              <Text style={styles.serviceTitle}>{appointment.service_names}</Text>
              <View style={styles.badgesRow}>
                <View style={styles.durationBadge}>
                  <Ionicons name="time-outline" size={13} color={colors.coral} />
                  <Text style={styles.durationBadgeText}>{appointment.duration_minutes} mins</Text>
                </View>
                <View style={styles.priceBadge}>
                  <Ionicons name="pricetag-outline" size={13} color={colors.ink} />
                  <Text style={styles.priceBadgeText}>{appointment.total_price || '₱0'}</Text>
                </View>
              </View>
              {Boolean(appointment.meeting_url) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Join video appointment"
                  style={styles.meetingLink}
                  onPress={() => {
                    if (!appointment.meeting_url) return;
                    void openExternalLink(appointment.meeting_url).then((opened) => {
                      if (!opened) Alert.alert('Video link unavailable', 'Please check the meeting link and try again.');
                    });
                  }}
                >
                  <Ionicons name="videocam-outline" size={15} color={colors.coral} />
                  <Text style={styles.meetingLinkText}>Join video appointment</Text>
                </Pressable>
              )}
              {appointment.status === 'no_show' && Boolean(appointment.no_show_reason) && (
                <View style={styles.noShowBox}>
                  <Ionicons name="document-text-outline" size={13} color={colors.danger} />
                  <Text style={styles.noShowText}>No-show reason: {appointment.no_show_reason}</Text>
                </View>
              )}
            </View>

            {/* Card 2: Pricing & Payment */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="card-outline" size={15} color={colors.coral} />
                <Text style={styles.cardHeaderLabel}>PRICING & PAYMENT</Text>
              </View>
              <View style={styles.twoColumnGrid}>
                <View style={styles.gridStat}>
                  <Text style={styles.gridStatLabel}>Estimated total</Text>
                  <Text style={styles.gridStatValue}>{appointment.total_price || '₱0'}</Text>
                </View>
                <View style={styles.gridStat}>
                  <Text style={styles.gridStatLabel}>Final total</Text>
                  <TextInput
                    onFocus={() => setFocusedField('finalAmount')}
                    onBlur={() => setFocusedField(null)}
                    value={finalAmount}
                    onChangeText={setFinalAmount}
                    placeholder="₱0.00"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                    style={[styles.smallInput, focusedField === 'finalAmount' && styles.inputFocused]}
                  />
                </View>
              </View>

              <View style={styles.pricingNoteGroup}>
                <Text style={styles.pricingNoteLabel}>Note for client (optional)</Text>
                  <TextInput
                    onFocus={() => setFocusedField('finalAmountNote')}
                    onBlur={() => setFocusedField(null)}
                    value={finalAmountNote}
                  onChangeText={setFinalAmountNote}
                  placeholder="Add a note..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={2}
                    style={[styles.smallInput, styles.noteTextArea, focusedField === 'finalAmountNote' && styles.inputFocused]}
                />
              </View>

              {Boolean(appointment.final_amount_sent_at) && (
                <Text style={styles.pricingSentNote}>
                  Sent {new Date(appointment.final_amount_sent_at!).toLocaleDateString('en-PH')}
                </Text>
              )}

              <View style={styles.pricingActionsRow}>
                <Pressable
                  disabled={finalAmountSaving}
                  onPress={() => void handleSaveFinalAmount(false)}
                  style={({ pressed }) => [styles.outlineActionBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.outlineActionBtnText}>
                    {finalAmountSaving ? 'Saving…' : 'Save amount'}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={finalAmountSaving}
                  onPress={() => setFinalAmountConfirmOpen(true)}
                  style={({ pressed }) => [styles.solidActionBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="mail" size={14} color="#FFFFFF" />
                  <Text style={styles.solidActionBtnText}>Send final amount</Text>
                </Pressable>
              </View>
            </View>

            {/* Card 3: Date & Time */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="calendar-outline" size={15} color={colors.coral} />
                <Text style={styles.cardHeaderLabel}>DATE & TIME</Text>
              </View>
              <Text style={styles.scheduleDateText}>{formattedDate}</Text>
              <Text style={styles.scheduleTimeText}>{appointment.appointment_time}</Text>
            </View>

            {/* Card 4: Guest */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="person-outline" size={15} color={colors.coral} />
                <Text style={styles.cardHeaderLabel}>GUEST</Text>
              </View>

              <View style={styles.guestRow}>
                <View
                  style={[
                    styles.guestAvatar,
                    { backgroundColor: avatarStyle.bg, borderColor: avatarStyle.border },
                  ]}
                >
                  <Text style={[styles.guestAvatarText, { color: avatarStyle.text }]}>
                    {getInitials(appointment.customer_name)}
                  </Text>
                </View>

                <View style={styles.guestInfo}>
                  <Text style={styles.guestNameText}>{appointment.customer_name}</Text>
                  <View style={styles.contactList}>
                    {appointment.customer_email ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Email ${appointment.customer_name}`}
                        onPress={() => {
                          void openExternalLink(`mailto:${appointment.customer_email}`).then((opened) => {
                            if (!opened) Alert.alert('Email unavailable', 'No email app is available on this device.');
                          });
                        }}
                        style={styles.contactItem}
                      >
                        <Ionicons name="mail-outline" size={13} color={colors.muted} />
                        <Text style={styles.contactItemText}>{appointment.customer_email}</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.contactItem}>
                        <Ionicons name="mail-outline" size={13} color={colors.muted} />
                        <Text style={[styles.contactItemText, { color: colors.muted }]}>No email</Text>
                      </View>
                    )}

                    {appointment.customer_phone ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Call ${appointment.customer_name}`}
                        onPress={() => {
                          void openExternalLink(`tel:${appointment.customer_phone}`).then((opened) => {
                            if (!opened) Alert.alert('Calling unavailable', 'This device cannot start a phone call.');
                          });
                        }}
                        style={styles.contactItem}
                      >
                        <Ionicons name="call-outline" size={13} color={colors.muted} />
                        <Text style={styles.contactItemText}>{appointment.customer_phone}</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.contactItem}>
                        <Ionicons name="call-outline" size={13} color={colors.muted} />
                        <Text style={[styles.contactItemText, { color: colors.muted }]}>No phone provided</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {Boolean(appointment.customer_address) && (
                <View style={styles.addressRow}>
                  <Ionicons name="location-outline" size={13} color={colors.muted} />
                  <Text style={styles.addressText}>{appointment.customer_address}</Text>
                </View>
              )}

              {Boolean(cleanCustomerNote) && (
                <View style={styles.clientNoteBox}>
                  <Text style={styles.clientNoteLabel}>CLIENT NOTE:</Text>
                  <Text style={styles.clientNoteText}>{cleanCustomerNote}</Text>
                </View>
              )}
            </View>

            {/* Card 5: Booking ID */}
            <View style={[styles.card, styles.bookingIdCard]}>
              <Text style={styles.cardHeaderLabel}>BOOKING ID</Text>
              <View style={styles.bookingIdValRow}>
                <View style={styles.bookingIdBadge}>
                  <Text style={styles.bookingIdCode}>
                    #{appointment.id.length > 10 ? appointment.id.slice(0, 8).toUpperCase() : appointment.id.toUpperCase()}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Copy booking ID"
                  onPress={copyBookingId}
                  style={({ pressed }) => [styles.copyBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="copy-outline" size={14} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            {/* Card 6: Client Reminder */}
            <View style={styles.reminderRowCard}>
              <View style={styles.reminderCopy}>
                <Ionicons name="notifications-outline" size={17} color={colors.coral} />
                <View style={styles.reminderTexts}>
                  <Text style={styles.reminderTitle}>
                    {reminderSentAt ? 'Reminder sent' : 'Client reminder'}
                  </Text>
                  <Text style={styles.reminderSubtitle} numberOfLines={1}>
                    {reminderSentAt
                      ? new Date(reminderSentAt).toLocaleDateString('en-PH')
                      : appointment.customer_email || 'No client email'}
                  </Text>
                </View>
              </View>

              {reminderSentAt ? (
                <View style={styles.reminderSentBadge}>
                  <Text style={styles.reminderSentBadgeText}>Sent</Text>
                </View>
              ) : (
                <Pressable
                  disabled={!appointment.customer_email || reminderSending}
                  onPress={handleSendReminder}
                  style={({ pressed }) => [
                    styles.reminderBtn,
                    (!appointment.customer_email || reminderSending) && styles.btnDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {reminderSending ? (
                    <ActivityIndicator size="small" color={colors.coral} />
                  ) : (
                    <>
                      <Ionicons name="mail" size={13} color={colors.coral} />
                      <Text style={styles.reminderBtnText}>Send reminder</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            {/* Card 7: Client Attachments */}
            <View style={styles.card}>
              <Text style={styles.cardHeaderLabel}>CLIENT ATTACHMENTS</Text>
              <View style={styles.attachmentGrid}>
                {attachmentUrls.peg ? (
                  <Pressable
                    onPress={() => setSelectedAttachment({ url: attachmentUrls.peg, label: 'Design peg' })}
                    style={styles.attachmentItem}
                  >
                    <Image source={{ uri: attachmentUrls.peg }} style={imageStyles.attachmentThumb} resizeMode="cover" />
                    <Text style={styles.attachmentLabel}>Design peg</Text>
                  </Pressable>
                ) : (
                  <View style={[styles.attachmentItem, styles.attachmentEmpty]}>
                    <Text style={styles.attachmentLabel}>Design peg</Text>
                    <Text style={styles.attachmentEmptyText}>No attachment</Text>
                  </View>
                )}

                {attachmentUrls.receipt ? (
                  <Pressable
                    onPress={() => setSelectedAttachment({ url: attachmentUrls.receipt, label: 'Payment receipt' })}
                    style={styles.attachmentItem}
                  >
                    <Image
                      source={{ uri: attachmentUrls.receipt }}
                      style={imageStyles.attachmentThumb}
                      resizeMode="cover"
                    />
                    <Text style={styles.attachmentLabel}>Payment receipt</Text>
                  </Pressable>
                ) : (
                  <View style={[styles.attachmentItem, styles.attachmentEmpty]}>
                    <Text style={styles.attachmentLabel}>Payment receipt</Text>
                    <Text style={styles.attachmentEmptyText}>No attachment</Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Sticky Bottom Footer Action Bar */}
          <View style={styles.bottomFooter}>
            {appointment.status === 'pending' && (
              <View style={styles.footerRow}>
                <Pressable
                  onPress={() => setConfirmAction('approve')}
                  style={({ pressed }) => [styles.solidApproveBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="checkmark-circle" size={17} color="#FFFFFF" />
                  <Text style={styles.solidApproveBtnText}>Approve</Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirmAction('cancel')}
                  style={({ pressed }) => [styles.outlineCancelBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="close-circle-outline" size={17} color={colors.danger} />
                  <Text style={styles.outlineCancelBtnText}>Cancel</Text>
                </Pressable>
              </View>
            )}

            {appointment.status === 'approved' && (
              <View style={styles.footerRow}>
                <Pressable
                  onPress={openPaymentCollector}
                  style={({ pressed }) => [styles.solidApproveBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="checkmark-circle" size={17} color="#FFFFFF" />
                  <Text style={styles.solidApproveBtnText}>Mark Completed</Text>
                </Pressable>
                <Pressable
                  onPress={handleMarkNoShow}
                  style={({ pressed }) => [styles.outlineActionBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="close-circle-outline" size={17} color={colors.ink} />
                  <Text style={styles.outlineActionBtnText}>Mark No-show</Text>
                </Pressable>
              </View>
            )}

            {appointment.status === 'cancelled' && (
              <Pressable
                onPress={() => void onUpdateStatus(appointment.id, 'approved')}
                style={({ pressed }) => [styles.outlineActionBtn, pressed && styles.pressed, { width: '100%' }]}
              >
                <Ionicons name="refresh-outline" size={17} color={colors.ink} />
                <Text style={styles.outlineActionBtnText}>Restore to Approved</Text>
              </Pressable>
            )}
          </View>
          </KeyboardAvoidingView>
    </View>
  );

  return (
    <>
      {page ? (
        overviewContent
      ) : (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
          <View style={styles.sheetBackdrop}>{overviewContent}</View>
        </Modal>
      )}

      {/* Confirmation Modal for Approve / Cancel */}
      {confirmAction && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setConfirmAction(null)}>
          <View style={styles.subModalBackdrop}>
            <View style={styles.subModalBox}>
              <Text style={styles.subModalTitle}>
                {confirmAction === 'approve' ? 'Approve appointment?' : 'Cancel appointment?'}
              </Text>
              <Text style={styles.subModalDesc}>
                {confirmAction === 'approve'
                  ? 'The client will be notified that this appointment is confirmed.'
                  : 'This will cancel the appointment and send a cancellation email.'}
              </Text>

              {confirmAction === 'cancel' && (
                <View style={styles.cancelInputGroup}>
                  <Text style={styles.cancelInputLabel}>Type YES to confirm</Text>
                  <TextInput
                    onFocus={() => setFocusedField('cancelConfirmation')}
                    onBlur={() => setFocusedField(null)}
                    value={cancelConfirmation}
                    onChangeText={setCancelConfirmation}
                    placeholder="YES"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="characters"
                    style={[styles.cancelTextInput, focusedField === 'cancelConfirmation' && styles.inputFocused]}
                  />
                </View>
              )}

              <View style={styles.subModalActions}>
                <Pressable
                  disabled={statusUpdating}
                  onPress={() => setConfirmAction(null)}
                  style={({ pressed }) => [styles.subModalCancelBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.subModalCancelBtnText}>No</Text>
                </Pressable>
                <Pressable
                  disabled={
                    statusUpdating ||
                    (confirmAction === 'cancel' && cancelConfirmation.trim().toUpperCase() !== 'YES')
                  }
                  onPress={handleConfirmStatusChange}
                  style={({ pressed }) => [
                    styles.subModalConfirmBtn,
                    confirmAction === 'cancel' && { backgroundColor: colors.danger },
                    (statusUpdating ||
                      (confirmAction === 'cancel' && cancelConfirmation.trim().toUpperCase() !== 'YES')) &&
                      styles.btnDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {statusUpdating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.subModalConfirmBtnText}>Yes</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Final Amount Confirm Modal */}
      {finalAmountConfirmOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setFinalAmountConfirmOpen(false)}>
          <View style={styles.subModalBackdrop}>
            <View style={styles.subModalBox}>
              <Text style={styles.subModalTitle}>Send final amount?</Text>
              <Text style={styles.subModalDesc}>
                Send the confirmed final amount of ₱{Number(finalAmount || 0).toFixed(2)} to {appointment.customer_name} at {appointment.customer_email || 'client email'}.
              </Text>
              <View style={styles.subModalActions}>
                <Pressable
                  disabled={finalAmountSaving}
                  onPress={() => setFinalAmountConfirmOpen(false)}
                  style={({ pressed }) => [styles.subModalCancelBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.subModalCancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={finalAmountSaving}
                  onPress={() => void handleSaveFinalAmount(true)}
                  style={({ pressed }) => [styles.subModalConfirmBtn, pressed && styles.pressed]}
                >
                  {finalAmountSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.subModalConfirmBtnText}>Send amount</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Record Payment & Complete Modal */}
      {paymentOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPaymentOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.editModalBackdrop}
          >
            <View nativeID="bookora-sheet" style={styles.paymentModalBox}>
              <View style={styles.paymentModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.paymentModalTitle}>Complete appointment</Text>
                  <Text style={styles.paymentModalSubtitle}>Review the final bill and record the payment received.</Text>
                </View>
                <Pressable
                  onPress={() => setPaymentOpen(false)}
                  style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                >
                  <Ionicons name="close" size={18} color={colors.ink} />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                <View style={styles.paymentBreakdown}>
                  <View style={styles.paymentRow}>
                    <Text style={styles.paymentRowLabel}>Base total</Text>
                    <Text style={styles.paymentRowValue}>₱{baseAmount.toFixed(2)}</Text>
                  </View>

                  {/* Add-ons */}
                  {addOns.map((item) => (
                    <View key={item.id} style={styles.addonItemRow}>
                      <TextInput
                        onFocus={() => setFocusedField(`addon-name-${item.id}`)}
                        onBlur={() => setFocusedField(null)}
                        value={item.name}
                        onChangeText={(text) =>
                          setAddOns((current) =>
                            current.map((e) => (e.id === item.id ? { ...e, name: text } : e))
                          )
                        }
                        placeholder="Add-on name"
                        placeholderTextColor={colors.muted}
                        style={[styles.smallInput, { flex: 1.5 }, focusedField === `addon-name-${item.id}` && styles.inputFocused]}
                      />
                      <TextInput
                        onFocus={() => setFocusedField(`addon-amount-${item.id}`)}
                        onBlur={() => setFocusedField(null)}
                        value={item.amount}
                        onChangeText={(text) =>
                          setAddOns((current) =>
                            current.map((e) => (e.id === item.id ? { ...e, amount: text } : e))
                          )
                        }
                        placeholder="₱0.00"
                        placeholderTextColor={colors.muted}
                        keyboardType="decimal-pad"
                        style={[styles.smallInput, { flex: 1 }, focusedField === `addon-amount-${item.id}` && styles.inputFocused]}
                      />
                    </View>
                  ))}

                  <Pressable
                    onPress={() => setAddOns((curr) => [...curr, { id: Date.now(), name: '', amount: '' }])}
                    style={styles.addAddonBtn}
                  >
                    <Ionicons name="add" size={15} color={colors.coral} />
                    <Text style={styles.addAddonBtnText}>Add purchase add-on</Text>
                  </Pressable>

                  {/* Discount Section */}
                  <View style={styles.discountSection}>
                    <View style={styles.discountToggleRow}>
                      <Text style={styles.paymentRowLabel}>Discount type</Text>
                      <View style={styles.toggleGroup}>
                        <Pressable
                          onPress={() => setDiscountType('fixed')}
                          style={[styles.toggleBtn, discountType === 'fixed' && styles.toggleBtnActive]}
                        >
                          <Text style={[styles.toggleBtnText, discountType === 'fixed' && styles.toggleBtnTextActive]}>
                            Fixed
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setDiscountType('percent')}
                          style={[styles.toggleBtn, discountType === 'percent' && styles.toggleBtnActive]}
                        >
                          <Text style={[styles.toggleBtnText, discountType === 'percent' && styles.toggleBtnTextActive]}>
                            %
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                    <TextInput
                      onFocus={() => setFocusedField('discountValue')}
                      onBlur={() => setFocusedField(null)}
                      value={discountValue}
                      onChangeText={setDiscountValue}
                      placeholder={discountType === 'percent' ? '0%' : '₱0.00'}
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      style={[styles.smallInput, focusedField === 'discountValue' && styles.inputFocused]}
                    />
                  </View>

                  {/* Summary */}
                  <View style={styles.paymentSummaryBox}>
                    <View style={styles.paymentRow}>
                      <Text style={styles.paymentSummaryLabel}>Subtotal</Text>
                      <Text style={styles.paymentSummaryValue}>₱{subtotal.toFixed(2)}</Text>
                    </View>
                    {discountAmount > 0 && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentSummaryLabel}>Discount</Text>
                        <Text style={[styles.paymentSummaryValue, { color: colors.danger }]}>
                          -₱{discountAmount.toFixed(2)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.paymentRow}>
                      <Text style={[styles.paymentSummaryLabel, { fontWeight: '700', color: colors.ink }]}>
                        Final total
                      </Text>
                      <Text style={[styles.paymentSummaryValue, { fontWeight: '800', color: colors.ink }]}>
                        ₱{paymentTotal.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  {/* Payment Inputs */}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Amount received</Text>
                    <TextInput
                      onFocus={() => setFocusedField('paymentAmount')}
                      onBlur={() => setFocusedField(null)}
                      value={paymentAmount}
                      onChangeText={setPaymentAmount}
                      placeholder="₱0.00"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      style={[styles.smallInput, focusedField === 'paymentAmount' && styles.inputFocused]}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Payment method</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {(['cash', 'card', 'bank_transfer', 'e_wallet', 'other'] as const).map((method) => {
                        const isSelected = paymentMethod === method;
                        const labelMap = {
                          cash: 'Cash',
                          card: 'Card',
                          bank_transfer: 'Bank Transfer',
                          e_wallet: 'E-Wallet',
                          other: 'Other',
                        };
                        return (
                          <Pressable
                            key={method}
                            onPress={() => setPaymentMethod(method)}
                            style={[styles.methodChip, isSelected && styles.methodChipSelected]}
                          >
                            <Text style={[styles.methodChipText, isSelected && styles.methodChipTextSelected]}>
                              {labelMap[method]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.paymentFooter}>
                <View>
                  <Text style={styles.balanceDueLabel}>Balance due</Text>
                  <Text style={styles.balanceDueValue}>₱{balanceDue.toFixed(2)}</Text>
                </View>
                <Pressable
                  disabled={paymentSaving}
                  onPress={handleRecordPayment}
                  style={({ pressed }) => [styles.recordPayBtn, pressed && styles.pressed]}
                >
                  {paymentSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="card" size={15} color="#FFFFFF" />
                      <Text style={styles.recordPayBtnText}>Record & complete</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Edit Appointment Sheet Modal (Full step-by-step modal matching NewAppointmentModal) */}
      <NewAppointmentModal
        key={`edit-${appointment.id}-${editOpen}`}
        visible={editOpen}
        mode="edit"
        initialAppointment={appointment}
        services={services}
        existingAppointments={appointments}
        staffName={businessName}
        onClose={() => setEditOpen(false)}
        onCreate={async (draft) => {
          const err = await onUpdateAppointment(appointment.id, {
            customer_name: draft.customer_name,
            customer_email: draft.customer_email,
            customer_phone: draft.customer_phone,
            customer_note: draft.customer_note,
            service_names: draft.service_names,
            total_price: draft.total_price,
            appointment_date: draft.appointment_date,
            appointment_time: draft.appointment_time,
            duration_minutes: draft.duration_minutes,
            status: draft.status,
          });
          if (err) {
            Alert.alert('Error', err);
            return false;
          }
          return true;
        }}
      />

      {/* Attachment Viewer */}
      {selectedAttachment && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedAttachment(null)}>
          <View style={styles.viewerBackdrop}>
            <View style={styles.viewerToolbar}>
              <Text style={styles.viewerLabel}>{selectedAttachment.label}</Text>
              <Pressable
                onPress={() => setSelectedAttachment(null)}
                style={({ pressed }) => [styles.viewerCloseBtn, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
            <Image source={{ uri: selectedAttachment.url }} style={imageStyles.viewerImage} resizeMode="contain" />
          </View>
        </Modal>
      )}
    </>
  );
}

const imageStyles = StyleSheet.create({
  attachmentThumb: {
    width: '100%',
    height: 90,
    borderRadius: 8,
    backgroundColor: '#F4F4F5',
  },
  viewerImage: {
    width: '100%',
    height: '80%',
  },
});

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    height: '94%',
    backgroundColor: '#FAF8F6',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 24,
  },
  pageContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  pageKeyboard: {
    flex: 1,
  },
  headerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 54,
    right: 16,
    zIndex: 100,
    minWidth: 185,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 10,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  dropdownItemDanger: {
    borderTopWidth: 1,
    borderTopColor: '#FEE2E2',
    marginTop: 4,
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  contentScroll: {
    flex: 1,
    backgroundColor: '#FAFAF9',
  },
  pageContentScroll: {
    backgroundColor: '#FFFFFF',
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFECE6',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardHeaderLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  serviceTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: colors.ink,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.coralSoft,
  },
  durationBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.coral,
  },
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F4F4F5',
  },
  priceBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.ink,
  },
  meetingLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  meetingLinkText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.coral,
  },
  noShowBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  noShowText: {
    fontSize: 11.5,
    color: colors.danger,
    fontWeight: '600',
  },
  twoColumnGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  gridStat: {
    flex: 1,
    gap: 4,
  },
  gridStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
  },
  gridStatValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    minHeight: 38,
    textAlignVertical: 'center',
    paddingVertical: 8,
  },
  smallInput: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: '#FFFFFF',
    fontFamily: 'SpaceGrotesk_400Regular',
  },
  inputFocused: {
    borderColor: colors.coral,
    backgroundColor: colors.surface,
  },
  pricingNoteGroup: {
    gap: 5,
    marginTop: 4,
  },
  pricingNoteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
  },
  noteTextArea: {
    minHeight: 64,
    paddingTop: 8,
    paddingBottom: 8,
    textAlignVertical: 'top',
  },
  pricingSentNote: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '600',
    marginTop: 2,
  },
  pricingActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  outlineActionBtn: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    gap: 6,
  },
  outlineActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  solidActionBtn: {
    flex: 1.35,
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  solidActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scheduleDateText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.ink,
  },
  scheduleTimeText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.muted,
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  guestAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestAvatarText: {
    fontSize: 14,
    fontWeight: '800',
  },
  guestInfo: {
    flex: 1,
    gap: 3,
  },
  guestNameText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.ink,
  },
  contactList: {
    gap: 3,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactItemText: {
    fontSize: 12,
    color: colors.ink,
    fontWeight: '500',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
  },
  addressText: {
    fontSize: 12,
    color: colors.muted,
  },
  clientNoteBox: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F4F4F5',
    gap: 2,
    marginTop: 4,
  },
  clientNoteLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.5,
  },
  clientNoteText: {
    fontSize: 12,
    color: colors.ink,
    lineHeight: 16,
  },
  bookingIdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  bookingIdValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bookingIdBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F4F4F5',
  },
  bookingIdCode: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.ink,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  copyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F5',
  },
  reminderRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EFECE6',
    backgroundColor: '#FFFFFF',
  },
  reminderCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  reminderTexts: {
    flex: 1,
    gap: 1,
  },
  reminderTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
  },
  reminderSubtitle: {
    fontSize: 11,
    color: colors.muted,
  },
  reminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.coralSoft,
    backgroundColor: colors.coralSoft,
  },
  reminderBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.coral,
  },
  reminderSentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: '#ECFDF5',
  },
  reminderSentBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  attachmentGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  attachmentItem: {
    flex: 1,
    gap: 5,
  },
  attachmentLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.ink,
  },
  attachmentEmpty: {
    height: 90,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF9F8',
  },
  attachmentEmptyText: {
    fontSize: 10.5,
    color: colors.muted,
  },
  bottomFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  solidApproveBtn: {
    flex: 1.6,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: colors.coral,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  solidApproveBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  outlineCancelBtn: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 10,
    backgroundColor: '#FFF5F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  outlineCancelBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.danger,
  },
  subModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  editModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    justifyContent: 'flex-end',
  },
  subModalBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 20,
  },
  subModalTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: colors.ink,
  },
  subModalDesc: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  cancelInputGroup: {
    gap: 6,
    marginTop: 4,
  },
  cancelInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  cancelTextInput: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: '#FFFFFF',
  },
  subModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  subModalCancelBtn: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subModalCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  subModalConfirmBtn: {
    flex: 1.25,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subModalConfirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  paymentModalBox: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    gap: 12,
  },
  paymentModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  paymentModalTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: colors.ink,
  },
  paymentModalSubtitle: {
    fontSize: 11.5,
    color: colors.muted,
  },
  paymentBreakdown: {
    gap: 10,
    paddingVertical: 10,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentRowLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.muted,
  },
  paymentRowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  addonItemRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addAddonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  addAddonBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.coral,
  },
  discountSection: {
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  discountToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleGroup: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 7,
    overflow: 'hidden',
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
  },
  toggleBtnActive: {
    backgroundColor: colors.navy,
  },
  toggleBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.ink,
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },
  paymentSummaryBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F8F7F5',
    gap: 5,
  },
  paymentSummaryLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  paymentSummaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.ink,
  },
  methodChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  methodChipSelected: {
    borderColor: colors.coral,
    backgroundColor: '#FFF7F6',
  },
  methodChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  methodChipTextSelected: {
    color: colors.coral,
    fontWeight: '700',
  },
  paymentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  balanceDueLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
  },
  balanceDueValue: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  recordPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.coral,
  },
  recordPayBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSheetContainer: {
    width: '100%',
    height: '92%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  editPage: {
    flex: 1,
  },
  editPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#F1EEEA',
  },
  editPageTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  editPageContent: {
    gap: 12,
    paddingTop: 16,
  },
  editChoiceRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1EEEA',
    paddingHorizontal: 10,
  },
  editChoiceRowSelected: {
    backgroundColor: colors.coralSoft,
    borderRadius: 10,
    borderBottomColor: 'transparent',
  },
  editChoiceCopy: {
    gap: 3,
  },
  editChoiceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    textTransform: 'capitalize',
  },
  editChoiceMeta: {
    fontSize: 11,
    color: colors.muted,
  },
  editChoiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  editBodyContent: {
    padding: 14,
    gap: 0,
  },
  editSectionRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1EEEA',
    paddingVertical: 10,
  },
  editSectionIcon: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSectionCopy: {
    flex: 1,
    gap: 2,
  },
  editSectionLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.5,
  },
  editSectionValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    textTransform: 'capitalize',
  },
  editSectionDetail: {
    fontSize: 10,
    color: colors.muted,
  },
  editExpandedGroup: {
    gap: 10,
    paddingVertical: 10,
  },
  editOptionRow: {
    gap: 8,
    paddingVertical: 10,
  },
  textInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: '#FFFFFF',
    fontFamily: 'SpaceGrotesk_400Regular',
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  serviceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    gap: 2,
  },
  serviceChipSelected: {
    borderColor: colors.coral,
    backgroundColor: '#FFF7F6',
  },
  serviceChipTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink,
  },
  serviceChipTitleSelected: {
    color: colors.coral,
  },
  serviceChipMeta: {
    fontSize: 10.5,
    color: colors.muted,
  },
  serviceChipMetaSelected: {
    color: colors.coral,
  },
  timeChipSmall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  timeChipSmallActive: {
    borderColor: colors.coral,
    backgroundColor: colors.coral,
  },
  timeChipSmallText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.ink,
  },
  timeChipSmallTextActive: {
    color: '#FFFFFF',
  },
  footerRowPadding: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  saveBtn: {
    flex: 1.4,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerToolbar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  viewerLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  viewerCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
});
