import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { Text } from '@/components/app-text';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { Card, EmptyState, IconButton, Screen, SearchField, StatusBadge } from '@/components/ui';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';
import type { Payment } from '@/types';

const money = (amount: number, currency = 'PHP') =>
  amount.toLocaleString('en-PH', { style: 'currency', currency, minimumFractionDigits: 0 });

const METHODS: Payment['method'][] = ['cash', 'e_wallet', 'bank_transfer', 'card', 'other'];
const TYPES: Payment['transaction_type'][] = ['payment', 'deposit', 'refund', 'adjustment'];
const STATUSES: Payment['status'][] = ['paid', 'pending', 'failed', 'refunded'];

export default function Payments() {
  const {
    payments,
    appointments,
    staff,
    businessName,
    addPayment,
    updatePaymentStatus,
    retryPayment,
    refreshing,
    refresh,
  } = useApp();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Payment['status']>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | Payment['method']>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Payment | null>(null);
  const [saving, setSaving] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Record payment draft
  const [appointmentId, setAppointmentId] = useState<string>('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [txType, setTxType] = useState<Payment['transaction_type']>('payment');
  const [method, setMethod] = useState<Payment['method']>('cash');
  const [txStatus, setTxStatus] = useState<Payment['status']>('paid');
  const [note, setNote] = useState('');

  const failedPayments = useMemo(
    () => payments.filter((p) => p.status === 'failed').slice(0, 5),
    [payments]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments.filter((payment) => {
      if (statusFilter !== 'all' && payment.status !== statusFilter) return false;
      if (methodFilter !== 'all' && payment.method !== methodFilter) return false;
      if (!q) return true;
      return [
        payment.client_name,
        payment.client_email || '',
        payment.method,
        payment.transaction_type,
        payment.note || '',
      ].some((val) => val.toLowerCase().includes(q));
    });
  }, [payments, query, statusFilter, methodFilter]);

  const paidTotal = useMemo(
    () =>
      payments
        .filter((item) => item.status === 'paid' && item.transaction_type !== 'refund')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [payments]
  );

  const pendingTotal = useMemo(
    () =>
      payments
        .filter((item) => item.status === 'pending')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [payments]
  );

  const depositsCount = useMemo(
    () => payments.filter((item) => item.transaction_type === 'deposit').length,
    [payments]
  );

  const refundsCount = useMemo(
    () => payments.filter((item) => item.transaction_type === 'refund').length,
    [payments]
  );

  const selectLinkedAppointment = (id: string) => {
    setAppointmentId(id);
    const appt = appointments.find((a) => a.id === id);
    if (appt) {
      setClientName(appt.customer_name);
      setClientEmail(appt.customer_email || '');
      const rawPrice =
        appt.final_total_amount != null
          ? appt.final_total_amount
          : Number(String(appt.total_price || '0').replace(/[^0-9.-]+/g, '')) || 0;
      const suggested = appt.payment_balance != null && appt.payment_balance > 0 ? appt.payment_balance : rawPrice;
      if (suggested > 0) setAmount(String(suggested));
    }
  };

  const resetForm = () => {
    setAppointmentId('');
    setClientName('');
    setClientEmail('');
    setAmount('');
    setTxType('payment');
    setMethod('cash');
    setTxStatus('paid');
    setNote('');
  };

  const submitPayment = async () => {
    const numericAmount = Number(amount);
    if (!clientName.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert('Check payment', 'Add a client name and a valid amount.');
      return;
    }

    const executeSave = async () => {
      setSaving(true);
      const err = await addPayment({
        appointment_id: appointmentId || null,
        client_name: clientName.trim(),
        client_email: clientEmail.trim(),
        amount: numericAmount,
        transaction_type: txType,
        method,
        status: txStatus,
        note: note.trim(),
      });
      setSaving(false);
      if (err) {
        Alert.alert('Could not record payment', err);
        return;
      }
      resetForm();
      setFormOpen(false);
    };

    if (txType === 'refund') {
      Alert.alert(
        'Confirm refund',
        `Record a ${money(numericAmount)} refund for ${clientName.trim()}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Record refund', style: 'destructive', onPress: () => void executeSave() },
        ]
      );
      return;
    }

    await executeSave();
  };

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    const err = await retryPayment(id);
    setRetryingId(null);
    if (err) Alert.alert('Could not retry payment', err);
  };

  const shareReceipt = async (payment: Payment) => {
    const appt = appointments.find((a) => a.id === payment.appointment_id);
    const text = [
      `${businessName} — Payment Receipt`,
      `Date: ${new Date(payment.created_at).toLocaleString('en-PH')}`,
      `Customer: ${payment.client_name}`,
      payment.client_email ? `Email: ${payment.client_email}` : null,
      `Appointment: ${appt?.service_names || 'Unlinked payment'}`,
      `Type: ${payment.transaction_type} · ${payment.method.replace(/_/g, ' ')}`,
      `Status: ${payment.status.toUpperCase()}`,
      `Total: ${money(Number(payment.amount), payment.currency)}`,
      payment.note ? `Note: ${payment.note}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await Share.share({ title: 'Bookora Payment Receipt', message: text });
    } catch {
      // Share dismissed
    }
  };

  const exportLedgerCsv = async () => {
    const csvCell = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Client', 'Email', 'Appointment', 'Staff', 'Type', 'Method', 'Status', 'Amount', 'Currency', 'Date', 'Note'],
      ...visible.map((p) => {
        const appt = appointments.find((a) => a.id === p.appointment_id);
        const member = staff.find((s) => s.id === appt?.staff_member_id);
        return [
          p.client_name,
          p.client_email || '',
          appt?.service_names || 'Unlinked',
          member?.full_name || 'Unassigned',
          p.transaction_type,
          p.method,
          p.status,
          p.amount,
          p.currency,
          p.created_at,
          p.note || '',
        ];
      }),
    ];
    try {
      await Share.share({
        title: 'bookora-payments.csv',
        message: rows.map((r) => r.map(csvCell).join(',')).join('\n'),
      });
    } catch {
      // Share dismissed
    }
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
            accessibilityLabel="Record payment"
            onPress={() => setFormOpen(true)}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          >
            <Ionicons name="add" size={25} color="#FFFFFF" />
          </Pressable>
        }
      >
        <View style={styles.headerLine}>
          <Text style={styles.title}>Payments</Text>
          <View style={styles.headerActions}>
            {payments.length > 0 ? (
              <IconButton name="download-outline" label="Export payments CSV" onPress={() => void exportLedgerCsv()} />
            ) : null}
          </View>
        </View>

        {/* Failed Payments Retry Banner */}
        {failedPayments.length > 0 ? (
          <Card style={styles.retryCard}>
            <View style={styles.retryHeader}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.retryTitle}>
                Needs attention · {failedPayments.length} failed payment{failedPayments.length === 1 ? '' : 's'}
              </Text>
            </View>
            {failedPayments.map((fp) => (
              <View key={fp.id} style={styles.retryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.retryClient}>{fp.client_name || 'Unknown customer'}</Text>
                  <Text style={styles.retryMeta}>
                    {money(Number(fp.amount), fp.currency)}
                    {fp.failure_reason ? ` · ${fp.failure_reason}` : ''}
                  </Text>
                </View>
                <Pressable
                  disabled={retryingId === fp.id}
                  onPress={() => void handleRetry(fp.id)}
                  style={styles.retryBtn}
                >
                  <Text style={styles.retryBtnText}>{retryingId === fp.id ? 'Retrying…' : 'Retry'}</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Summary Strip */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={[styles.summaryValue, { color: colors.success }]} numberOfLines={1}>
              {money(paidTotal)}
            </Text>
            <Text style={styles.summaryLabel}>Paid</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={[styles.summaryValue, { color: colors.warning }]} numberOfLines={1}>
              {money(pendingTotal)}
            </Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>{depositsCount}</Text>
            <Text style={styles.summaryLabel}>Deposits</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={[styles.summaryValue, { color: colors.danger }]}>{refundsCount}</Text>
            <Text style={styles.summaryLabel}>Refunds</Text>
          </View>
        </View>

        <SearchField value={query} onChangeText={setQuery} placeholder="Search clients, methods, or notes" />

        {/* Status Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['all', ...STATUSES] as const).map((st) => (
            <Pressable
              key={st}
              onPress={() => setStatusFilter(st)}
              style={[styles.filterPill, statusFilter === st && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, statusFilter === st && styles.filterPillTextActive]}>
                {st === 'all' ? 'All statuses' : st}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Method Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['all', ...METHODS] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMethodFilter(m)}
              style={[styles.filterPill, methodFilter === m && styles.filterPillActiveNavy]}
            >
              <Text style={[styles.filterPillText, methodFilter === m && styles.filterPillTextActive]}>
                {m === 'all' ? 'All methods' : m.replace(/_/g, ' ')}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Payment List */}
        <View style={styles.list}>
          {visible.map((payment) => {
            const appt = appointments.find((a) => a.id === payment.appointment_id);
            const initials =
              payment.client_name
                .trim()
                .split(/\s+/)
                .map((p) => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase() || '?';
            const isRefund = payment.transaction_type === 'refund';
            return (
              <Pressable
                key={payment.id}
                onPress={() => setSelectedReceipt(payment)}
                style={({ pressed }) => [styles.paymentCard, pressed && styles.pressed]}
              >
                <View style={styles.paymentTop}>
                  <View style={styles.identity}>
                    <View style={[styles.avatar, isRefund && { backgroundColor: colors.coralSoft }]}>
                      <Text style={[styles.avatarText, isRefund && { color: colors.danger }]}>{initials}</Text>
                    </View>
                    <View style={styles.copy}>
                      <Text numberOfLines={1} style={styles.name}>
                        {payment.client_name}
                      </Text>
                      <Text numberOfLines={1} style={styles.meta}>
                        {appt?.service_names || 'Unlinked payment'} ·{' '}
                        {new Date(payment.created_at).toLocaleDateString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.amount, isRefund && { color: colors.danger }]}>
                    {isRefund ? '-' : ''}
                    {money(Number(payment.amount), payment.currency)}
                  </Text>
                </View>

                <View style={styles.paymentBottom}>
                  <View style={styles.bottomLeft}>
                    <StatusBadge status={payment.status} />
                    <Text style={styles.typeBadge}>
                      {payment.transaction_type} · {payment.method.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <View style={styles.receiptAction}>
                    <Ionicons name="receipt-outline" size={14} color={colors.coral} />
                    <Text style={styles.receiptActionText}>Receipt</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {!visible.length ? (
          <EmptyState
            icon="wallet-outline"
            title="No payments found"
            message="Record your first payment or adjust the active filters."
            actionLabel="Record payment"
            onAction={() => setFormOpen(true)}
          />
        ) : null}
      </Screen>

      {/* Receipt & Transaction Detail Modal */}
      <Modal
        visible={Boolean(selectedReceipt)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedReceipt(null)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable style={styles.backdropDismiss} onPress={() => setSelectedReceipt(null)} />
          <View nativeID="bookora-sheet" style={styles.sheetContainer}>
            <View style={styles.headerNav}>
              <Pressable
                accessibilityLabel="Back"
                onPress={() => setSelectedReceipt(null)}
                style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>
              <Text style={styles.headerTitleText}>Payment receipt</Text>
              <Pressable
                accessibilityLabel="Close receipt"
                onPress={() => setSelectedReceipt(null)}
                style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            {selectedReceipt ? (
              <ScrollView contentContainerStyle={styles.sheetBodyContent} showsVerticalScrollIndicator={false}>
                <View style={styles.receiptHero}>
                  <Text style={styles.receiptAmountText}>
                    {money(Number(selectedReceipt.amount), selectedReceipt.currency)}
                  </Text>
                  <StatusBadge status={selectedReceipt.status} />
                </View>

                <Card style={styles.receiptSheet}>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Customer</Text>
                    <Text style={styles.receiptValue}>{selectedReceipt.client_name}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Email</Text>
                    <Text style={[styles.receiptValue, { textTransform: 'none' }]}>
                      {selectedReceipt.client_email || '—'}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Appointment</Text>
                    <Text style={styles.receiptValue}>
                      {appointments.find((a) => a.id === selectedReceipt.appointment_id)?.service_names ||
                        'Unlinked payment'}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Transaction</Text>
                    <Text style={styles.receiptValue}>
                      {selectedReceipt.transaction_type} · {selectedReceipt.method.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Date</Text>
                    <Text style={styles.receiptValue}>
                      {new Date(selectedReceipt.created_at).toLocaleString('en-PH', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </Text>
                  </View>
                  {selectedReceipt.note ? (
                    <View style={[styles.receiptRow, { borderBottomWidth: 0 }]}>
                      <Text style={styles.receiptLabel}>Note</Text>
                      <Text style={[styles.receiptValue, { textTransform: 'none' }]}>{selectedReceipt.note}</Text>
                    </View>
                  ) : null}
                </Card>

                <View style={styles.receiptActions}>
                  <Pressable
                    onPress={() => void shareReceipt(selectedReceipt)}
                    style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.saveBtnText}>Share / Print receipt</Text>
                  </Pressable>

                  {selectedReceipt.status === 'pending' ? (
                    <Pressable
                      onPress={async () => {
                        const err = await updatePaymentStatus(selectedReceipt.id, 'paid');
                        if (err) Alert.alert('Could not update payment', err);
                        else setSelectedReceipt({ ...selectedReceipt, status: 'paid' });
                      }}
                      style={({ pressed }) => [styles.secondaryActionBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.secondaryActionBtnText}>Mark as Paid</Text>
                    </Pressable>
                  ) : null}

                  {selectedReceipt.status === 'paid' && selectedReceipt.transaction_type !== 'refund' ? (
                    <Pressable
                      onPress={() => {
                        const target = selectedReceipt;
                        setSelectedReceipt(null);
                        setAppointmentId(target.appointment_id || '');
                        setClientName(target.client_name);
                        setClientEmail(target.client_email || '');
                        setAmount(String(target.amount));
                        setTxType('refund');
                        setMethod(target.method);
                        setTxStatus('paid');
                        setNote(`Refund for transaction on ${new Date(target.created_at).toLocaleDateString('en-PH')}`);
                        setFormOpen(true);
                      }}
                      style={({ pressed }) => [styles.dangerActionBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.dangerActionBtnText}>Record refund</Text>
                    </Pressable>
                  ) : null}
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        visible={formOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFormOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetBackdrop}
        >
          <Pressable style={styles.backdropDismiss} onPress={() => setFormOpen(false)} />
          <View nativeID="bookora-sheet" style={styles.sheetContainer}>
            <View style={styles.headerNav}>
              <Pressable
                accessibilityLabel="Back"
                onPress={() => setFormOpen(false)}
                style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>
              <Text style={styles.headerTitleText}>Record payment</Text>
              <Pressable
                accessibilityLabel="Close payment form"
                onPress={() => setFormOpen(false)}
                style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <KeyboardAwareScrollView
              style={{ flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={styles.sheetBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Linked Appointment Picker */}
              {appointments.length > 0 ? (
                <View style={styles.pickerSection}>
                  <Text style={styles.fieldLabel}>Linked appointment</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chips}
                  >
                    <Pressable
                      onPress={() => setAppointmentId('')}
                      style={[styles.slotBox, !appointmentId && styles.slotBoxSelected]}
                    >
                      <Text style={[styles.slotBoxText, !appointmentId && styles.slotBoxTextSelected]}>
                        Unlinked payment
                      </Text>
                    </Pressable>
                    {appointments.slice(0, 12).map((appt) => {
                      const isSelected = appointmentId === appt.id;
                      return (
                        <Pressable
                          key={appt.id}
                          onPress={() => selectLinkedAppointment(appt.id)}
                          style={[styles.slotBox, isSelected && styles.slotBoxSelected]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[styles.slotBoxText, isSelected && styles.slotBoxTextSelected]}
                          >
                            {appt.customer_name} · {appt.service_names}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.form}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Client name *</Text>
                  <TextInput
                    value={clientName}
                    onChangeText={setClientName}
                    onFocus={() => setFocusedField('clientName')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="e.g. Camille Santos"
                    placeholderTextColor={colors.muted}
                    style={[styles.textInput, focusedField === 'clientName' && styles.inputFocused]}
                  />
                </View>

                <View style={styles.twoColumnRow}>
                  <View style={[styles.fieldGroup, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Amount (PHP) *</Text>
                    <TextInput
                      value={amount}
                      onChangeText={setAmount}
                      onFocus={() => setFocusedField('amount')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      style={[styles.textInput, focusedField === 'amount' && styles.inputFocused]}
                    />
                  </View>

                  <View style={[styles.fieldGroup, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Client email</Text>
                    <TextInput
                      value={clientEmail}
                      onChangeText={setClientEmail}
                      onFocus={() => setFocusedField('clientEmail')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="client@example.com"
                      placeholderTextColor={colors.muted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={[styles.textInput, focusedField === 'clientEmail' && styles.inputFocused]}
                    />
                  </View>
                </View>

                <View style={styles.pickerSection}>
                  <Text style={styles.fieldLabel}>Transaction type</Text>
                  <View style={styles.gridWrap}>
                    {TYPES.map((item) => {
                      const isSelected = txType === item;
                      return (
                        <Pressable
                          key={item}
                          onPress={() => setTxType(item)}
                          style={[styles.gridSlotBox, isSelected && styles.slotBoxSelected]}
                        >
                          <Text style={[styles.slotBoxText, isSelected && styles.slotBoxTextSelected]}>
                            {item}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.pickerSection}>
                  <Text style={styles.fieldLabel}>Payment method</Text>
                  <View style={styles.gridWrap}>
                    {METHODS.map((item) => {
                      const isSelected = method === item;
                      return (
                        <Pressable
                          key={item}
                          onPress={() => setMethod(item)}
                          style={[styles.gridSlotBox, isSelected && styles.slotBoxSelected]}
                        >
                          <Text style={[styles.slotBoxText, isSelected && styles.slotBoxTextSelected]}>
                            {item.replace(/_/g, ' ')}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.pickerSection}>
                  <Text style={styles.fieldLabel}>Status</Text>
                  <View style={styles.gridWrap}>
                    {(['paid', 'pending', 'failed'] as const).map((item) => {
                      const isSelected = txStatus === item;
                      return (
                        <Pressable
                          key={item}
                          onPress={() => setTxStatus(item)}
                          style={[styles.gridSlotBoxThird, isSelected && styles.slotBoxSelected]}
                        >
                          <Text style={[styles.slotBoxText, isSelected && styles.slotBoxTextSelected]}>
                            {item}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Note</Text>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    onFocus={() => setFocusedField('note')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Reference number or internal note"
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={3}
                    style={[
                      styles.textInput,
                      styles.noteTextArea,
                      focusedField === 'note' && styles.inputFocused,
                    ]}
                  />
                </View>
              </View>
            </KeyboardAwareScrollView>

            <View style={styles.footerRowPadding}>
              <Pressable
                disabled={saving}
                onPress={() => void submitPayment()}
                style={({ pressed }) => [
                  styles.saveBtn,
                  pressed && styles.pressed,
                  saving && styles.btnDisabled,
                ]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save payment</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.ink,
  },
  summaryLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.muted,
  },
  retryCard: { backgroundColor: colors.coralSoft, borderColor: '#F5C4BE', gap: space.sm },
  retryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  retryTitle: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F5C4BE',
  },
  retryClient: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  retryMeta: { color: colors.danger, fontSize: 12 },
  retryBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  retryBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  filterRow: { gap: space.sm, paddingVertical: 2 },
  filterPill: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterPillActive: { backgroundColor: colors.coral, borderColor: colors.coral },
  filterPillActiveNavy: { backgroundColor: colors.navy, borderColor: colors.navy },
  filterPillText: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  filterPillTextActive: { color: '#fff' },
  list: { gap: space.md },
  paymentCard: {
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.78 },
  paymentTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.lilac,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.navy, fontSize: 13, fontWeight: '800' },
  copy: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  amount: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  paymentBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: space.sm,
  },
  bottomLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  typeBadge: { color: colors.muted, fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  receiptAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  receiptActionText: { color: colors.coral, fontSize: 12, fontWeight: '700' },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    flex: 1,
  },
  sheetContainer: {
    width: '100%',
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
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
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  sheetBodyContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  receiptHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  receiptAmountText: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  receiptSheet: { paddingVertical: 8 },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  receiptLabel: { color: colors.muted, fontSize: 12.5, fontWeight: '600' },
  receiptValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
    textTransform: 'capitalize',
  },
  receiptActions: { gap: 10, marginTop: 4 },
  form: { gap: 12 },
  fieldGroup: { gap: 6 },
  twoColumnRow: { flexDirection: 'row', gap: 10 },
  pickerSection: { gap: 8 },
  fieldLabel: { color: colors.ink, fontSize: 11.5, fontWeight: '700' },
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
  inputFocused: {
    borderColor: colors.coral,
    backgroundColor: colors.surface,
  },
  noteTextArea: {
    minHeight: 64,
    paddingTop: 8,
    paddingBottom: 8,
    textAlignVertical: 'top',
  },
  chips: { gap: 8 },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotBox: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  gridSlotBox: {
    width: '48.5%',
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  gridSlotBoxThird: {
    width: '31%',
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  slotBoxSelected: {
    borderWidth: 1.5,
    borderColor: colors.coral,
    backgroundColor: '#FFF7F6',
  },
  slotBoxText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  slotBoxTextSelected: {
    color: colors.coral,
    fontWeight: '700',
  },
  footerRowPadding: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  saveBtn: {
    flex: 1,
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
  secondaryActionBtn: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  dangerActionBtn: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
