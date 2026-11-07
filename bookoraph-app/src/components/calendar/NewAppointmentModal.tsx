import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
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
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import {
  buildTimeSlots,
  getDateBookingError,
  validateAppointmentSchedule,
} from '@/lib/appointment-scheduling';
import { useApp } from '@/providers/app-provider';
import { colors } from '@/theme';
import type { Appointment, AppointmentStatus, Client, Service } from '@/types';
import {
  AVATAR_COLORS,
  formatMinutesToTime,
  getInitials,
  parseDateKey,
  parseTimeToMinutes,
  toDateKey,
} from './types';

interface NewAppointmentModalProps {
  visible: boolean;
  defaultDate?: string;
  defaultTime?: string;
  services: Service[];
  existingAppointments: Appointment[];
  staffName?: string;
  onClose: () => void;
  onCreate: (payload: {
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    customer_note: string;
    service_names: string;
    total_price: string;
    appointment_date: string;
    appointment_time: string;
    duration_minutes: number;
    buffer_minutes?: number;
    staff_member_id?: string | null;
    status?: AppointmentStatus;
  }) => Promise<boolean>;
}

type WizardStep = 'service' | 'datetime' | 'guest' | 'status' | 'summary';

const STATUS_OPTIONS: {
  value: AppointmentStatus;
  label: string;
  description: string;
  icon: 'time-outline' | 'checkmark-circle-outline' | 'checkmark-done-circle-outline' | 'close-circle-outline' | 'alert-circle-outline';
  color: string;
  bg: string;
  border: string;
}[] = [
  {
    value: 'pending',
    label: 'Pending',
    description: 'Awaiting confirmation',
    icon: 'time-outline',
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
  },
  {
    value: 'approved',
    label: 'Approved',
    description: 'Confirmed on schedule',
    icon: 'checkmark-circle-outline',
    color: '#059669',
    bg: '#ECFDF5',
    border: '#A7F3D0',
  },
  {
    value: 'completed',
    label: 'Completed',
    description: 'Service finished',
    icon: 'checkmark-done-circle-outline',
    color: '#0CA678',
    bg: '#E6FCF5',
    border: '#96F2D7',
  },
  {
    value: 'cancelled',
    label: 'Cancelled',
    description: 'Cancelled by client or staff',
    icon: 'close-circle-outline',
    color: '#64748B',
    bg: '#F1F5F9',
    border: '#CBD5E1',
  },
  {
    value: 'no_show',
    label: 'No-show',
    description: 'Client did not attend',
    icon: 'alert-circle-outline',
    color: '#DC2626',
    bg: '#FEF2F2',
    border: '#FECACA',
  },
];

const SCREEN_WIDTH = Dimensions.get('window').width;

export function NewAppointmentModal({
  visible,
  defaultDate,
  defaultTime,
  services,
  existingAppointments,
  staffName = 'Owner',
  onClose,
  onCreate,
}: NewAppointmentModalProps) {
  const { clients, businessProfile, blockEvents } = useApp();

  const initialDate = defaultDate || toDateKey(new Date());
  const initialTime = defaultTime
    ? formatMinutesToTime(parseTimeToMinutes(defaultTime))
    : '10:00 AM';

  const [step, setStep] = useState<WizardStep>('service');
  const [editingFromSummary, setEditingFromSummary] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [showNewGuestForm, setShowNewGuestForm] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [additionalServices, setAdditionalServices] = useState<string[]>([]);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState('');
  const [durationInput, setDurationInput] = useState('60');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState<AppointmentStatus>('approved');
  const [customerNote, setCustomerNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [visibleMonth, setVisibleMonth] = useState(() => parseDateKey(initialDate));

  const [sheetTranslateY] = useState(() => new Animated.Value(420));
  const [stepTranslateX] = useState(() => new Animated.Value(0));
  const [stepOpacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (visible) {
      sheetTranslateY.setValue(420);
      stepTranslateX.setValue(0);
      stepOpacity.setValue(1);
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [sheetTranslateY, stepOpacity, stepTranslateX, visible]);

  const transitionToStep = useCallback(
    (nextStep: WizardStep, direction: 'next' | 'back') => {
      const offset = Math.min(SCREEN_WIDTH * 0.28, 110);
      setStep(nextStep);
      stepTranslateX.setValue(direction === 'next' ? offset : -offset);
      stepOpacity.setValue(0.35);
      Animated.parallel([
        Animated.timing(stepTranslateX, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(stepOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [stepOpacity, stepTranslateX]
  );

  const activeServices = services.filter((service, index, arr) => {
    const norm = service.name.trim().toLowerCase();
    return arr.findIndex((item) => item.name.trim().toLowerCase() === norm) === index;
  });
  const primaryServiceObj =
    activeServices.find(
      (s) =>
        (selectedServiceId && s.id === selectedServiceId) ||
        s.name.trim().toLowerCase() === selectedService.trim().toLowerCase()
    ) ?? activeServices[0];
  const normalizedPrimaryName = (
    selectedService ||
    primaryServiceObj?.name ||
    ''
  )
    .trim()
    .toLowerCase();
  const additionalServiceOptions = activeServices.filter((s) => {
    if (selectedServiceId && s.id === selectedServiceId) return false;
    if (primaryServiceObj?.id && s.id === primaryServiceObj.id) return false;
    return s.name.trim().toLowerCase() !== normalizedPrimaryName;
  });
  const filteredServices = activeServices.filter((service) =>
    service.name.toLowerCase().includes(serviceSearch.trim().toLowerCase())
  );

  const filteredClients = clients.filter((client) => {
    const q = guestSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      client.full_name.toLowerCase().includes(q) ||
      (client.phone || '').toLowerCase().includes(q) ||
      (client.email || '').toLowerCase().includes(q)
    );
  });

  const handleSelectPrimaryService = (service: Service) => {
    setSelectedService(service.name);
    setSelectedServiceId(service.id || '');
    const selectedNorm = service.name.trim().toLowerCase();
    setAdditionalServices((prev) =>
      prev.filter((name) => name.trim().toLowerCase() !== selectedNorm)
    );
    const clean = String(service.price ?? '0').replace(/[^0-9.-]/g, '');
    setPrice(clean ? `₱${clean}` : '₱0');
    setDurationInput(String(service.duration_minutes || 60));
    setVisibleMonth(parseDateKey(date));
    if (editingFromSummary) {
      setEditingFromSummary(false);
      transitionToStep('summary', 'back');
    } else {
      transitionToStep('datetime', 'next');
    }
  };

  const handleSelectExistingClient = (client: Client) => {
    setSelectedClientId(client.id);
    setCustomerName(client.full_name);
    setCustomerPhone(client.phone || '');
    setCustomerEmail(client.email || '');
    setShowNewGuestForm(false);
    const returning = editingFromSummary;
    setEditingFromSummary(false);
    transitionToStep('summary', returning ? 'back' : 'next');
  };

  const handleContinueNewGuest = () => {
    if (!customerName.trim()) {
      Alert.alert('Missing details', 'Please enter the client full name.');
      return;
    }
    setSelectedClientId('new');
    const returning = editingFromSummary;
    setEditingFromSummary(false);
    transitionToStep('summary', returning ? 'back' : 'next');
  };

  const toggleAdditionalService = (serviceName: string) => {
    setAdditionalServices((prev) => {
      const next = prev.includes(serviceName)
        ? prev.filter((s) => s !== serviceName)
        : [...prev, serviceName];
      const baseDur = primaryServiceObj?.duration_minutes || 60;
      const extraDur = activeServices
        .filter((s) => next.includes(s.name))
        .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
      setDurationInput(String(baseDur + extraDur));
      return next;
    });
  };

  const selectedAdditionalObjs = activeServices.filter((s) =>
    additionalServices.includes(s.name)
  );
  const combinedDuration =
    Number(durationInput) ||
    (primaryServiceObj?.duration_minutes || 60) +
      selectedAdditionalObjs.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const selectedServicesForSchedule = primaryServiceObj
    ? [primaryServiceObj, ...selectedAdditionalObjs]
    : selectedAdditionalObjs;
  const combinedBuffer = selectedServicesForSchedule.reduce(
    (sum, service) => sum + Math.max(0, Number(service.buffer_minutes) || 0),
    0
  );

  const calculateCombinedPrice = () => {
    const parseAmount = (val: string | number) =>
      Number(String(val).replace(/[^0-9.-]+/g, '')) || 0;
    const base = parseAmount(primaryServiceObj?.price ?? price);
    const extras = selectedAdditionalObjs.reduce(
      (sum, s) => sum + parseAmount(s.price),
      0
    );
    return base + extras;
  };

  const combinedPriceNumber = calculateCombinedPrice();
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const firstDay = (monthStart.getDay() + 6) % 7;
  const dayCount = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0
  ).getDate();
  const calendarDays = Array.from({ length: firstDay + dayCount }, (_, index) =>
    index < firstDay ? null : index - firstDay + 1
  );
  const resolvedTime = time || initialTime;
  const timeSlots = buildTimeSlots(date, businessProfile);
  const availableTimeSlots = timeSlots.filter(
    (slot) =>
      !validateAppointmentSchedule(
        {
          appointment_date: date,
          appointment_time: slot,
          duration_minutes: combinedDuration,
          buffer_minutes: combinedBuffer,
          service_names: selectedServicesForSchedule.map((service) => service.name).join(' + '),
        },
        {
          businessProfile,
          appointments: existingAppointments,
          blockEvents,
          services,
        }
      )
  );
  const displayPrice =
    selectedAdditionalObjs.length > 0 && combinedPriceNumber > 0
      ? `₱${combinedPriceNumber.toLocaleString('en-PH')}`
      : price || `₱${String(primaryServiceObj?.price ?? '0').replace(/[^0-9.-]/g, '')}`;

  const handleBack = () => {
    if (step === 'guest' && showNewGuestForm && clients.length > 0) {
      setShowNewGuestForm(false);
      return;
    }
    if (editingFromSummary && step !== 'summary') {
      setEditingFromSummary(false);
      transitionToStep('summary', 'back');
      return;
    }
    if (step === 'status') {
      transitionToStep('summary', 'back');
    } else if (step === 'summary') {
      transitionToStep('guest', 'back');
    } else if (step === 'guest') {
      transitionToStep('datetime', 'back');
    } else if (step === 'datetime') {
      transitionToStep('service', 'back');
    } else {
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!primaryServiceObj || !selectedService.trim()) {
      Alert.alert('Service required', 'Choose a service before saving this appointment.');
      transitionToStep('service', 'back');
      return;
    }
    if (!customerName.trim()) {
      Alert.alert('Missing details', 'Please select or enter a guest.');
      transitionToStep('guest', 'back');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Invalid date', 'Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    const serviceNames = [primaryServiceObj.name, ...selectedAdditionalObjs.map((service) => service.name)].join(' + ');
    const scheduleError = validateAppointmentSchedule(
      {
        appointment_date: date,
        appointment_time: resolvedTime,
        duration_minutes: combinedDuration,
        buffer_minutes: combinedBuffer,
        service_names: serviceNames,
      },
      {
        businessProfile,
        appointments: existingAppointments,
        blockEvents,
        services,
      }
    );
    if (scheduleError) {
      Alert.alert('Choose another time', scheduleError);
      transitionToStep('datetime', 'back');
      return;
    }

    setSaving(true);
    try {
      const ok = await onCreate({
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim() || 'walkin@client.local',
        customer_phone: customerPhone.trim() || 'Walk-in',
        customer_note: customerNote.trim(),
        service_names: serviceNames,
        total_price: displayPrice,
        appointment_date: date,
        appointment_time: resolvedTime,
        duration_minutes: combinedDuration,
        buffer_minutes: combinedBuffer,
        status,
      });
      if (ok) {
        setCustomerName('');
        setCustomerPhone('');
        setCustomerEmail('');
        setCustomerNote('');
        setAdditionalServices([]);
        setSelectedClientId('');
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  const headerTitle =
    step === 'service'
      ? 'Select service'
      : step === 'datetime'
        ? 'Date & time'
        : step === 'guest'
          ? 'Select guest'
          : step === 'status'
            ? 'Select label'
            : 'New appointment';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleBack}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.editModalBackdrop}
      >
        <Pressable style={styles.backdropDismiss} onPress={onClose} />

        <Animated.View
          style={[
            styles.editSheetContainer,
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          {/* Same Header Nav as Edit Appointment */}
          <View style={styles.headerNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={handleBack}
              disabled={saving}
              style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>
            <Text style={styles.headerTitleText}>{headerTitle}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              disabled={saving}
              style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <Animated.View
            style={[
              styles.stepViewport,
              {
                opacity: stepOpacity,
                transform: [{ translateX: stepTranslateX }],
              },
            ]}
          >
            {step === 'service' ? (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.editBodyContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <TextInput
                  value={serviceSearch}
                  onChangeText={setServiceSearch}
                  onFocus={() => setFocusedField('serviceSearch')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Search services"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  style={[
                    styles.textInput,
                    { marginBottom: 10 },
                    focusedField === 'serviceSearch' && styles.inputFocused,
                  ]}
                />
                <View style={styles.editPageContent}>
                  {activeServices.length === 0 ? (
                    <View style={styles.emptyServices}>
                      <View style={styles.emptyServicesIcon}>
                        <Ionicons name="cut-outline" size={22} color={colors.coral} />
                      </View>
                      <Text style={styles.emptyServicesTitle}>Add a service first</Text>
                      <Text style={styles.emptyServicesText}>
                        Appointments need a real service with a duration and price.
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          onClose();
                          setTimeout(() => router.push('/services'), 0);
                        }}
                        style={({ pressed }) => [styles.manageServicesButton, pressed && styles.pressed]}
                      >
                        <Text style={styles.manageServicesButtonText}>Go to services</Text>
                      </Pressable>
                    </View>
                  ) : filteredServices.length === 0 ? (
                    <View style={styles.noSearchResults}>
                      <Text style={styles.emptyServicesTitle}>No matching services</Text>
                      <Text style={styles.emptyServicesText}>Try a different service name.</Text>
                    </View>
                  ) : filteredServices.map((service) => {
                    const isSelected =
                      Boolean(selectedService) && service.name === selectedService;
                    const cleanPrice = String(service.price ?? '0').replace(/[^0-9.-]/g, '');
                    return (
                      <Pressable
                        key={service.id || service.name}
                        onPress={() => handleSelectPrimaryService(service)}
                        style={({ pressed }) => [
                          styles.editChoiceRow,
                          isSelected && styles.editChoiceRowSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.editChoiceCopy}>
                          <Text style={styles.editChoiceTitle}>{service.name}</Text>
                          <Text style={styles.editChoiceMeta}>
                            {service.duration_minutes} mins · ₱{cleanPrice || '0'}
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={isSelected ? colors.coral : colors.muted}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            ) : step === 'datetime' ? (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.editBodyContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.calendarToolbar}>
                  <Pressable
                    onPress={() =>
                      setVisibleMonth(
                        (month) => new Date(month.getFullYear(), month.getMonth() - 1, 1)
                      )
                    }
                    style={styles.calendarArrow}
                  >
                    <Ionicons name="chevron-back" size={18} color={colors.ink} />
                  </Pressable>
                  <Text style={styles.calendarMonth}>
                    {visibleMonth.toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setVisibleMonth(
                        (month) => new Date(month.getFullYear(), month.getMonth() + 1, 1)
                      )
                    }
                    style={styles.calendarArrow}
                  >
                    <Ionicons name="chevron-forward" size={18} color={colors.ink} />
                  </Pressable>
                </View>

                <View style={styles.calendarWeekdays}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                    <Text key={day} style={styles.calendarWeekday}>
                      {day}
                    </Text>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {calendarDays.map((day, index) => {
                    if (!day) {
                      return <View key={`empty-${index}`} style={styles.calendarCell} />;
                    }
                    const dayKey = toDateKey(
                      new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)
                    );
                    const disabled = Boolean(getDateBookingError(dayKey, businessProfile));
                    const isSelected = date === dayKey;
                    return (
                      <Pressable
                        key={dayKey}
                        disabled={disabled}
                        onPress={() => setDate(dayKey)}
                        style={[
                          styles.calendarCell,
                          isSelected && styles.calendarCellSelected,
                          disabled && styles.calendarCellDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.calendarDay,
                            isSelected && styles.calendarDaySelected,
                            disabled && styles.calendarDayDisabled,
                          ]}
                        >
                          {day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.timeSectionWrap}>
                  <Text style={styles.fieldLabel}>Start time</Text>
                  <View style={styles.editChoiceGrid}>
                    {availableTimeSlots.map((slot) => {
                      const isSelected = Boolean(time) && slot === time;
                      return (
                        <Pressable
                          key={slot}
                          onPress={() => {
                            setTime(slot);
                            if (editingFromSummary) {
                              setEditingFromSummary(false);
                              transitionToStep('summary', 'back');
                            } else {
                              transitionToStep('guest', 'next');
                            }
                          }}
                          style={({ pressed }) => [
                            styles.timeSlotBox,
                            isSelected && styles.timeSlotBoxSelected,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.timeSlotBoxText,
                              isSelected && styles.timeSlotBoxTextSelected,
                            ]}
                          >
                            {slot}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {availableTimeSlots.length === 0 ? (
                      <View style={styles.noTimesAvailable}>
                        <Ionicons name="time-outline" size={19} color={colors.muted} />
                        <Text style={styles.emptyServicesText}>
                          {getDateBookingError(date, businessProfile) ||
                            'No open times remain on this date. Try another day.'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </ScrollView>
            ) : step === 'guest' ? (
              /* Step 3: Select Guest */
              <View style={{ flex: 1 }}>
                <KeyboardAwareScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.editBodyContent}
                  showsVerticalScrollIndicator={false}
                >
                  {!showNewGuestForm && clients.length > 0 ? (
                    <>
                      <TextInput
                        value={guestSearch}
                        onChangeText={setGuestSearch}
                        onFocus={() => setFocusedField('guestSearch')}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Search clients"
                        placeholderTextColor={colors.muted}
                        autoCapitalize="none"
                        style={[
                          styles.textInput,
                          { marginBottom: 10 },
                          focusedField === 'guestSearch' && styles.inputFocused,
                        ]}
                      />

                      <Pressable
                        onPress={() => {
                          setSelectedClientId('new');
                          setShowNewGuestForm(true);
                        }}
                        style={({ pressed }) => [
                          styles.editChoiceRow,
                          selectedClientId === 'new' && styles.editChoiceRowSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.editChoiceCopy}>
                          <Text style={[styles.editChoiceTitle, { color: colors.coral }]}>
                            + Add new guest
                          </Text>
                          <Text style={styles.editChoiceMeta}>
                            Enter name, phone, and email manually
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.coral} />
                      </Pressable>

                      <View style={styles.editPageContent}>
                        {filteredClients.map((client) => {
                          const isSelected =
                            Boolean(selectedClientId) && selectedClientId === client.id;
                          const metaParts = [client.phone, client.email].filter(Boolean);
                          return (
                            <Pressable
                              key={client.id}
                              onPress={() => handleSelectExistingClient(client)}
                              style={({ pressed }) => [
                                styles.editChoiceRow,
                                isSelected && styles.editChoiceRowSelected,
                                pressed && styles.pressed,
                              ]}
                            >
                              <View style={styles.editChoiceCopy}>
                                <Text style={styles.editChoiceTitle}>{client.full_name}</Text>
                                <Text style={styles.editChoiceMeta}>
                                  {metaParts.length > 0
                                    ? metaParts.join(' · ')
                                    : 'Walk-in client'}
                                </Text>
                              </View>
                              <Ionicons
                                name="chevron-forward"
                                size={18}
                                color={isSelected ? colors.coral : colors.muted}
                              />
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : (
                    <View style={styles.newFieldsGroup}>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Client name *</Text>
                        <TextInput
                          onFocus={() => setFocusedField('guestName')}
                          onBlur={() => setFocusedField(null)}
                          value={customerName}
                          onChangeText={setCustomerName}
                          placeholder="e.g. Camille Santos"
                          placeholderTextColor={colors.muted}
                          autoCapitalize="words"
                          style={[
                            styles.textInput,
                            focusedField === 'guestName' && styles.inputFocused,
                          ]}
                        />
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Phone</Text>
                        <TextInput
                          onFocus={() => setFocusedField('guestPhone')}
                          onBlur={() => setFocusedField(null)}
                          value={customerPhone}
                          onChangeText={setCustomerPhone}
                          placeholder="+63 917 123 4567"
                          placeholderTextColor={colors.muted}
                          keyboardType="phone-pad"
                          style={[
                            styles.textInput,
                            focusedField === 'guestPhone' && styles.inputFocused,
                          ]}
                        />
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Email</Text>
                        <TextInput
                          onFocus={() => setFocusedField('guestEmail')}
                          onBlur={() => setFocusedField(null)}
                          value={customerEmail}
                          onChangeText={setCustomerEmail}
                          placeholder="client@example.com"
                          placeholderTextColor={colors.muted}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          style={[
                            styles.textInput,
                            focusedField === 'guestEmail' && styles.inputFocused,
                          ]}
                        />
                      </View>
                    </View>
                  )}
                </KeyboardAwareScrollView>

                {(showNewGuestForm || clients.length === 0) && (
                  <View style={styles.footerRowPadding}>
                    <Pressable
                      onPress={handleContinueNewGuest}
                      style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.saveBtnText}>Continue</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : step === 'status' ? (
              /* Select Label / Status Modal Step */
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.editBodyContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.editPageContent}>
                  {STATUS_OPTIONS.map((option) => {
                    const isSelected = status === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => {
                          setStatus(option.value);
                          setEditingFromSummary(false);
                          transitionToStep('summary', 'back');
                        }}
                        style={({ pressed }) => [
                          styles.editChoiceRow,
                          isSelected && styles.editChoiceRowSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.statusOptionLeft}>
                          <View
                            style={[
                              styles.statusOptionIconBadge,
                              {
                                backgroundColor: option.bg,
                                borderColor: option.border,
                              },
                            ]}
                          >
                            <Ionicons name={option.icon} size={17} color={option.color} />
                          </View>
                          <View style={styles.editChoiceCopy}>
                            <Text style={[styles.editChoiceTitle, { color: option.color }]}>
                              {option.label}
                            </Text>
                            <Text style={styles.editChoiceMeta}>{option.description}</Text>
                          </View>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={isSelected ? colors.coral : colors.muted}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              /* Step 4: Exact Edit Appointment UI */
              <View style={{ flex: 1 }}>
                <KeyboardAwareScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.editBodyContent}
                  showsVerticalScrollIndicator={false}
                >
                  {/* SERVICE Row */}
                  <EditSectionRow
                    icon="cut-outline"
                    label="SERVICE"
                    value={`${primaryServiceObj?.name || 'Select service'}  ·  ${combinedDuration} mins`}
                    detail={
                      selectedAdditionalObjs.length > 0
                        ? `+ ${selectedAdditionalObjs.map((s) => s.name).join(', ')}`
                        : undefined
                    }
                    onPress={() => {
                      setEditingFromSummary(true);
                      transitionToStep('service', 'next');
                    }}
                  />

                  {/* DATE & TIME Row */}
                  <EditSectionRow
                    icon="time-outline"
                    label="DATE & TIME"
                    value={`${date || 'Choose date'}  ·  ${resolvedTime || 'Choose time'}`}
                    onPress={() => {
                      setEditingFromSummary(true);
                      setVisibleMonth(parseDateKey(date));
                      transitionToStep('datetime', 'next');
                    }}
                  />

                  {/* GUEST Row */}
                  <EditSectionRow
                    icon="person-outline"
                    label="GUEST"
                    value={customerName || 'Add guest'}
                    detail={customerEmail || customerPhone || 'No email provided'}
                    onPress={() => {
                      setEditingFromSummary(true);
                      transitionToStep('guest', 'next');
                    }}
                  />

                  {/* LABEL / STATUS Row */}
                  <EditSectionRow
                    icon="pricetag-outline"
                    label="LABEL / STATUS"
                    value={status === 'no_show' ? 'No-show' : status.replace('_', ' ')}
                    onPress={() => {
                      setEditingFromSummary(true);
                      transitionToStep('status', 'next');
                    }}
                  />

                  <View style={styles.newFieldsGroup}>
                    {additionalServiceOptions.length > 0 ? (
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Additional services</Text>
                        <View style={styles.additionalServicesGrid}>
                          {additionalServiceOptions.map((service) => {
                            const isSelected = additionalServices.includes(service.name);
                            return (
                              <Pressable
                                key={service.id || service.name}
                                onPress={() => toggleAdditionalService(service.name)}
                                style={({ pressed }) => [
                                  styles.serviceGridBox,
                                  isSelected && styles.serviceGridBoxSelected,
                                  pressed && styles.pressed,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.serviceChipTitle,
                                    isSelected && styles.serviceChipTitleSelected,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {service.name}
                                </Text>
                                <Text
                                  style={[
                                    styles.serviceChipMeta,
                                    isSelected && styles.serviceChipMetaSelected,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {service.duration_minutes} mins · ₱
                                  {String(service.price).replace(/[^0-9.-]/g, '')}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}

                    <View style={styles.twoColumnRow}>
                      <View style={[styles.fieldGroup, { flex: 1 }]}>
                        <Text style={styles.fieldLabel}>Duration (mins)</Text>
                        <TextInput
                          onFocus={() => setFocusedField('newDuration')}
                          onBlur={() => setFocusedField(null)}
                          value={String(combinedDuration)}
                          onChangeText={setDurationInput}
                          keyboardType="number-pad"
                          style={[
                            styles.textInput,
                            focusedField === 'newDuration' && styles.inputFocused,
                          ]}
                        />
                      </View>
                      <View style={[styles.fieldGroup, { flex: 1 }]}>
                        <Text style={styles.fieldLabel}>Price</Text>
                        <TextInput
                          onFocus={() => setFocusedField('newPrice')}
                          onBlur={() => setFocusedField(null)}
                          value={displayPrice}
                          onChangeText={setPrice}
                          placeholder="₱650"
                          placeholderTextColor={colors.muted}
                          style={[
                            styles.textInput,
                            focusedField === 'newPrice' && styles.inputFocused,
                          ]}
                        />
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Assigned staff</Text>
                      <View style={styles.staffRow}>
                        <View style={styles.staffLeft}>
                          <View
                            style={[
                              styles.staffAvatar,
                              {
                                backgroundColor: AVATAR_COLORS.coral.bg,
                                borderColor: AVATAR_COLORS.coral.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.staffAvatarText,
                                { color: AVATAR_COLORS.coral.text },
                              ]}
                            >
                              {getInitials(staffName)}
                            </Text>
                          </View>
                          <Text style={styles.staffNameText}>{staffName}</Text>
                        </View>
                        <Text style={styles.staffRoleText}>Owner</Text>
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Client note</Text>
                      <TextInput
                        onFocus={() => setFocusedField('newNote')}
                        onBlur={() => setFocusedField(null)}
                        value={customerNote}
                        onChangeText={setCustomerNote}
                        placeholder="Add a note"
                        placeholderTextColor={colors.muted}
                        multiline
                        numberOfLines={3}
                        style={[
                          styles.textInput,
                          styles.noteTextArea,
                          focusedField === 'newNote' && styles.inputFocused,
                        ]}
                      />
                    </View>
                  </View>
                </KeyboardAwareScrollView>

                <View style={styles.footerRowPadding}>
                  <Pressable
                    disabled={saving}
                    onPress={() => void handleSubmit()}
                    style={({ pressed }) => [
                      styles.saveBtn,
                      pressed && styles.pressed,
                      saving && styles.btnDisabled,
                    ]}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save appointment</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditSectionRow({
  icon,
  label,
  value,
  detail,
  expanded,
  onPress,
}: {
  icon: 'cut-outline' | 'time-outline' | 'person-outline' | 'pricetag-outline';
  label: string;
  value: string;
  detail?: string;
  expanded?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.editSectionRow, pressed && styles.pressed]}
    >
      <View style={styles.editSectionIcon}>
        <Ionicons name={icon} size={15} color={colors.coral} />
      </View>
      <View style={styles.editSectionCopy}>
        <Text style={styles.editSectionLabel}>{label}</Text>
        <Text style={styles.editSectionValue} numberOfLines={1}>
          {value}
        </Text>
        {detail ? (
          <Text style={styles.editSectionDetail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-forward'}
        size={17}
        color={colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  editModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    flex: 1,
  },
  editSheetContainer: {
    width: '100%',
    height: '92%',
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
  stepViewport: {
    flex: 1,
  },
  editBodyContent: {
    padding: 14,
    gap: 0,
    paddingBottom: 28,
  },
  editPageContent: {
    gap: 4,
  },
  emptyServices: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 36,
    gap: 8,
  },
  emptyServicesIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coralSoft,
    marginBottom: 4,
  },
  emptyServicesTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyServicesText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  manageServicesButton: {
    minHeight: 44,
    marginTop: 8,
    paddingHorizontal: 18,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coral,
  },
  manageServicesButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  noSearchResults: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 5,
  },
  editChoiceRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'transparent',
    borderBottomColor: '#F1EEEA',
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  editChoiceRowSelected: {
    borderWidth: 1.5,
    borderColor: colors.coral,
    borderBottomColor: colors.coral,
    backgroundColor: '#FFF7F6',
  },
  editChoiceCopy: {
    gap: 3,
  },
  statusOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  statusOptionIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editChoiceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  editChoiceMeta: {
    fontSize: 11,
    color: colors.muted,
  },
  calendarToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  calendarArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonth: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  calendarWeekdays: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calendarWeekday: {
    width: '14.28%',
    textAlign: 'center',
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.28%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellSelected: {
    backgroundColor: colors.navy,
    borderRadius: 10,
  },
  calendarCellDisabled: {
    opacity: 0.35,
  },
  calendarDay: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '600',
  },
  calendarDaySelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  calendarDayDisabled: {
    color: colors.muted,
  },
  timeSectionWrap: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1EEEA',
    gap: 10,
  },
  editChoiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  noTimesAvailable: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 26,
    gap: 7,
  },
  timeSlotBox: {
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
  timeSlotBoxSelected: {
    borderWidth: 1.5,
    borderColor: colors.coral,
    backgroundColor: '#FFF7F6',
  },
  timeSlotBoxText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  timeSlotBoxTextSelected: {
    color: colors.coral,
    fontWeight: '700',
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
  newFieldsGroup: {
    gap: 12,
    paddingTop: 12,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.ink,
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
  twoColumnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  additionalServicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  serviceGridBox: {
    width: '48.5%',
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    gap: 3,
  },
  serviceGridBoxSelected: {
    borderWidth: 1.5,
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
  staffRow: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAF9F8',
  },
  staffLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  staffAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: {
    fontSize: 11,
    fontWeight: '800',
  },
  staffNameText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.ink,
  },
  staffRoleText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
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
  btnDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
});
