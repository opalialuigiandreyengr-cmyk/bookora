import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentProps, type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  Animated,
  Dimensions,
  Easing,
  type GestureResponderEvent,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { supabase } from '@/lib/supabase';
import { goBackOrReplace } from '@/lib/navigation';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';
import type { BreakWindow, DaySchedule, TimeOffRule } from '@/types';

type IconName = ComponentProps<typeof Ionicons>['name'];

type SettingsSectionId =
  | 'Business profile'
  | 'Business hours'
  | 'Booking preferences'
  | 'Notifications'
  | 'Account'
  | 'Security';

type DropdownAnchor = {
  top?: number;
  bottom?: number;
  left: number;
};

type TargetWithoutAnchor =
  | {
      kind: 'weekly';
      dayIndex: number;
      field: 'start' | 'end';
      current: string;
      label: string;
    }
  | {
      kind: 'break';
      day: string;
      breakIndex: number;
      field: 'start' | 'end';
      current: string;
      label: string;
    }
  | {
      kind: 'timeOff';
      field: 'startTime' | 'endTime';
      current: string;
      label: string;
    };

type TimePickerTarget = TargetWithoutAnchor & { anchor?: DropdownAnchor };

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const TIME_SLOTS_24: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

function formatTime12h(time24: string): string {
  if (!time24) return '9:00 AM';
  const trimmed = time24.trim();
  if (/am|pm/i.test(trimmed)) return trimmed.toUpperCase();
  const [rawH, rawM] = trimmed.split(':');
  const h = Number(rawH);
  const m = Number(rawM ?? 0);
  if (Number.isNaN(h)) return trimmed;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minStr = String(Number.isNaN(m) ? 0 : m).padStart(2, '0');
  return `${hour12}:${minStr} ${period}`;
}

function formatDateMmDdYy(isoDate: string): string {
  if (!isoDate) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const [, yyyy, mm, dd] = match;
  return `${mm}/${dd}/${yyyy.slice(-2)}`;
}

function parseIsoParts(isoDate: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]) - 1,
      day: Number(match[3]),
    };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function toIsoDateString(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

const REPEAT_OPTIONS: { label: string; value: TimeOffRule['repeat'] }[] = [
  { label: 'Does not repeat', value: 'none' },
  { label: 'Every week', value: 'weekly' },
  { label: 'Every month', value: 'monthly' },
];

const BRAND_COLORS: { id: string; hex: string }[] = [
  { id: 'coral', hex: '#F0645A' },
  { id: 'rose', hex: '#E06C88' },
  { id: 'orange', hex: '#E8833A' },
  { id: 'navy', hex: '#243B53' },
  { id: 'sage', hex: '#528B74' },
  { id: 'sky', hex: '#3B82C4' },
  { id: 'plum', hex: '#6E4582' },
  { id: 'ink', hex: '#17212B' },
];

const INDUSTRIES = [
  'Nail salon',
  'Hair salon',
  'Barbershop',
  'Facial & spa',
  'Makeup studio',
  'Beauty clinic',
];

const THEMES = ['Light', 'Dark', 'System'] as const;

const REMINDER_HOURS_OPTIONS = [
  { label: '2 hrs before', value: 2 },
  { label: '24 hrs before', value: 24 },
  { label: '48 hrs before', value: 48 },
];

const MENU_ITEMS: { id: SettingsSectionId; icon: IconName }[] = [
  { id: 'Business profile', icon: 'business-outline' },
  { id: 'Business hours', icon: 'time-outline' },
  { id: 'Booking preferences', icon: 'calendar-outline' },
  { id: 'Account', icon: 'person-outline' },
  { id: 'Security', icon: 'lock-closed-outline' },
];

export default function Settings() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const {
    businessProfile,
    notificationSettings,
    session,
    saveBusinessProfile,
    saveNotificationSettings,
    changePassword,
    signOut,
    refreshing,
    refresh,
  } = useApp();

  const initialSection = MENU_ITEMS.some((item) => item.id === section)
    ? (section as SettingsSectionId)
    : null;
  const [activeSection, setActiveSection] = useState<SettingsSectionId | null>(initialSection);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [settingsViewProgress] = useState(() => new Animated.Value(1));

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
    if (activeSection === null) return;

    const animation = Animated.timing(settingsViewProgress, {
      toValue: 1,
      duration: reduceMotionEnabled ? 120 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();

    return () => animation.stop();
  }, [activeSection, reduceMotionEnabled, settingsViewProgress]);

  // Business Profile state
  const [name, setName] = useState(businessProfile.business_name);
  const [slug, setSlug] = useState(businessProfile.slug);
  const [industry, setIndustry] = useState(businessProfile.industry || 'Nail salon');
  const [about, setAbout] = useState(businessProfile.about);
  const [brandColor, setBrandColor] = useState(businessProfile.brand_color || 'coral');
  const [theme, setTheme] = useState(businessProfile.theme || 'Light');
  const [email, setEmail] = useState(businessProfile.email);
  const [countryCode, setCountryCode] = useState(businessProfile.country_code || '+63');
  const [phone, setPhone] = useState(businessProfile.phone);
  const [address, setAddress] = useState(businessProfile.address);
  const [city, setCity] = useState(businessProfile.city);
  const [country, setCountry] = useState(businessProfile.country || 'Philippines');
  const [website, setWebsite] = useState(businessProfile.website);
  const [instagram, setInstagram] = useState(businessProfile.instagram);
  const [facebook, setFacebook] = useState(businessProfile.facebook);
  const [ownerName, setOwnerName] = useState(businessProfile.owner_name);
  const [bannerUrl, setBannerUrl] = useState(businessProfile.banner_url || '');
  const [logoUrl, setLogoUrl] = useState(businessProfile.logo_url || '');
  const [uploadingBrandAsset, setUploadingBrandAsset] = useState<'banner' | 'logo' | null>(null);

  // Business Hours, Breaks & Time Off state
  const [hours, setHours] = useState<DaySchedule[]>(businessProfile.business_hours);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [breaks, setBreaks] = useState<Record<string, BreakWindow[]>>(
    businessProfile.availability_breaks
  );
  const [savedBreaks, setSavedBreaks] = useState<Record<string, BreakWindow[]>>(
    businessProfile.availability_breaks
  );
  const [timeOff, setTimeOff] = useState<TimeOffRule[]>(businessProfile.time_off);
  const [savedTimeOff, setSavedTimeOff] = useState<TimeOffRule[]>(businessProfile.time_off);
  const [availabilityModal, setAvailabilityModal] = useState<'breaks' | 'time-off' | null>(
    null
  );
  const [availabilitySheetTranslateY] = useState(() => new Animated.Value(420));
  const [savingAvailability, setSavingAvailability] = useState(false);
  useEffect(() => {
    if (availabilityModal) {
      availabilitySheetTranslateY.setValue(420);
      Animated.timing(availabilitySheetTranslateY, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [availabilityModal, availabilitySheetTranslateY]);
  const [timeOffDraft, setTimeOffDraft] = useState<TimeOffRule>({
    id: '',
    title: '',
    startDate: todayIso,
    endDate: todayIso,
    startTime: '09:00',
    endTime: '17:00',
    allDay: true,
    repeat: 'none',
  });

  // Time Picker & Date Picker state
  const [timePickerTarget, setTimePickerTarget] = useState<TimePickerTarget | null>(null);
  const [datePickerField, setDatePickerField] = useState<'startDate' | 'endDate' | null>(null);
  const [calendarViewMonth, setCalendarViewMonth] = useState<{ year: number; month: number }>(
    () => {
      const now = new Date();
      return { year: now.getFullYear(), month: now.getMonth() };
    }
  );

  // Leave confirmation modal state
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  // Booking Preferences state
  const [bookingPolicy, setBookingPolicy] = useState(businessProfile.booking_policy);
  const [additionalInfo, setAdditionalInfo] = useState(businessProfile.booking_additional_info);
  const [minNoticeHours, setMinNoticeHours] = useState(
    String(businessProfile.booking_min_notice_hours)
  );
  const [maxDays, setMaxDays] = useState(String(businessProfile.booking_max_days));
  const [slotSize, setSlotSize] = useState(String(businessProfile.booking_slot_size_minutes));
  const [cancellationNoticeHours, setCancellationNoticeHours] = useState(
    String(businessProfile.booking_cancellation_notice_hours)
  );
  const [bufferMinutes, setBufferMinutes] = useState(
    String(businessProfile.booking_buffer_minutes)
  );
  const [bookingFeeEnabled, setBookingFeeEnabled] = useState(businessProfile.booking_fee_enabled);
  const [bookingFeeType, setBookingFeeType] = useState<'fixed' | 'percentage'>(
    businessProfile.booking_fee_type
  );
  const [bookingFeeAmount, setBookingFeeAmount] = useState(
    String(businessProfile.booking_fee_amount)
  );
  const [bookingFeeNote, setBookingFeeNote] = useState(businessProfile.booking_fee_note);
  const [paymentReceiptUrl, setPaymentReceiptUrl] = useState(
    businessProfile.payment_receipt_url || ''
  );
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [formFields, setFormFields] = useState({
    phone: businessProfile.booking_show_phone,
    address: businessProfile.booking_show_address,
    notes: businessProfile.booking_show_notes,
    designPeg: businessProfile.booking_show_design_peg,
    paymentReceipt: businessProfile.booking_show_payment_receipt,
    price: businessProfile.booking_show_price,
    duration: businessProfile.booking_show_duration,
    hours: businessProfile.booking_show_hours,
    staff: businessProfile.booking_show_staff,
    reviews: businessProfile.booking_show_reviews,
  });
  const [allowCustomerLogin, setAllowCustomerLogin] = useState(
    businessProfile.booking_allow_customer_login
  );

  // Notifications state
  const [emailEnabled, setEmailEnabled] = useState(notificationSettings.email_enabled);
  const [smsEnabled, setSmsEnabled] = useState(notificationSettings.sms_enabled);
  const [customerConfirmation, setCustomerConfirmation] = useState(
    notificationSettings.customer_confirmation_enabled
  );
  const [staffConfirmation, setStaffConfirmation] = useState(
    notificationSettings.staff_confirmation_enabled
  );
  const [reminderEnabled, setReminderEnabled] = useState(notificationSettings.reminder_enabled);
  const [reminderLeadHours, setReminderLeadHours] = useState(
    notificationSettings.reminder_lead_hours || 24
  );
  const [noShowFollowup, setNoShowFollowup] = useState(
    notificationSettings.no_show_followup_enabled
  );

  // Change Password Modal state
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // MFA state
  const [mfaFactors, setMfaFactors] = useState<
    { id: string; friendly_name?: string | null; status?: string }[]
  >([]);
  const [mfaEnrollment, setMfaEnrollment] = useState<{ id: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

  useEffect(() => {
    if (!supabase || !session?.user.id) return;
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      setMfaFactors(
        (data?.totp || []).map((f) => ({
          id: f.id,
          friendly_name: f.friendly_name,
          status: f.status,
        }))
      );
    });
  }, [session?.user.id]);

  const persistAvailability = async (
    nextBreaks: Record<string, BreakWindow[]>,
    nextTimeOff: TimeOffRule[]
  ) => {
    const error = await saveBusinessProfile({
      availability_breaks: nextBreaks,
      time_off: nextTimeOff,
    });
    if (error) return error;
    setSavedBreaks(nextBreaks);
    setSavedTimeOff(nextTimeOff);
    return null;
  };

  const pickAndUploadBrandImage = async (kind: 'banner' | 'logo') => {
    if (!supabase || !session?.user.id) {
      Alert.alert('Upload unavailable', 'Please sign in again before uploading an image.');
      return;
    }
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo access to choose your business image.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'banner' ? [3, 1] : [1, 1],
      quality: kind === 'banner' ? 0.8 : 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingBrandAsset(kind);
    try {
      const asset = result.assets[0];
      const mimeType = asset.mimeType || 'image/jpeg';
      const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      const path = `${session.user.id}/${kind}.${extension}`;
      const imageResponse = await fetch(asset.uri);
      const imageData = await imageResponse.arrayBuffer();
      const { error } = await supabase.storage.from('brand-assets').upload(path, imageData, {
        contentType: mimeType,
        upsert: true,
      });
      if (error) throw error;
      const publicUrl = supabase.storage.from('brand-assets').getPublicUrl(path).data.publicUrl;
      const cacheSafeUrl = `${publicUrl}?v=${Date.now()}`;
      if (kind === 'banner') setBannerUrl(cacheSafeUrl);
      else setLogoUrl(cacheSafeUrl);
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not upload that image.');
    } finally {
      setUploadingBrandAsset(null);
    }
  };

  const pickAndUploadReceiptImage = async () => {
    if (!supabase || !session?.user.id) {
      Alert.alert('Upload unavailable', 'Please sign in again before uploading an image.');
      return;
    }
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo access to choose your payment image.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingReceipt(true);
    try {
      const asset = result.assets[0];
      const mimeType = asset.mimeType || 'image/jpeg';
      const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      const path = `${session.user.id}/payment-receipt.${extension}`;
      const imageResponse = await fetch(asset.uri);
      const imageData = await imageResponse.arrayBuffer();
      const { error } = await supabase.storage.from('brand-assets').upload(path, imageData, {
        contentType: mimeType,
        upsert: true,
      });
      if (error) throw error;
      const publicUrl = supabase.storage.from('brand-assets').getPublicUrl(path).data.publicUrl;
      setPaymentReceiptUrl(`${publicUrl}?v=${Date.now()}`);
    } catch (error) {
      Alert.alert(
        'Upload failed',
        error instanceof Error ? error.message : 'Could not upload that payment image.'
      );
    } finally {
      setUploadingReceipt(false);
    }
  };

  const resetFormToSaved = () => {
    setName(businessProfile.business_name);
    setSlug(businessProfile.slug);
    setIndustry(businessProfile.industry || 'Nail salon');
    setAbout(businessProfile.about);
    setBrandColor(businessProfile.brand_color || 'coral');
    setTheme(businessProfile.theme || 'Light');
    setEmail(businessProfile.email);
    setCountryCode(businessProfile.country_code || '+63');
    setPhone(businessProfile.phone);
    setAddress(businessProfile.address);
    setCity(businessProfile.city);
    setCountry(businessProfile.country || 'Philippines');
    setWebsite(businessProfile.website);
    setInstagram(businessProfile.instagram);
    setFacebook(businessProfile.facebook);
    setOwnerName(businessProfile.owner_name);
    setBannerUrl(businessProfile.banner_url || '');
    setLogoUrl(businessProfile.logo_url || '');
    setHours(businessProfile.business_hours);
    setBreaks(savedBreaks);
    setTimeOff(savedTimeOff);
    setBookingPolicy(businessProfile.booking_policy);
    setAdditionalInfo(businessProfile.booking_additional_info);
    setMinNoticeHours(String(businessProfile.booking_min_notice_hours));
    setMaxDays(String(businessProfile.booking_max_days));
    setSlotSize(String(businessProfile.booking_slot_size_minutes));
    setCancellationNoticeHours(String(businessProfile.booking_cancellation_notice_hours));
    setBufferMinutes(String(businessProfile.booking_buffer_minutes));
    setBookingFeeEnabled(businessProfile.booking_fee_enabled);
    setBookingFeeType(businessProfile.booking_fee_type);
    setBookingFeeAmount(String(businessProfile.booking_fee_amount));
    setBookingFeeNote(businessProfile.booking_fee_note);
    setPaymentReceiptUrl(businessProfile.payment_receipt_url || '');
    setFormFields({
      phone: businessProfile.booking_show_phone,
      address: businessProfile.booking_show_address,
      notes: businessProfile.booking_show_notes,
      designPeg: businessProfile.booking_show_design_peg,
      paymentReceipt: businessProfile.booking_show_payment_receipt,
      price: businessProfile.booking_show_price,
      duration: businessProfile.booking_show_duration,
      hours: businessProfile.booking_show_hours,
      staff: businessProfile.booking_show_staff,
      reviews: businessProfile.booking_show_reviews,
    });
    setAllowCustomerLogin(businessProfile.booking_allow_customer_login);
    setEmailEnabled(notificationSettings.email_enabled);
    setSmsEnabled(notificationSettings.sms_enabled);
    setCustomerConfirmation(notificationSettings.customer_confirmation_enabled);
    setStaffConfirmation(notificationSettings.staff_confirmation_enabled);
    setReminderEnabled(notificationSettings.reminder_enabled);
    setReminderLeadHours(notificationSettings.reminder_lead_hours || 24);
    setNoShowFollowup(notificationSettings.no_show_followup_enabled);
  };

  const toggleDayBreak = (day: string, enabled: boolean) => {
    setBreaks((current) => ({
      ...current,
      [day]: enabled
        ? (current[day] || []).length > 0
          ? current[day]
          : [{ start: '12:00', end: '13:00' }]
        : [],
    }));
  };

  const addBreak = (day: string) => {
    setBreaks((current) => ({
      ...current,
      [day]: [...(current[day] || []), { start: '12:00', end: '13:00' }],
    }));
  };

  const updateBreak = (
    day: string,
    index: number,
    key: keyof BreakWindow,
    value: string
  ) => {
    setBreaks((current) => ({
      ...current,
      [day]: (current[day] || []).map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item
      ),
    }));
  };

  const removeBreak = (day: string, index: number) => {
    setBreaks((current) => ({
      ...current,
      [day]: (current[day] || []).filter((_, idx) => idx !== index),
    }));
  };

  const handleSaveBreaksModal = async () => {
    setSavingAvailability(true);
    const error = await persistAvailability(breaks, timeOff);
    setSavingAvailability(false);
    if (error) {
      Alert.alert('Could not save breaks', error);
      return;
    }
    setAvailabilityModal(null);
  };

  const handleAddTimeOff = async () => {
    if (!timeOffDraft.startDate.trim() || !timeOffDraft.endDate.trim()) {
      Alert.alert('Missing dates', 'Please select a start date and end date.');
      return;
    }
    setSavingAvailability(true);
    const newEntry: TimeOffRule = {
      ...timeOffDraft,
      id: `time-off-${Date.now()}`,
      title: timeOffDraft.title.trim() || 'Time off',
    };
    const nextTimeOff = [...timeOff, newEntry];
    const error = await persistAvailability(breaks, nextTimeOff);
    setSavingAvailability(false);
    if (error) {
      Alert.alert('Could not add time off', error);
      return;
    }
    setTimeOff(nextTimeOff);
    setTimeOffDraft({
      id: '',
      title: '',
      startDate: todayIso,
      endDate: todayIso,
      startTime: '09:00',
      endTime: '17:00',
      allDay: true,
      repeat: 'none',
    });
    setDatePickerField(null);
    setAvailabilityModal(null);
  };

  const handleRemoveTimeOff = async (id: string) => {
    const nextTimeOff = timeOff.filter((item) => item.id !== id);
    const error = await persistAvailability(breaks, nextTimeOff);
    if (error) {
      Alert.alert('Could not remove time off', error);
      return;
    }
    setTimeOff(nextTimeOff);
  };

  const closeAvailabilityEditor = () => {
    setTimePickerTarget(null);
    setDatePickerField(null);
    setAvailabilityModal(null);
  };

  const dropdownScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const openTimeDropdown = (
    event: GestureResponderEvent,
    target: TargetWithoutAnchor
  ) => {
    // If already open on the exact same field, toggle it closed
    if (
      timePickerTarget &&
      timePickerTarget.kind === target.kind &&
      (target.kind === 'weekly'
        ? timePickerTarget.kind === 'weekly' &&
          timePickerTarget.dayIndex === target.dayIndex &&
          timePickerTarget.field === target.field
        : target.kind === 'break'
          ? timePickerTarget.kind === 'break' &&
            timePickerTarget.day === target.day &&
            timePickerTarget.breakIndex === target.breakIndex &&
            timePickerTarget.field === target.field
          : timePickerTarget.kind === 'timeOff' &&
            timePickerTarget.field === target.field)
    ) {
      setTimePickerTarget(null);
      return;
    }

    const screenHeight = Dimensions.get('window').height;
    const screenWidth = Dimensions.get('window').width;
    const dropdownHeight = 216;
    const dropdownWidth = 120;
    const measuredTarget = event.currentTarget;

    const openAtMeasuredPosition = (
      buttonX: number,
      buttonY: number,
      _buttonWidth: number,
      measuredHeight: number
    ) => {
      if (![buttonX, buttonY, measuredHeight].every(Number.isFinite)) return;
      const buttonHeight = measuredHeight > 0
        ? measuredHeight
        : target.kind === 'timeOff'
          ? 44
          : 36;
      const opensUpward = buttonY + buttonHeight + dropdownHeight > screenHeight - 20;
      const left = Math.min(Math.max(12, buttonX), screenWidth - dropdownWidth - 12);
      const top = opensUpward ? undefined : buttonY + buttonHeight + 4;
      const bottom = opensUpward ? screenHeight - buttonY + 4 : undefined;
      const anchor: DropdownAnchor = { top, bottom, left };
      setTimePickerTarget({ ...target, anchor });
    };

    if (typeof measuredTarget === 'number') {
      UIManager.measureInWindow(measuredTarget, openAtMeasuredPosition);
    } else if (
      measuredTarget &&
      typeof (measuredTarget as { measureInWindow?: unknown }).measureInWindow === 'function'
    ) {
      measuredTarget.measureInWindow(openAtMeasuredPosition);
    } else if (
      measuredTarget &&
      typeof (measuredTarget as unknown as HTMLElement).getBoundingClientRect === 'function'
    ) {
      const rect = (measuredTarget as unknown as HTMLElement).getBoundingClientRect();
      openAtMeasuredPosition(rect.left, rect.top, rect.width, rect.height);
    } else {
      const nativeEvt = event.nativeEvent as { pageX?: number; pageY?: number };
      openAtMeasuredPosition(
        nativeEvt.pageX ?? screenWidth / 2 - 60,
        nativeEvt.pageY ?? screenHeight / 2,
        100,
        38
      );
    }
  };

  useEffect(() => {
    if (timePickerTarget?.current && dropdownScrollRef.current) {
      const slotIndex = TIME_SLOTS_24.indexOf(timePickerTarget.current);
      if (slotIndex >= 0) {
        setTimeout(() => {
          dropdownScrollRef.current?.scrollTo({
            y: Math.max(0, slotIndex * 36 - 72),
            animated: false,
          });
        }, 20);
      }
    }
  }, [timePickerTarget]);

  const handleSelectTimeSlot = (slot24: string) => {
    if (!timePickerTarget) return;
    if (timePickerTarget.kind === 'weekly') {
      updateDayHour(timePickerTarget.dayIndex, { [timePickerTarget.field]: slot24 });
    } else if (timePickerTarget.kind === 'break') {
      updateBreak(
        timePickerTarget.day,
        timePickerTarget.breakIndex,
        timePickerTarget.field,
        slot24
      );
    } else if (timePickerTarget.kind === 'timeOff') {
      setTimeOffDraft((prev) => ({ ...prev, [timePickerTarget.field]: slot24 }));
    }
    setTimePickerTarget(null);
  };

  const renderTimeDropdown = (filterKind: 'weekly' | 'break' | 'timeOff') => {
    if (!timePickerTarget || timePickerTarget.kind !== filterKind) return null;
    return (
      <Modal
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        onRequestClose={() => setTimePickerTarget(null)}
      >
        <View style={styles.floatingDropdownBackdrop} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setTimePickerTarget(null)}
          />
          <View
            style={[
              styles.floatingDropdownCard,
              {
                top: timePickerTarget.anchor?.top,
                bottom: timePickerTarget.anchor?.bottom,
                left: timePickerTarget.anchor?.left ?? 16,
              },
            ]}
          >
            <ScrollView
              ref={dropdownScrollRef}
              style={styles.floatingDropdownScroll}
              contentContainerStyle={styles.floatingDropdownScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {TIME_SLOTS_24.map((slot) => {
                const isSelected = timePickerTarget.current === slot;
                return (
                  <Pressable
                    key={slot}
                    onPress={() => handleSelectTimeSlot(slot)}
                    style={({ pressed }) => [
                      styles.floatingDropdownItem,
                      isSelected && styles.floatingDropdownItemSelected,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.floatingDropdownItemText,
                        isSelected && styles.floatingDropdownItemTextSelected,
                      ]}
                    >
                      {formatTime12h(slot)}
                    </Text>
                    {isSelected ? (
                      <Ionicons name="checkmark" size={14} color={colors.coral} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const openDatePicker = (field: 'startDate' | 'endDate') => {
    if (datePickerField === field) {
      setDatePickerField(null);
      return;
    }
    const iso = field === 'startDate' ? timeOffDraft.startDate : timeOffDraft.endDate;
    const parts = parseIsoParts(iso);
    setCalendarViewMonth({ year: parts.year, month: parts.month });
    setDatePickerField(field);
  };

  const shiftCalendarMonth = (delta: number) => {
    setCalendarViewMonth((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const calendarCells = useMemo(() => {
    const firstDay = new Date(calendarViewMonth.year, calendarViewMonth.month, 1).getDay();
    const daysInMonth = new Date(
      calendarViewMonth.year,
      calendarViewMonth.month + 1,
      0
    ).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarViewMonth.year, calendarViewMonth.month]);

  const handleSelectDate = (day: number) => {
    if (!datePickerField) return;
    const selectedIso = toIsoDateString(calendarViewMonth.year, calendarViewMonth.month, day);
    setTimeOffDraft((prev) => {
      if (datePickerField === 'startDate') {
        const nextEnd = prev.endDate < selectedIso ? selectedIso : prev.endDate;
        return { ...prev, startDate: selectedIso, endDate: nextEnd };
      }
      const nextStart = prev.startDate > selectedIso ? selectedIso : prev.startDate;
      return { ...prev, startDate: nextStart, endDate: selectedIso };
    });
    setDatePickerField(null);
  };

  const activeSlug = useMemo(() => {
    if (slug?.trim()) return slug.trim();
    if (name?.trim()) {
      return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
    }
    return 'nailsou';
  }, [slug, name]);

  const leaveSettingsSection = () => {
    if (initialSection !== null) goBackOrReplace('/(tabs)/more');
    else setActiveSection(null);
  };

  const handleSave = async (options?: { leaveAfterSave?: boolean }) => {
    if (activeSection === 'Notifications') {
      setSaving(true);
      const err = await saveNotificationSettings({
        ...notificationSettings,
        email_enabled: emailEnabled,
        sms_enabled: smsEnabled,
        customer_confirmation_enabled: customerConfirmation,
        staff_confirmation_enabled: staffConfirmation,
        reminder_enabled: reminderEnabled,
        reminder_lead_hours: reminderLeadHours,
        no_show_followup_enabled: noShowFollowup,
      });
      setSaving(false);
      if (err) {
        Alert.alert('Could not save notifications', err);
        return;
      }
      if (options?.leaveAfterSave) {
        setLeaveConfirmOpen(false);
        leaveSettingsSection();
      } else {
        Alert.alert('Saved', 'Notification preferences updated.');
      }
      return;
    }

    const trimmedSlug = slug.trim().toLowerCase();
    if (trimmedSlug && !/^[a-z0-9-]+$/.test(trimmedSlug)) {
      Alert.alert(
        'Invalid booking URL',
        'Use lowercase letters, numbers, and hyphens only for your booking slug.'
      );
      return;
    }

    setSaving(true);
    const err = await saveBusinessProfile({
      business_name: name.trim() || 'Your business',
      slug: trimmedSlug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      industry: industry.trim(),
      about: about.trim(),
      brand_color: brandColor,
      theme,
      email: email.trim(),
      country_code: countryCode.trim() || '+63',
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      country: country.trim(),
      website: website.trim(),
      instagram: instagram.trim(),
      facebook: facebook.trim(),
      owner_name: ownerName.trim(),
      banner_url: bannerUrl,
      logo_url: logoUrl,
      business_hours: hours,
      availability_breaks: breaks,
      time_off: timeOff,
      booking_policy: bookingPolicy.trim(),
      booking_additional_info: additionalInfo.trim(),
      booking_min_notice_hours: Math.max(0, Number(minNoticeHours) || 0),
      booking_max_days: Math.max(1, Number(maxDays) || 60),
      booking_slot_size_minutes: Math.max(5, Number(slotSize) || 30),
      booking_cancellation_notice_hours: Math.max(0, Number(cancellationNoticeHours) || 0),
      booking_buffer_minutes: Math.max(0, Number(bufferMinutes) || 0),
      booking_fee_enabled: bookingFeeEnabled,
      booking_fee_type: bookingFeeType,
      booking_fee_amount: Math.max(0, Number(bookingFeeAmount) || 0),
      booking_fee_note: bookingFeeNote.trim(),
      payment_receipt_url: paymentReceiptUrl,
      booking_show_phone: formFields.phone,
      booking_show_address: formFields.address,
      booking_show_notes: formFields.notes,
      booking_show_design_peg: formFields.designPeg,
      booking_show_payment_receipt: formFields.paymentReceipt,
      booking_show_price: formFields.price,
      booking_show_duration: formFields.duration,
      booking_show_hours: formFields.hours,
      booking_show_staff: formFields.staff,
      booking_show_reviews: formFields.reviews,
      booking_allow_customer_login: allowCustomerLogin,
    });
    setSaving(false);

    if (err) {
      Alert.alert('Could not save settings', err);
      return;
    }
    setSavedBreaks(breaks);
    setSavedTimeOff(timeOff);
    if (options?.leaveAfterSave) {
      setLeaveConfirmOpen(false);
      leaveSettingsSection();
    } else {
      Alert.alert('Saved', 'Your settings have been updated.');
    }
  };

  const updateDayHour = (index: number, patch: Partial<DaySchedule>) => {
    setHours((current) =>
      current.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    );
  };

  const submitChangePassword = async () => {
    if (newPassword.length < 8) {
      Alert.alert('Password too short', 'Choose a password with at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Make sure both password fields match.');
      return;
    }
    setChangingPassword(true);
    const err = await changePassword(newPassword);
    setChangingPassword(false);
    if (err) {
      Alert.alert('Could not update password', err);
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    setPasswordModalOpen(false);
    Alert.alert('Password updated', 'Your password has been changed.');
  };

  const beginMfa = async () => {
    if (!supabase) return;
    setMfaBusy(true);
    const res = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Bookora mobile authenticator',
    });
    setMfaBusy(false);
    if (res.error || !res.data?.id || !res.data.totp) {
      Alert.alert('Could not start 2FA', res.error?.message || 'Try again in a moment.');
      return;
    }
    setMfaEnrollment({ id: res.data.id, secret: res.data.totp.secret });
  };

  const verifyMfa = async () => {
    if (!supabase || !mfaEnrollment || !/^\d{6}$/.test(mfaCode)) {
      Alert.alert('Invalid code', 'Enter the 6-digit code from your authenticator app.');
      return;
    }
    setMfaBusy(true);
    const challenge = await supabase.auth.mfa.challenge({ factorId: mfaEnrollment.id });
    if (challenge.error || !challenge.data?.id) {
      setMfaBusy(false);
      Alert.alert('2FA error', challenge.error?.message || 'Could not challenge factor.');
      return;
    }
    const verify = await supabase.auth.mfa.verify({
      factorId: mfaEnrollment.id,
      challengeId: challenge.data.id,
      code: mfaCode,
    });
    setMfaBusy(false);
    if (verify.error) {
      Alert.alert('Verification failed', verify.error.message);
      return;
    }
    setMfaEnrollment(null);
    setMfaCode('');
    const list = await supabase.auth.mfa.listFactors();
    setMfaFactors(
      (list.data?.totp || []).map((f) => ({
        id: f.id,
        friendly_name: f.friendly_name,
        status: f.status,
      }))
    );
    Alert.alert('2FA Enabled', 'Two-factor authentication is now active.');
  };

  const removeMfa = (factorId: string) => {
    Alert.alert(
      'Remove authenticator?',
      'Two-factor protection will be disabled for this factor.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!supabase) return;
            setMfaBusy(true);
            const res = await supabase.auth.mfa.unenroll({ factorId });
            setMfaBusy(false);
            if (res.error) Alert.alert('Error', res.error.message);
            else setMfaFactors((prev) => prev.filter((f) => f.id !== factorId));
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime with your Bookora account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/sign-in');
        },
      },
    ]);
  };

  const isSavableSection = activeSection !== null && activeSection !== 'Security';
  const hasUnsavedChanges = useMemo(() => {
    const differs = (current: unknown, saved: unknown) => JSON.stringify(current) !== JSON.stringify(saved);

    switch (activeSection) {
      case 'Business profile':
        return differs(
          { name, slug, industry, about, brandColor, theme, email, countryCode, phone, address, city, country, website, instagram, facebook, bannerUrl, logoUrl },
          {
            name: businessProfile.business_name,
            slug: businessProfile.slug,
            industry: businessProfile.industry || 'Nail salon',
            about: businessProfile.about,
            brandColor: businessProfile.brand_color || 'coral',
            theme: businessProfile.theme || 'Light',
            email: businessProfile.email,
            countryCode: businessProfile.country_code || '+63',
            phone: businessProfile.phone,
            address: businessProfile.address,
            city: businessProfile.city,
            country: businessProfile.country || 'Philippines',
            website: businessProfile.website,
            instagram: businessProfile.instagram,
            facebook: businessProfile.facebook,
            bannerUrl: businessProfile.banner_url || '',
            logoUrl: businessProfile.logo_url || '',
          }
        );
      case 'Business hours':
        return differs(hours, businessProfile.business_hours) || differs(breaks, savedBreaks) || differs(timeOff, savedTimeOff);
      case 'Booking preferences':
        return differs(
          { bookingPolicy, additionalInfo, minNoticeHours, maxDays, slotSize, cancellationNoticeHours, bufferMinutes, bookingFeeEnabled, bookingFeeType, bookingFeeAmount, bookingFeeNote, paymentReceiptUrl, formFields, allowCustomerLogin },
          {
            bookingPolicy: businessProfile.booking_policy,
            additionalInfo: businessProfile.booking_additional_info,
            minNoticeHours: String(businessProfile.booking_min_notice_hours),
            maxDays: String(businessProfile.booking_max_days),
            slotSize: String(businessProfile.booking_slot_size_minutes),
            cancellationNoticeHours: String(businessProfile.booking_cancellation_notice_hours),
            bufferMinutes: String(businessProfile.booking_buffer_minutes),
            bookingFeeEnabled: businessProfile.booking_fee_enabled,
            bookingFeeType: businessProfile.booking_fee_type,
            bookingFeeAmount: String(businessProfile.booking_fee_amount),
            bookingFeeNote: businessProfile.booking_fee_note,
            paymentReceiptUrl: businessProfile.payment_receipt_url || '',
            formFields: {
              phone: businessProfile.booking_show_phone,
              address: businessProfile.booking_show_address,
              notes: businessProfile.booking_show_notes,
              designPeg: businessProfile.booking_show_design_peg,
              paymentReceipt: businessProfile.booking_show_payment_receipt,
              price: businessProfile.booking_show_price,
              duration: businessProfile.booking_show_duration,
              hours: businessProfile.booking_show_hours,
              staff: businessProfile.booking_show_staff,
              reviews: businessProfile.booking_show_reviews,
            },
            allowCustomerLogin: businessProfile.booking_allow_customer_login,
          }
        );
      case 'Notifications':
        return differs(
          { emailEnabled, smsEnabled, customerConfirmation, staffConfirmation, reminderEnabled, reminderLeadHours, noShowFollowup },
          {
            emailEnabled: notificationSettings.email_enabled,
            smsEnabled: notificationSettings.sms_enabled,
            customerConfirmation: notificationSettings.customer_confirmation_enabled,
            staffConfirmation: notificationSettings.staff_confirmation_enabled,
            reminderEnabled: notificationSettings.reminder_enabled,
            reminderLeadHours: notificationSettings.reminder_lead_hours || 24,
            noShowFollowup: notificationSettings.no_show_followup_enabled,
          }
        );
      case 'Account':
        return ownerName !== businessProfile.owner_name || phone !== businessProfile.phone;
      default:
        return false;
    }
  }, [activeSection, additionalInfo, address, allowCustomerLogin, about, bannerUrl, bookingFeeAmount, bookingFeeEnabled, bookingFeeNote, bookingFeeType, bookingPolicy, brandColor, breaks, bufferMinutes, businessProfile, cancellationNoticeHours, city, country, countryCode, customerConfirmation, email, emailEnabled, facebook, formFields, hours, industry, instagram, logoUrl, maxDays, minNoticeHours, name, noShowFollowup, notificationSettings, ownerName, paymentReceiptUrl, phone, reminderEnabled, reminderLeadHours, savedBreaks, savedTimeOff, slotSize, slug, smsEnabled, staffConfirmation, theme, timeOff, website]);

  const handleBackPress = () => {
    if (activeSection !== null) {
      if (isSavableSection && hasUnsavedChanges) {
        setLeaveConfirmOpen(true);
      } else {
        leaveSettingsSection();
      }
    } else {
      goBackOrReplace('/(tabs)/more');
    }
  };

  const openSettingsSection = (section: SettingsSectionId) => {
    settingsViewProgress.stopAnimation();
    settingsViewProgress.setValue(0);
    setActiveSection(section);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.page}>
      {/* Sticky Header */}
      <View style={styles.topHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBackPress}
          hitSlop={8}
          style={({ pressed }) => [styles.backChevronBtn, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>

        <Text pointerEvents="none" style={styles.pageTitle} numberOfLines={1}>
          {activeSection ?? 'Settings'}
        </Text>

        {isSavableSection ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save settings"
            disabled={saving}
            onPress={() => void handleSave()}
            hitSlop={8}
            style={({ pressed }) => [
              styles.topSaveBtn,
              saving && { opacity: 0.5 },
              pressed && styles.pressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="checkmark" size={19} color="#FFFFFF" />
            )}
          </Pressable>
        ) : (
          <View style={styles.headerRightSpacer} />
        )}
      </View>

      {/* VIEW 1: SIMPLE SETTINGS MENU */}
      <Animated.View
        style={[
          styles.settingsViewTransition,
          {
            opacity: settingsViewProgress,
            transform: [
              {
                translateX: settingsViewProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [reduceMotionEnabled ? 0 : 18, 0],
                }),
              },
            ],
          },
        ]}
      >
      {activeSection === null ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.coral} />
          }
        >
          <View style={styles.menuGroup}>
            {MENU_ITEMS.map((item, index) => (
              <Pressable
                key={item.id}
                onPress={() => openSettingsSection(item.id)}
                style={({ pressed }) => [
                  styles.menuRow,
                  index === MENU_ITEMS.length - 1 && styles.menuRowLast,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.menuRowLeft}>
                  <Ionicons name={item.icon} size={19} color={colors.ink} />
                  <Text style={styles.menuRowTitle}>{item.id}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [styles.signOutRow, pressed && styles.rowPressed]}
          >
            <View style={styles.menuRowLeft}>
              <Ionicons name="log-out-outline" size={19} color={colors.danger} />
              <Text style={styles.signOutText}>Sign out</Text>
            </View>
          </Pressable>
        </ScrollView>
      ) : (
        /* VIEW 2: SELECTED SETTINGS SUB-PAGE */
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* SECTION 1: BUSINESS PROFILE */}
            {activeSection === 'Business profile' ? (
              <>
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>Brand details</Text>

                  <View style={styles.brandAssets}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={bannerUrl ? 'Change banner image' : 'Upload banner image'}
                      disabled={uploadingBrandAsset !== null}
                      onPress={() => void pickAndUploadBrandImage('banner')}
                      style={({ pressed }) => [styles.bannerUpload, pressed && styles.pressed]}
                    >
                      {bannerUrl ? <Image source={{ uri: bannerUrl }} style={styles.bannerImage} contentFit="cover" /> : null}
                      <View style={styles.bannerUploadOverlay}>
                        {uploadingBrandAsset === 'banner' ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />}
                        <Text style={styles.bannerUploadText}>{uploadingBrandAsset === 'banner' ? 'Uploading…' : bannerUrl ? 'Change banner image' : 'Upload banner image'}</Text>
                      </View>
                    </Pressable>

                    <View style={styles.logoUploadRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={logoUrl ? 'Change business logo' : 'Upload business logo'}
                        disabled={uploadingBrandAsset !== null}
                        onPress={() => void pickAndUploadBrandImage('logo')}
                        style={({ pressed }) => [styles.logoPreview, pressed && styles.pressed]}
                      >
                        {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="cover" /> : <Ionicons name="storefront-outline" size={24} color={colors.muted} />}
                      </Pressable>
                      <View style={styles.logoUploadCopy}>
                        <Text style={styles.logoUploadTitle}>Brand logo</Text>
                        <Text style={styles.logoUploadHint}>Use a square image for the best result.</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        disabled={uploadingBrandAsset !== null}
                        onPress={() => void pickAndUploadBrandImage('logo')}
                        style={({ pressed }) => [styles.logoUploadButton, pressed && styles.pressed]}
                      >
                        {uploadingBrandAsset === 'logo' ? <ActivityIndicator size="small" color={colors.coral} /> : <Text style={styles.logoUploadButtonText}>{logoUrl ? 'Change' : 'Upload'}</Text>}
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Business name</Text>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      onFocus={() => setFocusedField('name')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="e.g. Glow Studio"
                      placeholderTextColor={colors.muted}
                      style={[styles.textInput, focusedField === 'name' && styles.inputFocused]}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Booking page URL</Text>
                    <View
                      style={[
                        styles.affixInputWrap,
                        focusedField === 'slug' && styles.inputFocused,
                      ]}
                    >
                      <TextInput
                        value={slug}
                        onChangeText={setSlug}
                        onFocus={() => setFocusedField('slug')}
                        onBlur={() => setFocusedField(null)}
                        autoCapitalize="none"
                        placeholder={activeSlug}
                        placeholderTextColor={colors.muted}
                        style={styles.affixTextInput}
                      />
                      <Text style={styles.inputSuffix}>.bookoraph.com</Text>
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Industry</Text>
                    <View style={styles.slotGrid}>
                      {INDUSTRIES.map((ind) => {
                        const selected = industry.toLowerCase() === ind.toLowerCase();
                        return (
                          <Pressable
                            key={ind}
                            onPress={() => setIndustry(ind)}
                            style={[styles.slotBox, selected && styles.slotBoxSelected]}
                          >
                            <Text
                              style={[styles.slotBoxText, selected && styles.slotBoxTextSelected]}
                              numberOfLines={1}
                            >
                              {ind}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <View style={styles.fieldLabelRow}>
                      <Text style={styles.fieldLabel}>About</Text>
                      <Text style={styles.fieldHint}>{about.length}/255</Text>
                    </View>
                    <TextInput
                      value={about}
                      onChangeText={setAbout}
                      onFocus={() => setFocusedField('about')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Tell clients about your business"
                      placeholderTextColor={colors.muted}
                      multiline
                      maxLength={255}
                      style={[
                        styles.textInput,
                        styles.multilineInput,
                        focusedField === 'about' && styles.inputFocused,
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>Appearance</Text>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Brand color</Text>
                    <View style={styles.swatchesRow}>
                      {BRAND_COLORS.map((swatch) => (
                        <Pressable
                          key={swatch.id}
                          onPress={() => setBrandColor(swatch.id)}
                          style={[
                            styles.swatch,
                            { backgroundColor: swatch.hex },
                            brandColor === swatch.id && styles.swatchSelected,
                          ]}
                        >
                          {brandColor === swatch.id ? (
                            <Ionicons name="checkmark" size={16} color="#fff" />
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Booking page theme</Text>
                    <View style={styles.slotGrid}>
                      {THEMES.map((item) => {
                        const selected = theme === item;
                        return (
                          <Pressable
                            key={item}
                            onPress={() => setTheme(item)}
                            style={[styles.slotBoxThird, selected && styles.slotBoxSelected]}
                          >
                            <Text
                              style={[styles.slotBoxText, selected && styles.slotBoxTextSelected]}
                            >
                              {item}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>Contact & location</Text>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Primary email</Text>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholder="contact@yourbusiness.com"
                      placeholderTextColor={colors.muted}
                      style={[styles.textInput, focusedField === 'email' && styles.inputFocused]}
                    />
                  </View>

                  <View style={styles.row2}>
                    <View style={[styles.fieldGroup, { width: 92 }]}>
                      <Text style={styles.fieldLabel}>Code</Text>
                      <TextInput
                        value={countryCode}
                        onChangeText={setCountryCode}
                        onFocus={() => setFocusedField('code')}
                        onBlur={() => setFocusedField(null)}
                        placeholder="+63"
                        placeholderTextColor={colors.muted}
                        style={[styles.textInput, focusedField === 'code' && styles.inputFocused]}
                      />
                    </View>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>Phone number</Text>
                      <TextInput
                        value={phone}
                        onChangeText={setPhone}
                        onFocus={() => setFocusedField('phone')}
                        onBlur={() => setFocusedField(null)}
                        keyboardType="phone-pad"
                        placeholder="0912 345 6789"
                        placeholderTextColor={colors.muted}
                        style={[styles.textInput, focusedField === 'phone' && styles.inputFocused]}
                      />
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Address</Text>
                    <TextInput
                      value={address}
                      onChangeText={setAddress}
                      onFocus={() => setFocusedField('address')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Street, building, floor"
                      placeholderTextColor={colors.muted}
                      style={[styles.textInput, focusedField === 'address' && styles.inputFocused]}
                    />
                  </View>

                  <View style={styles.row2}>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>City</Text>
                      <TextInput
                        value={city}
                        onChangeText={setCity}
                        onFocus={() => setFocusedField('city')}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Manila"
                        placeholderTextColor={colors.muted}
                        style={[styles.textInput, focusedField === 'city' && styles.inputFocused]}
                      />
                    </View>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>Country</Text>
                      <TextInput
                        value={country}
                        onChangeText={setCountry}
                        onFocus={() => setFocusedField('country')}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Philippines"
                        placeholderTextColor={colors.muted}
                        style={[
                          styles.textInput,
                          focusedField === 'country' && styles.inputFocused,
                        ]}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>Social links</Text>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Website</Text>
                    <TextInput
                      value={website}
                      onChangeText={setWebsite}
                      onFocus={() => setFocusedField('website')}
                      onBlur={() => setFocusedField(null)}
                      autoCapitalize="none"
                      keyboardType="url"
                      placeholder="https://"
                      placeholderTextColor={colors.muted}
                      style={[styles.textInput, focusedField === 'website' && styles.inputFocused]}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Instagram</Text>
                    <TextInput
                      value={instagram}
                      onChangeText={setInstagram}
                      onFocus={() => setFocusedField('instagram')}
                      onBlur={() => setFocusedField(null)}
                      autoCapitalize="none"
                      placeholder="@yourstudio"
                      placeholderTextColor={colors.muted}
                      style={[
                        styles.textInput,
                        focusedField === 'instagram' && styles.inputFocused,
                      ]}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Facebook</Text>
                    <TextInput
                      value={facebook}
                      onChangeText={setFacebook}
                      onFocus={() => setFocusedField('facebook')}
                      onBlur={() => setFocusedField(null)}
                      autoCapitalize="none"
                      placeholder="facebook.com/yourstudio"
                      placeholderTextColor={colors.muted}
                      style={[
                        styles.textInput,
                        focusedField === 'facebook' && styles.inputFocused,
                      ]}
                    />
                  </View>
                </View>
              </>
            ) : null}

            {/* SECTION 2: BUSINESS HOURS */}
            {activeSection === 'Business hours' ? (
              <>
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeadingWithIcon}>
                    <View style={styles.sectionIconBadge}>
                      <Ionicons name="time-outline" size={16} color={colors.ink} />
                    </View>
                    <Text style={styles.sectionHeading}>Weekly working hours</Text>
                  </View>

                  {hours.map((schedule, index) => {
                    const isStartOpen =
                      timePickerTarget?.kind === 'weekly' &&
                      timePickerTarget.dayIndex === index &&
                      timePickerTarget.field === 'start';
                    const isEndOpen =
                      timePickerTarget?.kind === 'weekly' &&
                      timePickerTarget.dayIndex === index &&
                      timePickerTarget.field === 'end';
                    return (
                      <View
                        key={schedule.day}
                        style={[
                          styles.hourRow,
                          index === hours.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <View style={styles.hourDayLeft}>
                          <Switch
                            value={schedule.open}
                            onValueChange={(val) => updateDayHour(index, { open: val })}
                            trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                            thumbColor={schedule.open ? colors.coral : '#fff'}
                          />
                          <Text style={styles.hourDayName}>{schedule.day}</Text>
                        </View>
                        {schedule.open ? (
                          <View style={styles.hourInputs}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${schedule.day} opening time`}
                              onPress={(e) =>
                                openTimeDropdown(e, {
                                  kind: 'weekly',
                                  dayIndex: index,
                                  field: 'start',
                                  current: schedule.start,
                                  label: `${schedule.day} opening time`,
                                })
                              }
                              style={({ pressed }) => [
                                styles.timeDropdownBtn,
                                isStartOpen && styles.timeDropdownBtnActive,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.timeDropdownText,
                                  isStartOpen && styles.timeDropdownTextActive,
                                ]}
                              >
                                {formatTime12h(schedule.start)}
                              </Text>
                              <Ionicons
                                name={isStartOpen ? 'chevron-up' : 'chevron-down'}
                                size={13}
                                color={isStartOpen ? colors.coral : colors.muted}
                              />
                            </Pressable>
                            <Text style={styles.hourDash}>–</Text>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${schedule.day} closing time`}
                              onPress={(e) =>
                                openTimeDropdown(e, {
                                  kind: 'weekly',
                                  dayIndex: index,
                                  field: 'end',
                                  current: schedule.end,
                                  label: `${schedule.day} closing time`,
                                })
                              }
                              style={({ pressed }) => [
                                styles.timeDropdownBtn,
                                isEndOpen && styles.timeDropdownBtnActive,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.timeDropdownText,
                                  isEndOpen && styles.timeDropdownTextActive,
                                ]}
                              >
                                {formatTime12h(schedule.end)}
                              </Text>
                              <Ionicons
                                name={isEndOpen ? 'chevron-up' : 'chevron-down'}
                                size={13}
                                color={isEndOpen ? colors.coral : colors.muted}
                              />
                            </Pressable>
                          </View>
                        ) : (
                          <View style={styles.closedBadge}>
                            <Text style={styles.closedBadgeText}>Closed</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Breaks Summary + Manage Modal Trigger */}
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderActionRow}>
                    <View style={styles.sectionHeadingWithIcon}>
                      <View style={styles.sectionIconBadge}>
                        <Ionicons name="cafe-outline" size={16} color={colors.ink} />
                      </View>
                      <Text style={styles.sectionHeading}>Breaks</Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        setTimePickerTarget(null);
                        setAvailabilityModal('breaks');
                      }}
                      style={({ pressed }) => [styles.improvedActionBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="options-outline" size={15} color={colors.ink} />
                      <Text style={styles.improvedActionBtnText}>Manage breaks</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                    </Pressable>
                  </View>

                  {DAYS_OF_WEEK.some((day) => (breaks[day] || []).length > 0) ? (
                    <View style={styles.summaryList}>
                      {DAYS_OF_WEEK.filter((day) => (breaks[day] || []).length > 0).map(
                        (day, idx, arr) => (
                          <Pressable
                            key={day}
                            onPress={() => {
                              setTimePickerTarget(null);
                              setAvailabilityModal('breaks');
                            }}
                            style={({ pressed }) => [
                              styles.summaryItemRow,
                              idx === arr.length - 1 && { borderBottomWidth: 0 },
                              pressed && styles.rowPressed,
                            ]}
                          >
                            <Text style={styles.hourDayName}>{day}</Text>
                            <View style={styles.breakPillsWrap}>
                              {(breaks[day] || []).map((b, bIdx) => (
                                <View key={`${day}-${bIdx}`} style={styles.breakPill}>
                                  <Ionicons name="cafe-outline" size={12} color={colors.muted} />
                                  <Text style={styles.breakPillText}>
                                    {formatTime12h(b.start)} – {formatTime12h(b.end)}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </Pressable>
                        )
                      )}
                    </View>
                  ) : (
                    <Text style={styles.noBreaksText}>No recurring breaks set</Text>
                  )}
                </View>

                {/* Time Off Summary + Add Time Off Modal Trigger */}
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderActionRow}>
                    <View style={styles.sectionHeadingWithIcon}>
                      <View style={styles.sectionIconBadge}>
                        <Ionicons name="calendar-clear-outline" size={16} color={colors.ink} />
                      </View>
                      <Text style={styles.sectionHeading}>Time off</Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        setTimePickerTarget(null);
                        setDatePickerField(null);
                        setAvailabilityModal('time-off');
                      }}
                      style={({ pressed }) => [
                        styles.improvedPrimaryBtn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="add-circle-outline" size={16} color={colors.coral} />
                      <Text style={styles.improvedPrimaryBtnText}>Add time off</Text>
                    </Pressable>
                  </View>

                  {timeOff.length > 0 ? (
                    <View style={styles.savedTimeOffList}>
                      {timeOff.map((item, idx) => {
                        const startFormatted = formatDateMmDdYy(item.startDate);
                        const endFormatted = formatDateMmDdYy(item.endDate);
                        const dateRangeLabel =
                          item.startDate === item.endDate
                            ? startFormatted
                            : `${startFormatted} – ${endFormatted}`;
                        return (
                          <View
                            key={item.id}
                            style={[
                              styles.savedTimeOffRow,
                              idx === timeOff.length - 1 && { borderBottomWidth: 0 },
                            ]}
                          >
                            <View style={styles.savedTimeOffLeft}>
                              <View style={styles.savedTimeOffIconWrap}>
                                <Ionicons
                                  name="calendar-clear-outline"
                                  size={16}
                                  color={colors.coral}
                                />
                              </View>
                              <View style={{ flex: 1, gap: 2 }}>
                                <Text style={styles.savedTimeOffTitle}>{item.title}</Text>
                                <Text style={styles.savedTimeOffMeta}>
                                  {dateRangeLabel} ·{' '}
                                  {item.allDay
                                    ? 'All day'
                                    : `${formatTime12h(item.startTime)} – ${formatTime12h(item.endTime)}`}
                                  {item.repeat !== 'none' ? ` · Repeats ${item.repeat}` : ''}
                                </Text>
                              </View>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${item.title}`}
                              onPress={() => void handleRemoveTimeOff(item.id)}
                              hitSlop={8}
                              style={({ pressed }) => [
                                styles.removeIconBtn,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Ionicons name="trash-outline" size={16} color={colors.danger} />
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.noBreaksText}>No upcoming time off</Text>
                  )}
                </View>
              </>
            ) : null}

            {/* SECTION 3: BOOKING PREFERENCES */}
            {activeSection === 'Booking preferences' ? (
              <>
                <View style={[styles.sectionCard, styles.bookingSection]}>
                  <View style={styles.bookingSectionHeader}>
                    <Text style={styles.sectionHeading}>Booking timing</Text>
                    <Text style={styles.sectionSubtitle}>
                      Set when clients can book, cancel, and how appointments are spaced.
                    </Text>
                  </View>

                  <View style={styles.detailsGrid}>
                    <View style={styles.gridCol}>
                      <Text style={styles.fieldLabel}>Minimum notice</Text>
                      <View
                        style={[
                          styles.affixInputWrap,
                          focusedField === 'minNotice' && styles.inputFocused,
                        ]}
                      >
                        <TextInput
                          value={minNoticeHours}
                          onChangeText={setMinNoticeHours}
                          onFocus={() => setFocusedField('minNotice')}
                          onBlur={() => setFocusedField(null)}
                          keyboardType="number-pad"
                          style={styles.affixTextInput}
                        />
                        <Text style={styles.inputSuffix}>hrs</Text>
                      </View>
                    </View>

                    <View style={styles.gridCol}>
                      <Text style={styles.fieldLabel}>Advance booking</Text>
                      <View
                        style={[
                          styles.affixInputWrap,
                          focusedField === 'maxDays' && styles.inputFocused,
                        ]}
                      >
                        <TextInput
                          value={maxDays}
                          onChangeText={setMaxDays}
                          onFocus={() => setFocusedField('maxDays')}
                          onBlur={() => setFocusedField(null)}
                          keyboardType="number-pad"
                          style={styles.affixTextInput}
                        />
                        <Text style={styles.inputSuffix}>days</Text>
                      </View>
                    </View>

                    <View style={styles.gridCol}>
                      <Text style={styles.fieldLabel}>Calendar interval</Text>
                      <View
                        style={[
                          styles.affixInputWrap,
                          focusedField === 'slotSize' && styles.inputFocused,
                        ]}
                      >
                        <TextInput
                          value={slotSize}
                          onChangeText={setSlotSize}
                          onFocus={() => setFocusedField('slotSize')}
                          onBlur={() => setFocusedField(null)}
                          keyboardType="number-pad"
                          style={styles.affixTextInput}
                        />
                        <Text style={styles.inputSuffix}>mins</Text>
                      </View>
                    </View>

                    <View style={styles.gridCol}>
                      <Text style={styles.fieldLabel}>Cancellation notice</Text>
                      <View
                        style={[
                          styles.affixInputWrap,
                          focusedField === 'cancelNotice' && styles.inputFocused,
                        ]}
                      >
                        <TextInput
                          value={cancellationNoticeHours}
                          onChangeText={setCancellationNoticeHours}
                          onFocus={() => setFocusedField('cancelNotice')}
                          onBlur={() => setFocusedField(null)}
                          keyboardType="number-pad"
                          style={styles.affixTextInput}
                        />
                        <Text style={styles.inputSuffix}>hrs</Text>
                      </View>
                    </View>

                    <View style={styles.gridColFull}>
                      <Text style={styles.fieldLabel}>Buffer between bookings</Text>
                      <View
                        style={[
                          styles.affixInputWrap,
                          focusedField === 'buffer' && styles.inputFocused,
                        ]}
                      >
                        <TextInput
                          value={bufferMinutes}
                          onChangeText={setBufferMinutes}
                          onFocus={() => setFocusedField('buffer')}
                          onBlur={() => setFocusedField(null)}
                          keyboardType="number-pad"
                          style={styles.affixTextInput}
                        />
                        <Text style={styles.inputSuffix}>mins</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={[styles.sectionCard, styles.bookingSection]}>
                  <View style={styles.bookingSectionHeader}>
                    <Text style={styles.sectionHeading}>Policies & pricing notes</Text>
                    <Text style={styles.sectionSubtitle}>
                      These details appear before a client submits their booking.
                    </Text>
                  </View>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Booking policy</Text>
                    <TextInput
                      value={bookingPolicy}
                      onChangeText={setBookingPolicy}
                      onFocus={() => setFocusedField('policy')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Late arrival, rescheduling, or cancellation terms"
                      placeholderTextColor={colors.muted}
                      multiline
                      style={[
                        styles.textInput,
                        styles.multilineInput,
                        focusedField === 'policy' && styles.inputFocused,
                      ]}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Additional quote / pricing note</Text>
                    <TextInput
                      value={additionalInfo}
                      onChangeText={setAdditionalInfo}
                      onFocus={() => setFocusedField('additionalInfo')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Shown before customers submit their booking"
                      placeholderTextColor={colors.muted}
                      multiline
                      style={[
                        styles.textInput,
                        styles.multilineInput,
                        focusedField === 'additionalInfo' && styles.inputFocused,
                      ]}
                    />
                  </View>
                </View>

                <View style={[styles.sectionCard, styles.bookingSection]}>
                  <View style={styles.toggleHeaderRow}>
                    <View style={styles.toggleHeaderCopy}>
                      <Text style={styles.sectionHeading}>Reservation deposit</Text>
                      <Text style={styles.sectionSubtitle}>
                        Require a fixed amount or percentage to confirm a booking.
                      </Text>
                    </View>
                    <Switch
                      value={bookingFeeEnabled}
                      onValueChange={setBookingFeeEnabled}
                      trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                      thumbColor={bookingFeeEnabled ? colors.coral : '#fff'}
                    />
                  </View>

                  {bookingFeeEnabled ? (
                    <>
                      <View style={styles.slotGrid}>
                        {(
                          [
                            ['fixed', 'Fixed PHP'],
                            ['percentage', 'Percentage %'],
                          ] as const
                        ).map(([type, label]) => {
                          const selected = bookingFeeType === type;
                          return (
                            <Pressable
                              key={type}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              onPress={() => setBookingFeeType(type)}
                              style={[styles.slotBox, selected && styles.slotBoxSelected]}
                            >
                              <Text
                                style={[
                                  styles.slotBoxText,
                                  selected && styles.slotBoxTextSelected,
                                ]}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>
                          {bookingFeeType === 'percentage'
                            ? 'Deposit percentage'
                            : 'Deposit amount'}
                        </Text>
                        <View
                          style={[
                            styles.affixInputWrap,
                            focusedField === 'feeAmount' && styles.inputFocused,
                          ]}
                        >
                          <Text style={styles.inputPrefix}>
                            {bookingFeeType === 'percentage' ? '%' : 'PHP'}
                          </Text>
                          <TextInput
                            value={bookingFeeAmount}
                            onChangeText={setBookingFeeAmount}
                            onFocus={() => setFocusedField('feeAmount')}
                            onBlur={() => setFocusedField(null)}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={colors.muted}
                            style={styles.affixTextInput}
                          />
                        </View>
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Deposit instructions</Text>
                        <TextInput
                          value={bookingFeeNote}
                          onChangeText={setBookingFeeNote}
                          onFocus={() => setFocusedField('feeNote')}
                          onBlur={() => setFocusedField(null)}
                          placeholder="e.g. GCash / BPI payment instructions"
                          placeholderTextColor={colors.muted}
                          multiline
                          style={[
                            styles.textInput,
                            styles.multilineInput,
                            focusedField === 'feeNote' && styles.inputFocused,
                          ]}
                        />
                      </View>
                    </>
                  ) : null}
                </View>

                <View style={[styles.sectionCard, styles.bookingSection]}>
                  <View style={styles.bookingSectionHeader}>
                    <Text style={styles.sectionHeading}>Payment guide</Text>
                    <Text style={styles.sectionSubtitle}>
                      Add the QR code or payment instructions clients see while booking.
                    </Text>
                  </View>

                  {paymentReceiptUrl ? (
                    <Image
                      source={{ uri: paymentReceiptUrl }}
                      style={styles.receiptPreview}
                      contentFit="contain"
                    />
                  ) : (
                    <View style={styles.receiptEmptyPreview}>
                      <Ionicons name="image-outline" size={24} color={colors.muted} />
                      <Text style={styles.receiptEmptyText}>No payment image uploaded</Text>
                    </View>
                  )}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      paymentReceiptUrl ? 'Change payment receipt image' : 'Upload payment receipt image'
                    }
                    disabled={uploadingReceipt}
                    onPress={() => void pickAndUploadReceiptImage()}
                    style={({ pressed }) => [
                      styles.receiptUploadButton,
                      uploadingReceipt && styles.disabledAction,
                      pressed && styles.pressed,
                    ]}
                  >
                    {uploadingReceipt ? (
                      <ActivityIndicator size="small" color={colors.coral} />
                    ) : (
                      <Ionicons name="cloud-upload-outline" size={17} color={colors.coral} />
                    )}
                    <Text style={styles.receiptUploadButtonText}>
                      {uploadingReceipt
                        ? 'Uploading…'
                        : paymentReceiptUrl
                          ? 'Change image'
                          : 'Upload image'}
                    </Text>
                  </Pressable>
                </View>

                <View style={[styles.sectionCard, styles.bookingSectionLast]}>
                  <View style={styles.bookingSectionHeader}>
                    <Text style={styles.sectionHeading}>Booking form</Text>
                    <Text style={styles.sectionSubtitle}>
                      Choose what clients provide and what appears on your public page.
                    </Text>
                  </View>

                  <View style={styles.preferenceGroup}>
                    <Text style={styles.preferenceGroupLabel}>Client information</Text>
                    {(
                      [
                        ['phone', 'Require customer phone number'],
                        ['address', 'Ask for customer address'],
                        ['notes', 'Allow customer booking notes'],
                        ['designPeg', 'Allow design inspiration (peg) photo upload'],
                        ['paymentReceipt', 'Allow payment receipt upload'],
                      ] as const
                    ).map(([key, label]) => (
                      <View key={key} style={styles.toggleLine}>
                        <Text style={styles.toggleLineLabel}>{label}</Text>
                        <Switch
                          value={formFields[key]}
                          onValueChange={(val) =>
                            setFormFields((prev) => ({ ...prev, [key]: val }))
                          }
                          trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                          thumbColor={formFields[key] ? colors.coral : '#fff'}
                        />
                      </View>
                    ))}
                    <View style={[styles.toggleLine, styles.toggleLineLast]}>
                      <Text style={styles.toggleLineLabel}>Allow customer account sign-in</Text>
                      <Switch
                        value={allowCustomerLogin}
                        onValueChange={setAllowCustomerLogin}
                        trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                        thumbColor={allowCustomerLogin ? colors.coral : '#fff'}
                      />
                    </View>
                  </View>

                  <View style={styles.preferenceGroup}>
                    <Text style={styles.preferenceGroupLabel}>Public booking page</Text>
                    {(
                      [
                        ['price', 'Display service prices'],
                        ['duration', 'Display service durations'],
                        ['hours', 'Display business hours'],
                        ['staff', 'Allow clients to choose a staff member'],
                        ['reviews', 'Display customer reviews'],
                      ] as const
                    ).map(([key, label], index, items) => (
                      <View
                        key={key}
                        style={[
                          styles.toggleLine,
                          index === items.length - 1 && styles.toggleLineLast,
                        ]}
                      >
                        <Text style={styles.toggleLineLabel}>{label}</Text>
                        <Switch
                          value={formFields[key]}
                          onValueChange={(val) =>
                            setFormFields((prev) => ({ ...prev, [key]: val }))
                          }
                          trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                          thumbColor={formFields[key] ? colors.coral : '#fff'}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              </>
            ) : null}

            {/* SECTION 4: NOTIFICATIONS */}
            {activeSection === 'Notifications' ? (
              <>
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>Notification channels</Text>

                  <View style={styles.toggleLine}>
                    <Text style={styles.toggleLineLabel}>Email notifications</Text>
                    <Switch
                      value={emailEnabled}
                      onValueChange={setEmailEnabled}
                      trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                      thumbColor={emailEnabled ? colors.coral : '#fff'}
                    />
                  </View>

                  <View style={[styles.toggleLine, { borderBottomWidth: 0 }]}>
                    <Text style={styles.toggleLineLabel}>SMS notifications</Text>
                    <Switch
                      value={smsEnabled}
                      onValueChange={setSmsEnabled}
                      trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                      thumbColor={smsEnabled ? colors.coral : '#fff'}
                    />
                  </View>
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>Client & team notifications</Text>

                  <View style={styles.toggleLine}>
                    <Text style={styles.toggleLineLabel}>New booking confirmations</Text>
                    <Switch
                      value={customerConfirmation}
                      onValueChange={setCustomerConfirmation}
                      trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                      thumbColor={customerConfirmation ? colors.coral : '#fff'}
                    />
                  </View>

                  <View style={styles.toggleLine}>
                    <Text style={styles.toggleLineLabel}>Staff booking alerts</Text>
                    <Switch
                      value={staffConfirmation}
                      onValueChange={setStaffConfirmation}
                      trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                      thumbColor={staffConfirmation ? colors.coral : '#fff'}
                    />
                  </View>

                  <View style={styles.toggleLine}>
                    <Text style={styles.toggleLineLabel}>Automated reminders</Text>
                    <Switch
                      value={reminderEnabled}
                      onValueChange={setReminderEnabled}
                      trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                      thumbColor={reminderEnabled ? colors.coral : '#fff'}
                    />
                  </View>

                  {reminderEnabled ? (
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Reminder timing</Text>
                      <View style={styles.slotGrid}>
                        {REMINDER_HOURS_OPTIONS.map((opt) => {
                          const selected = reminderLeadHours === opt.value;
                          return (
                            <Pressable
                              key={opt.value}
                              onPress={() => setReminderLeadHours(opt.value)}
                              style={[styles.slotBoxThird, selected && styles.slotBoxSelected]}
                            >
                              <Text
                                style={[
                                  styles.slotBoxText,
                                  selected && styles.slotBoxTextSelected,
                                ]}
                              >
                                {opt.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  <View style={[styles.toggleLine, { borderBottomWidth: 0 }]}>
                    <Text style={styles.toggleLineLabel}>No-show follow-up</Text>
                    <Switch
                      value={noShowFollowup}
                      onValueChange={setNoShowFollowup}
                      trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                      thumbColor={noShowFollowup ? colors.coral : '#fff'}
                    />
                  </View>
                </View>
              </>
            ) : null}

            {/* SECTION 5: ACCOUNT */}
            {activeSection === 'Account' ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Owner profile</Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Full name</Text>
                  <TextInput
                    value={ownerName}
                    onChangeText={setOwnerName}
                    onFocus={() => setFocusedField('ownerName')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Your full name"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.textInput,
                      focusedField === 'ownerName' && styles.inputFocused,
                    ]}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Account email</Text>
                  <TextInput
                    value={session?.user.email || email}
                    editable={false}
                    style={[styles.textInput, styles.lockedInput]}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Role</Text>
                  <TextInput
                    value="Owner"
                    editable={false}
                    style={[styles.textInput, styles.lockedInput]}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Phone number</Text>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    onFocus={() => setFocusedField('accountPhone')}
                    onBlur={() => setFocusedField(null)}
                    keyboardType="phone-pad"
                    placeholder="+63"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.textInput,
                      focusedField === 'accountPhone' && styles.inputFocused,
                    ]}
                  />
                </View>
              </View>
            ) : null}

            {/* SECTION 6: SECURITY */}
            {activeSection === 'Security' ? (
              <>
                <View style={styles.sectionCard}>
                  <View style={styles.securityRow}>
                    <View style={styles.menuRowLeft}>
                      <Ionicons name="key-outline" size={18} color={colors.ink} />
                      <Text style={styles.menuRowTitle}>Password</Text>
                    </View>
                    <Pressable
                      onPress={() => setPasswordModalOpen(true)}
                      style={({ pressed }) => [styles.outlineActionBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.outlineActionBtnText}>Change</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.sectionCard}>
                  <View style={styles.securityRow}>
                    <View style={styles.menuRowLeft}>
                      <Ionicons name="shield-checkmark-outline" size={18} color={colors.ink} />
                      <Text style={styles.menuRowTitle}>Two-factor authentication (2FA)</Text>
                    </View>
                  </View>

                  {mfaFactors.length > 0 ? (
                    <View style={styles.mfaActiveBox}>
                      <Text style={styles.mfaActiveText}>Authenticator app enabled</Text>
                      {mfaFactors.map((factor) => (
                        <Pressable
                          key={factor.id}
                          disabled={mfaBusy}
                          onPress={() => removeMfa(factor.id)}
                          style={({ pressed }) => [
                            styles.dangerOutlineBtn,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.dangerOutlineBtnText}>Remove 2FA</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : mfaEnrollment ? (
                    <View style={styles.mfaEnrollBox}>
                      <Text style={styles.fieldLabel}>Setup key</Text>
                      <Pressable
                        onPress={() => void Share.share({ message: mfaEnrollment.secret })}
                        style={styles.secretBox}
                      >
                        <Text style={styles.secretText}>{mfaEnrollment.secret}</Text>
                        <Ionicons name="copy-outline" size={16} color={colors.ink} />
                      </Pressable>

                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>6-digit verification code</Text>
                        <TextInput
                          value={mfaCode}
                          onChangeText={(v) => setMfaCode(v.replace(/\D/g, ''))}
                          keyboardType="number-pad"
                          maxLength={6}
                          placeholder="123456"
                          placeholderTextColor={colors.muted}
                          style={styles.textInput}
                        />
                      </View>

                      <View style={styles.row2}>
                        <Pressable
                          onPress={() => {
                            setMfaEnrollment(null);
                            setMfaCode('');
                          }}
                          style={({ pressed }) => [
                            styles.modalCancelBtn,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.modalCancelBtnText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          disabled={mfaBusy}
                          onPress={() => void verifyMfa()}
                          style={({ pressed }) => [
                            styles.modalSaveBtn,
                            mfaBusy && { opacity: 0.5 },
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.modalSaveBtnText}>
                            {mfaBusy ? 'Verifying…' : 'Verify & Enable'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      disabled={mfaBusy}
                      onPress={() => void beginMfa()}
                      style={({ pressed }) => [styles.outlineActionBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.outlineActionBtnText}>
                        {mfaBusy ? 'Starting…' : 'Set up 2FA'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </>
            ) : null}
          </KeyboardAwareScrollView>
          {renderTimeDropdown('weekly')}
        </KeyboardAvoidingView>
      )}
      </Animated.View>

      {/* Change Password Bottom-Sheet Modal */}
      <Modal
        visible={passwordModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetBackdrop}
        >
          <Pressable
            style={styles.backdropOverlay}
            onPress={() => setPasswordModalOpen(false)}
          />
          <View style={styles.passwordSheetContainer}>
            <View style={styles.sheetHandle} />
            <View style={styles.headerNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={() => setPasswordModalOpen(false)}
                style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>
              <Text style={styles.headerTitleText}>Change password</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close modal"
                onPress={() => setPasswordModalOpen(false)}
                style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <View style={styles.passwordModalBody}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>New password</Text>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  onFocus={() => setFocusedField('newPassword')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.textInput,
                    focusedField === 'newPassword' && styles.inputFocused,
                  ]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Confirm new password</Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => setFocusedField('confirmPassword')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry
                  placeholder="Repeat your new password"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.textInput,
                    focusedField === 'confirmPassword' && styles.inputFocused,
                  ]}
                />
              </View>
            </View>

            <View style={styles.stickyFooter}>
              <Pressable
                onPress={() => setPasswordModalOpen(false)}
                style={({ pressed }) => [styles.modalCancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={changingPassword}
                onPress={() => void submitChangePassword()}
                style={({ pressed }) => [
                  styles.modalSaveBtn,
                  changingPassword && { opacity: 0.5 },
                  pressed && styles.pressed,
                ]}
              >
                {changingPassword ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Update password</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Manage Breaks Bottom-Sheet Modal */}
      <Modal
        visible={availabilityModal === 'breaks'}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setTimePickerTarget(null);
          setAvailabilityModal(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetBackdrop}
        >
          <Pressable
            style={styles.backdropOverlay}
            onPress={() => {
              setTimePickerTarget(null);
              setAvailabilityModal(null);
            }}
          />
          <Animated.View style={[styles.availabilitySheetContainer, { transform: [{ translateY: availabilitySheetTranslateY }] }]}>
            <View style={styles.sheetHandle} />
            <View style={[styles.headerNav, styles.availabilityHeaderNav]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={8}
                onPress={closeAvailabilityEditor}
                style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>
              <Text pointerEvents="none" style={[styles.headerTitleText, styles.availabilityHeaderTitle]}>Manage breaks</Text>
            </View>

            <KeyboardAwareScrollView
              style={styles.availabilityScroll}
              contentContainerStyle={[styles.passwordModalBody, styles.manageBreaksBody]}
              showsVerticalScrollIndicator={false}
            >
              {DAYS_OF_WEEK.map((day, dayIndex) => {
                const dayBreaks = breaks[day] || [];
                const hasBreaks = dayBreaks.length > 0;
                return (
                  <View
                    key={day}
                    style={[
                      styles.breakDayGroup,
                      dayIndex === DAYS_OF_WEEK.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <View style={styles.breakDayHeader}>
                      <View style={styles.hourDayLeft}>
                        <Switch
                          value={hasBreaks}
                          onValueChange={(val) => toggleDayBreak(day, val)}
                          trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                          thumbColor={hasBreaks ? colors.coral : '#fff'}
                        />
                        <Text style={styles.hourDayName}>{day}</Text>
                      </View>

                      {hasBreaks ? (
                        <Pressable
                          onPress={() => addBreak(day)}
                          hitSlop={6}
                          style={({ pressed }) => [
                            styles.addBreakBtn,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Ionicons name="add-circle-outline" size={16} color={colors.coral} />
                          <Text style={styles.addBreakBtnText}>Add break</Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.noBreaksText}>No breaks</Text>
                      )}
                    </View>

                    {hasBreaks ? (
                      <View style={styles.breakRowsList}>
                        {dayBreaks.map((item, idx) => {
                          const isBreakStartOpen =
                            timePickerTarget?.kind === 'break' &&
                            timePickerTarget.day === day &&
                            timePickerTarget.breakIndex === idx &&
                            timePickerTarget.field === 'start';
                          const isBreakEndOpen =
                            timePickerTarget?.kind === 'break' &&
                            timePickerTarget.day === day &&
                            timePickerTarget.breakIndex === idx &&
                            timePickerTarget.field === 'end';
                          return (
                            <View key={`${day}-${idx}`} style={styles.breakTimeRow}>
                              <View style={styles.hourInputs}>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`${day} break start time`}
                                  onPress={(e) =>
                                    openTimeDropdown(e, {
                                      kind: 'break',
                                      day,
                                      breakIndex: idx,
                                      field: 'start',
                                      current: item.start,
                                      label: `${day} break start`,
                                    })
                                  }
                                  style={({ pressed }) => [
                                    styles.timeDropdownBtn,
                                    isBreakStartOpen && styles.timeDropdownBtnActive,
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.timeDropdownText,
                                      isBreakStartOpen && styles.timeDropdownTextActive,
                                    ]}
                                  >
                                    {formatTime12h(item.start)}
                                  </Text>
                                  <Ionicons
                                    name={isBreakStartOpen ? 'chevron-up' : 'chevron-down'}
                                    size={13}
                                    color={isBreakStartOpen ? colors.coral : colors.muted}
                                  />
                                </Pressable>
                                <Text style={styles.hourDash}>to</Text>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`${day} break end time`}
                                  onPress={(e) =>
                                    openTimeDropdown(e, {
                                      kind: 'break',
                                      day,
                                      breakIndex: idx,
                                      field: 'end',
                                      current: item.end,
                                      label: `${day} break end`,
                                    })
                                  }
                                  style={({ pressed }) => [
                                    styles.timeDropdownBtn,
                                    isBreakEndOpen && styles.timeDropdownBtnActive,
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.timeDropdownText,
                                      isBreakEndOpen && styles.timeDropdownTextActive,
                                    ]}
                                  >
                                    {formatTime12h(item.end)}
                                  </Text>
                                  <Ionicons
                                    name={isBreakEndOpen ? 'chevron-up' : 'chevron-down'}
                                    size={13}
                                    color={isBreakEndOpen ? colors.coral : colors.muted}
                                  />
                                </Pressable>
                              </View>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Remove ${day} break`}
                                onPress={() => removeBreak(day, idx)}
                                hitSlop={8}
                                style={({ pressed }) => [
                                  styles.removeIconBtn,
                                  pressed && styles.pressed,
                                ]}
                              >
                                <Ionicons
                                  name="trash-outline"
                                  size={16}
                                  color={colors.muted}
                                />
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </KeyboardAwareScrollView>

            <View style={styles.stickyFooter}>
              <Pressable
                disabled={savingAvailability}
                onPress={() => void handleSaveBreaksModal()}
                style={({ pressed }) => [
                  styles.modalSaveBtn,
                  savingAvailability && { opacity: 0.5 },
                  pressed && styles.pressed,
                ]}
              >
                {savingAvailability ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Save breaks</Text>
                )}
              </Pressable>
            </View>

            {renderTimeDropdown('break')}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Manage Time Off Bottom-Sheet Modal */}
      <Modal
        visible={availabilityModal === 'time-off'}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setTimePickerTarget(null);
          setDatePickerField(null);
          setAvailabilityModal(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetBackdrop}
        >
          <Pressable
            style={styles.backdropOverlay}
            onPress={() => {
              setTimePickerTarget(null);
              setDatePickerField(null);
              setAvailabilityModal(null);
            }}
          />
          <Animated.View style={[styles.availabilitySheetContainer, { transform: [{ translateY: availabilitySheetTranslateY }] }]}>
            <View style={styles.sheetHandle} />
            <View style={[styles.headerNav, styles.availabilityHeaderNav]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={8}
                onPress={closeAvailabilityEditor}
                style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>
              <Text pointerEvents="none" style={[styles.headerTitleText, styles.availabilityHeaderTitle]}>Manage time off</Text>
            </View>

            <KeyboardAwareScrollView
              style={styles.availabilityScroll}
              contentContainerStyle={styles.passwordModalBody}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Title</Text>
                <TextInput
                  value={timeOffDraft.title}
                  onChangeText={(val) =>
                    setTimeOffDraft((prev) => ({ ...prev, title: val }))
                  }
                  onFocus={() => setFocusedField('timeOffTitle')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="e.g. Vacation, Doctor's appointment"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.textInput,
                    focusedField === 'timeOffTitle' && styles.inputFocused,
                  ]}
                />
              </View>

              <View style={styles.toggleLine}>
                <View style={styles.menuRowLeft}>
                  <Ionicons name="sunny-outline" size={17} color={colors.ink} />
                  <Text style={styles.toggleLineLabel}>All day</Text>
                </View>
                <Switch
                  value={timeOffDraft.allDay}
                  onValueChange={(val) =>
                    setTimeOffDraft((prev) => ({ ...prev, allDay: val }))
                  }
                  trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                  thumbColor={timeOffDraft.allDay ? colors.coral : '#fff'}
                />
              </View>

              <View style={styles.row2}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Start date (MM/DD/YY)</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select start date"
                    onPress={() => openDatePicker('startDate')}
                    style={({ pressed }) => [
                      styles.pickerFieldBtn,
                      datePickerField === 'startDate' && styles.inputFocused,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.pickerFieldLeft}>
                      <Ionicons name="calendar-outline" size={16} color={colors.muted} />
                      <Text style={styles.pickerFieldValue}>
                        {formatDateMmDdYy(timeOffDraft.startDate)}
                      </Text>
                    </View>
                    <Ionicons
                      name={datePickerField === 'startDate' ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={colors.muted}
                    />
                  </Pressable>
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>End date (MM/DD/YY)</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select end date"
                    onPress={() => openDatePicker('endDate')}
                    style={({ pressed }) => [
                      styles.pickerFieldBtn,
                      datePickerField === 'endDate' && styles.inputFocused,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.pickerFieldLeft}>
                      <Ionicons name="calendar-outline" size={16} color={colors.muted} />
                      <Text style={styles.pickerFieldValue}>
                        {formatDateMmDdYy(timeOffDraft.endDate)}
                      </Text>
                    </View>
                    <Ionicons
                      name={datePickerField === 'endDate' ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={colors.muted}
                    />
                  </Pressable>
                </View>
              </View>

              {/* Interactive Calendar Date Picker */}
              {datePickerField !== null ? (
                <View style={styles.calendarBox}>
                  <View style={styles.calendarHeader}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Previous month"
                      onPress={() => shiftCalendarMonth(-1)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.calendarNavBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="chevron-back" size={18} color={colors.ink} />
                    </Pressable>
                    <Text style={styles.calendarMonthTitle}>
                      {MONTH_NAMES[calendarViewMonth.month]} {calendarViewMonth.year}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Next month"
                      onPress={() => shiftCalendarMonth(1)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.calendarNavBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="chevron-forward" size={18} color={colors.ink} />
                    </Pressable>
                  </View>

                  <View style={styles.calendarWeekdaysRow}>
                    {WEEKDAY_SHORT.map((wd) => (
                      <Text key={wd} style={styles.calendarWeekdayText}>
                        {wd}
                      </Text>
                    ))}
                  </View>

                  <View style={styles.calendarGrid}>
                    {calendarCells.map((dayNum, cellIdx) => {
                      if (dayNum === null) {
                        return <View key={`empty-${cellIdx}`} style={styles.calendarDayCell} />;
                      }
                      const cellIso = toIsoDateString(
                        calendarViewMonth.year,
                        calendarViewMonth.month,
                        dayNum
                      );
                      const activeIso =
                        datePickerField === 'startDate'
                          ? timeOffDraft.startDate
                          : timeOffDraft.endDate;
                      const isSelected = cellIso === activeIso;
                      const isInRange =
                        cellIso >= timeOffDraft.startDate && cellIso <= timeOffDraft.endDate;
                      return (
                        <Pressable
                          key={`day-${dayNum}`}
                          onPress={() => handleSelectDate(dayNum)}
                          style={[
                            styles.calendarDayCell,
                            isInRange && styles.calendarDayCellInRange,
                            isSelected && styles.calendarDayCellSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.calendarDayText,
                              isInRange && styles.calendarDayTextInRange,
                              isSelected && styles.calendarDayTextSelected,
                            ]}
                          >
                            {dayNum}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {!timeOffDraft.allDay ? (
                <View style={styles.row2}>
                  <View style={[styles.fieldGroup, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>From time</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Select from time"
                      onPress={(e) =>
                        openTimeDropdown(e, {
                          kind: 'timeOff',
                          field: 'startTime',
                          current: timeOffDraft.startTime,
                          label: 'Select start time',
                        })
                      }
                      style={({ pressed }) => [
                        styles.pickerFieldBtn,
                        timePickerTarget?.kind === 'timeOff' &&
                          timePickerTarget.field === 'startTime' &&
                          styles.inputFocused,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.pickerFieldLeft}>
                        <Ionicons name="time-outline" size={16} color={colors.muted} />
                        <Text style={styles.pickerFieldValue}>
                          {formatTime12h(timeOffDraft.startTime)}
                        </Text>
                      </View>
                      <Ionicons
                        name={
                          timePickerTarget?.kind === 'timeOff' &&
                          timePickerTarget.field === 'startTime'
                            ? 'chevron-up'
                            : 'chevron-down'
                        }
                        size={14}
                        color={colors.muted}
                      />
                    </Pressable>
                  </View>
                  <View style={[styles.fieldGroup, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>To time</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Select to time"
                      onPress={(e) =>
                        openTimeDropdown(e, {
                          kind: 'timeOff',
                          field: 'endTime',
                          current: timeOffDraft.endTime,
                          label: 'Select end time',
                        })
                      }
                      style={({ pressed }) => [
                        styles.pickerFieldBtn,
                        timePickerTarget?.kind === 'timeOff' &&
                          timePickerTarget.field === 'endTime' &&
                          styles.inputFocused,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.pickerFieldLeft}>
                        <Ionicons name="time-outline" size={16} color={colors.muted} />
                        <Text style={styles.pickerFieldValue}>
                          {formatTime12h(timeOffDraft.endTime)}
                        </Text>
                      </View>
                      <Ionicons
                        name={
                          timePickerTarget?.kind === 'timeOff' &&
                          timePickerTarget.field === 'endTime'
                            ? 'chevron-up'
                            : 'chevron-down'
                        }
                        size={14}
                        color={colors.muted}
                      />
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Repeat</Text>
                <View style={styles.slotGrid}>
                  {REPEAT_OPTIONS.map((opt) => {
                    const selected = timeOffDraft.repeat === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() =>
                          setTimeOffDraft((prev) => ({ ...prev, repeat: opt.value }))
                        }
                        style={[styles.slotBoxThird, selected && styles.slotBoxSelected]}
                      >
                        <Text
                          style={[
                            styles.slotBoxText,
                            selected && styles.slotBoxTextSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </KeyboardAwareScrollView>

            <View style={styles.stickyFooter}>
              <Pressable
                disabled={savingAvailability}
                onPress={() => void handleAddTimeOff()}
                style={({ pressed }) => [
                  styles.modalSaveBtn,
                  savingAvailability && { opacity: 0.5 },
                  pressed && styles.pressed,
                ]}
              >
                {savingAvailability ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Add time off</Text>
                )}
              </Pressable>
            </View>

            {renderTimeDropdown('timeOff')}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Leave Confirmation Modal (Save, Continue Editing, Discard & Leave) */}
      <Modal
        visible={leaveConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaveConfirmOpen(false)}
      >
        <View style={styles.confirmBackdrop}>
          <Pressable
            style={styles.backdropOverlay}
            onPress={() => setLeaveConfirmOpen(false)}
          />
          <View style={styles.confirmDialogCard}>
            <View style={styles.confirmIconCircle}>
              <Ionicons name="save-outline" size={22} color={colors.coral} />
            </View>
            <Text style={styles.confirmTitle}>Save changes before leaving?</Text>
            <Text style={styles.confirmSubtitle}>
              Would you like to save your updates to {activeSection?.toLowerCase() ?? 'settings'}{' '}
              before going back?
            </Text>

            <View style={styles.confirmActionsStack}>
              <Pressable
                disabled={saving}
                onPress={() => void handleSave({ leaveAfterSave: true })}
                style={({ pressed }) => [
                  styles.confirmPrimaryBtn,
                  saving && { opacity: 0.5 },
                  pressed && styles.pressed,
                ]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                    <Text style={styles.confirmPrimaryBtnText}>Save changes</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => setLeaveConfirmOpen(false)}
                style={({ pressed }) => [styles.confirmSecondaryBtn, pressed && styles.pressed]}
              >
                <Text style={styles.confirmSecondaryBtnText}>Continue editing</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  resetFormToSaved();
                  setLeaveConfirmOpen(false);
                  leaveSettingsSection();
                }}
                style={({ pressed }) => [styles.confirmDestructiveBtn, pressed && styles.pressed]}
              >
                <Text style={styles.confirmDestructiveBtnText}>Discard & leave</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topHeader: {
    zIndex: 10001,
    height: 44,
    marginTop: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    backgroundColor: '#FFFFFF',
  },
  backChevronBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
  },
  pageTitle: {
    position: 'absolute',
    left: 58,
    right: 58,
    textAlign: 'center',
    color: colors.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  headerRightSpacer: {
    width: 36,
    height: 44,
  },
  topSaveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  rowPressed: {
    backgroundColor: '#F8F9FA',
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  settingsViewTransition: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: 14,
    paddingBottom: 48,
    gap: 12,
  },
  // Simple Settings Menu
  menuGroup: {
    backgroundColor: '#FFFFFF',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  menuRowLast: {},
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuRowTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  signOutText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
  },
  simpleCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  // Sub-page Sections & Form Fields (Border-free)
  sectionCard: {
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    gap: 14,
  },
  sectionHeading: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  bookingSection: {
    paddingBottom: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  bookingSectionLast: { paddingBottom: 12 },
  bookingSectionHeader: { gap: 3 },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  receiptPreview: {
    width: '100%',
    height: 190,
    borderRadius: 12,
    backgroundColor: colors.canvas,
  },
  receiptEmptyPreview: {
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    backgroundColor: colors.canvas,
  },
  receiptEmptyText: {
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: '600',
  },
  receiptUploadButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  receiptUploadButtonText: {
    color: colors.coral,
    fontSize: 12.5,
    fontWeight: '700',
  },
  disabledAction: {
    opacity: 0.55,
  },
  brandAssets: {
    gap: 12,
  },
  bannerUpload: {
    height: 116,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderRadius: 12,
    backgroundColor: '#E9E5E0',
  },
  bannerImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  bannerUploadOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
  },
  bannerUploadText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  logoUploadRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  logoPreview: {
    width: 56,
    height: 56,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.canvas,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoUploadCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  logoUploadTitle: {
    color: colors.ink,
    fontSize: 13.5,
    fontWeight: '700',
  },
  logoUploadHint: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 14,
  },
  logoUploadButton: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
  },
  logoUploadButtonText: {
    color: colors.coral,
    fontSize: 11.5,
    fontWeight: '700',
  },
  fieldGroup: {
    gap: 7,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  fieldHint: {
    color: colors.muted,
    fontSize: 11.5,
  },
  textInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: colors.ink,
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_400Regular',
  },
  multilineInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  lockedInput: {
    backgroundColor: '#F3F4F6',
    color: colors.muted,
  },
  inputFocused: {
    borderColor: colors.coral,
  },
  row2: {
    flexDirection: 'row',
    gap: 10,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCol: {
    width: '47.5%',
    flexGrow: 1,
    gap: 7,
  },
  gridColFull: {
    width: '100%',
    gap: 7,
  },
  affixInputWrap: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  affixTextInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 11,
    paddingVertical: 9,
    color: colors.ink,
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_400Regular',
  },
  inputSuffix: {
    paddingRight: 11,
    color: colors.muted,
    fontSize: 13,
  },
  inputPrefix: {
    paddingLeft: 11,
    color: colors.muted,
    fontSize: 13,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotBox: {
    width: '47.5%',
    flexGrow: 1,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotBoxThird: {
    width: '31%',
    flexGrow: 1,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotBoxSelected: {
    borderWidth: 1.5,
    borderColor: colors.coral,
    backgroundColor: '#FFF7F6',
  },
  slotBoxText: {
    color: colors.ink,
    fontSize: 12.5,
    fontWeight: '600',
  },
  slotBoxTextSelected: {
    color: colors.coral,
    fontWeight: '700',
  },
  swatchesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  // Business Hours
  sectionHeadingWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  hourDayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hourDayName: {
    color: colors.ink,
    fontSize: 13.5,
    fontWeight: '600',
  },
  hourInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeDropdownBtn: {
    minWidth: 88,
    height: 36,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  timeDropdownText: {
    color: colors.ink,
    fontSize: 12.5,
    fontWeight: '600',
  },
  timeInput: {
    width: 72,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    color: colors.ink,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
  },
  hourDash: {
    color: colors.muted,
    fontSize: 12,
  },
  closedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: '#F3F4F6',
  },
  closedBadgeText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  // Breaks & Time Off
  sectionHeaderActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  improvedActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#F9FAFB',
  },
  improvedActionBtnText: {
    color: colors.ink,
    fontSize: 12.5,
    fontWeight: '600',
  },
  improvedPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#FAD1CE',
    backgroundColor: '#FFF5F4',
  },
  improvedPrimaryBtnText: {
    color: colors.coral,
    fontSize: 12.5,
    fontWeight: '700',
  },
  summaryList: {
    backgroundColor: '#FFFFFF',
  },
  summaryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  breakPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    flex: 1,
  },
  breakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: '#F3F4F6',
  },
  breakPillText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '600',
  },
  availabilitySheetContainer: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  availabilityScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  manageBreaksBody: { paddingTop: 6 },
  breakDayGroup: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 8,
  },
  breakDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addBreakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: '#FFF5F4',
  },
  addBreakBtnText: {
    color: colors.coral,
    fontSize: 12.5,
    fontWeight: '600',
  },
  noBreaksText: {
    color: colors.muted,
    fontSize: 12.5,
  },
  breakRowsList: {
    gap: 8,
  },
  breakTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  removeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTimeOffBtn: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    backgroundColor: colors.coral,
    paddingHorizontal: 14,
  },
  addTimeOffBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  savedTimeOffList: {
    gap: 4,
    paddingTop: 4,
  },
  savedTimeOffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  savedTimeOffLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  savedTimeOffIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFF5F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedTimeOffTitle: {
    color: colors.ink,
    fontSize: 13.5,
    fontWeight: '600',
  },
  savedTimeOffMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  // Date & Time Picker Controls
  pickerFieldBtn: {
    minHeight: 44,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  pickerFieldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pickerFieldValue: {
    color: colors.ink,
    fontSize: 13.5,
    fontWeight: '600',
  },
  calendarBox: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  calendarWeekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarWeekdayText: {
    width: '14.28%',
    textAlign: 'center',
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 4,
  },
  calendarDayCell: {
    width: '14.28%',
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayCellInRange: {
    backgroundColor: '#FFF5F4',
  },
  calendarDayCellSelected: {
    backgroundColor: colors.coral,
  },
  calendarDayText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '500',
  },
  calendarDayTextInRange: {
    color: colors.coral,
    fontWeight: '600',
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  timeDropdownBtnActive: {
    borderColor: colors.coral,
    backgroundColor: '#FFF5F4',
  },
  timeDropdownTextActive: {
    color: colors.coral,
    fontWeight: '700',
  },
  floatingDropdownBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
  },
  floatingDropdownCard: {
    position: 'absolute',
    width: 120,
    maxHeight: 216,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 14,
    overflow: 'hidden',
    zIndex: 10000,
  },
  floatingDropdownScroll: {
    maxHeight: 216,
  },
  floatingDropdownScrollContent: {
    paddingVertical: 4,
  },
  floatingDropdownItem: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  floatingDropdownItemSelected: {
    backgroundColor: '#FFF5F4',
  },
  floatingDropdownItemText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '500',
  },
  floatingDropdownItemTextSelected: {
    color: colors.coral,
    fontWeight: '700',
  },
  // Leave Confirmation Dialog
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  confirmDialogCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  confirmIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF5F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  confirmTitle: {
    color: colors.ink,
    fontSize: 16.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  confirmSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 6,
  },
  confirmActionsStack: {
    width: '100%',
    gap: 8,
  },
  confirmPrimaryBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.coral,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmSecondaryBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmSecondaryBtnText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  confirmDestructiveBtn: {
    width: '100%',
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDestructiveBtnText: {
    color: colors.danger,
    fontSize: 13.5,
    fontWeight: '600',
  },
  // Toggles
  toggleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleHeaderCopy: { flex: 1, gap: 3 },
  preferenceGroup: { gap: 0, paddingTop: 2 },
  preferenceGroupLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingBottom: 5,
  },
  toggleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  toggleLineLast: { borderBottomWidth: 0 },
  toggleLineLabel: {
    flex: 1,
    color: colors.ink,
    fontSize: 13.5,
    fontWeight: '500',
  },
  // Security
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  outlineActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  outlineActionBtnText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  dangerOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  dangerOutlineBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  mfaActiveBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 12,
  },
  mfaActiveText: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '600',
  },
  mfaEnrollBox: {
    gap: 10,
    paddingTop: 4,
  },
  secretBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
  },
  secretText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  // Sticky Footer & Bottom Sheet Modal
  stickyFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  modalCancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  modalCancelBtnText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  modalSaveBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  modalSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    justifyContent: 'flex-end',
  },
  backdropOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D5D9DD',
    alignSelf: 'center',
    marginTop: 8,
  },
  passwordSheetContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  headerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  availabilityHeaderNav: {
    zIndex: 2,
    height: 44,
    paddingTop: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  availabilityHeaderTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
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
  passwordModalBody: {
    padding: 16,
    gap: 14,
  },
});
