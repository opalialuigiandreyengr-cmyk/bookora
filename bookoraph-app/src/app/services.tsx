import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { goBackOrReplace } from '@/lib/navigation';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { EmptyState, SearchField } from '@/components/ui';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';
import type { Service, ServiceCategory } from '@/types';

const formatPrice = (value: string | number) => {
  if (String(value).trim().toLowerCase() === 'free') return 'Free';
  const raw = String(value).trim();
  if (/^php\s+/i.test(raw)) return raw.replace(/^php\s+/i, 'PHP ');
  const num = Number(raw.replace(/[^0-9.-]+/g, ''));
  if (!Number.isFinite(num) || num <= 0) return 'Free';
  return `PHP ${num.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const SERVICE_TONES = [
  { accent: '#E5857B', bg: '#FFF1F0', border: '#FADCD8', icon: colors.coral },
  { accent: '#9B7EDE', bg: '#F5F3FF', border: '#DDD6FE', icon: '#7C3AED' },
  { accent: '#4FB286', bg: '#ECFDF5', border: '#A7F3D0', icon: '#059669' },
  { accent: '#E5A970', bg: '#FFFBEB', border: '#FDE68A', icon: '#D97706' },
];

export default function Services() {
  const {
    businessProfile,
    services,
    categories,
    publicBookingUrl,
    addService,
    updateService,
    deleteService,
    duplicateService,
    toggleService,
    addCategory,
    updateCategory,
    deleteCategory,
    refreshing,
    refresh,
  } = useApp();

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Native Action Sheet state for Service & Category options
  const [actionSheetService, setActionSheetService] = useState<Service | null>(null);
  const [actionSheetCategory, setActionSheetCategory] = useState<ServiceCategory | null>(null);

  // Service Editor Modal State
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('60');
  const [bufferTime, setBufferTime] = useState('');
  const [price, setPrice] = useState('');
  const [categoryName, setCategoryName] = useState('Default services');
  const [showOnBookingPage, setShowOnBookingPage] = useState(true);
  const [depositType, setDepositType] = useState<'none' | 'fixed' | 'percentage'>('none');
  const [depositAmount, setDepositAmount] = useState('');
  const [savingService, setSavingService] = useState(false);

  // Category Modal State
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [categoryTitle, setCategoryTitle] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const activeSlug = useMemo(() => {
    if (businessProfile.slug?.trim()) return businessProfile.slug.trim();
    if (businessProfile.business_name?.trim()) {
      return businessProfile.business_name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
    }
    return 'nailsou';
  }, [businessProfile.slug, businessProfile.business_name]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((service) => {
      const matchesCategory =
        !selectedCategory ||
        service.category_id === selectedCategory ||
        service.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return [
        service.name,
        service.description || '',
        service.category || '',
        String(service.price),
      ].some((val) => val.toLowerCase().includes(q));
    });
  }, [services, query, selectedCategory]);

  const categoryChoices = useMemo(() => {
    const names = ['Default services', ...categories.map((c) => c.name)];
    return names.filter(
      (n, idx, arr) => arr.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === idx
    );
  }, [categories]);

  const openNewService = () => {
    setActionSheetService(null);
    setEditingService(null);
    setName('');
    setDescription('');
    setDuration('60');
    setBufferTime('');
    setPrice('');
    const currentCat = selectedCategory
      ? categories.find((c) => c.id === selectedCategory || c.name === selectedCategory)?.name
      : undefined;
    setCategoryName(currentCat || 'Default services');
    setShowOnBookingPage(true);
    setDepositType('none');
    setDepositAmount('');
    setServiceModalOpen(true);
  };

  const openEditService = (service: Service) => {
    setActionSheetService(null);
    setEditingService(service);
    setName(service.name);
    setDescription(service.description || '');
    setDuration(service.duration_minutes ? String(service.duration_minutes) : '60');
    setBufferTime(service.buffer_minutes ? String(service.buffer_minutes) : '');
    const rawPrice = String(service.price || '').replace(/^(PHP|₱)\s*/i, '');
    setPrice(rawPrice.toLowerCase() === 'free' || rawPrice === '0' ? '' : rawPrice);
    const catLabel =
      categories.find((c) => c.id === service.category_id)?.name ||
      (service.category && service.category !== 'General' ? service.category : 'Default services');
    setCategoryName(catLabel);
    setShowOnBookingPage(service.show_on_booking_page !== false);
    setDepositType(service.deposit_type || 'none');
    setDepositAmount(service.deposit_amount ? String(service.deposit_amount) : '');
    setServiceModalOpen(true);
  };

  const submitService = async () => {
    if (!name.trim()) {
      Alert.alert('Title required', 'Add a service name first.');
      return;
    }
    const depAmt = Math.max(0, Number(depositAmount) || 0);
    if (depositType === 'percentage' && depAmt > 100) {
      Alert.alert('Invalid deposit', 'Percentage deposit cannot exceed 100%.');
      return;
    }
    const matchedCat = categories.find((c) => c.name === categoryName);
    const formattedPrice = price.trim() && Number(price.trim()) > 0 ? `PHP ${price.trim()}` : 'Free';

    setSavingService(true);
    const payload = {
      name: name.trim(),
      description: description.trim(),
      category: categoryName === 'Default services' ? 'General' : categoryName,
      category_id: matchedCat?.id ?? null,
      duration_minutes: Math.max(5, parseInt(duration, 10) || 60),
      buffer_minutes: Math.max(0, parseInt(bufferTime, 10) || 0),
      price: formattedPrice,
      show_on_booking_page: showOnBookingPage,
      deposit_type: depositType,
      deposit_amount: depositType === 'none' ? 0 : depAmt,
    };

    const err = editingService
      ? await updateService(editingService.id, payload)
      : await addService(payload);
    setSavingService(false);

    if (err) {
      Alert.alert('Could not save service', err);
      return;
    }
    setServiceModalOpen(false);
    setEditingService(null);
  };

  const confirmDeleteService = (service: Service) => {
    setActionSheetService(null);
    Alert.alert('Delete service?', `Remove "${service.name}" from your services?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const err = await deleteService(service.id);
          if (err) Alert.alert('Could not delete service', err);
          else {
            setServiceModalOpen(false);
            setEditingService(null);
          }
        },
      },
    ]);
  };

  const handleDuplicate = async (service: Service) => {
    setActionSheetService(null);
    const err = await duplicateService(service);
    if (err) Alert.alert('Could not duplicate service', err);
  };

  const handleToggleVisibility = async (service: Service) => {
    setActionSheetService(null);
    const nextVisible = service.show_on_booking_page === false;
    const err = await toggleService(service.id, nextVisible);
    if (err) Alert.alert('Could not update visibility', err);
  };

  const copyOrShareBookingUrl = async (service?: Service) => {
    setActionSheetService(null);
    const url = service?.id
      ? `${publicBookingUrl}?service=${encodeURIComponent(service.id)}`
      : publicBookingUrl;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        Alert.alert(
          'Copied',
          service ? 'Direct service booking link copied!' : 'Booking link copied!'
        );
        return;
      }
      await Share.share({
        message: url,
        url,
      });
    } catch {
      // Share dismissed
    }
  };

  const openNewCategory = () => {
    setActionSheetCategory(null);
    setEditingCategory(null);
    setCategoryTitle('');
    setCategoryModalOpen(true);
  };

  const openEditCategory = (cat: ServiceCategory) => {
    setActionSheetCategory(null);
    setEditingCategory(cat);
    setCategoryTitle(cat.name);
    setCategoryModalOpen(true);
  };

  const submitCategory = async () => {
    if (!categoryTitle.trim()) {
      Alert.alert('Category title required', 'Enter a category title.');
      return;
    }
    setSavingCategory(true);
    const err = editingCategory
      ? await updateCategory(editingCategory.id, categoryTitle.trim())
      : await addCategory(categoryTitle.trim());
    setSavingCategory(false);
    if (err) {
      Alert.alert('Could not save category', err);
      return;
    }
    setCategoryModalOpen(false);
    setEditingCategory(null);
  };

  const confirmDeleteCategory = (cat: ServiceCategory) => {
    setActionSheetCategory(null);
    Alert.alert('Delete category?', `Delete "${cat.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const err = await deleteCategory(cat.id);
          if (err) Alert.alert('Could not delete category', err);
          else {
            if (selectedCategory === cat.id || selectedCategory === cat.name) {
              setSelectedCategory(null);
            }
            setCategoryModalOpen(false);
            setEditingCategory(null);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.page}>
      {/* Sticky Native Header: Back Chevron on Left, Centered "Services" Title, Coral "+" on Right */}
      <View style={styles.topHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => goBackOrReplace('/(tabs)/more')}
          hitSlop={8}
          style={({ pressed }) => [styles.backChevronBtn, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.pageTitle}>Services</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add service"
          onPress={openNewService}
          hitSlop={8}
          style={({ pressed }) => [styles.topAddBtn, pressed && styles.fabPressed]}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.coral} />
        }
      >
        {/* Booking Link + Team Filter Strip */}
        <View style={styles.topUtilityRow}>
          <Pressable
            onPress={() => void copyOrShareBookingUrl()}
            style={({ pressed }) => [styles.bookingLinkPill, pressed && styles.pressed]}
          >
            <View style={styles.bookingLinkBadge}>
              <Ionicons name="storefront-outline" size={13} color={colors.coral} />
            </View>
            <Text style={styles.bookingLinkText} numberOfLines={1}>
              {activeSlug}.bookoraph.com
            </Text>
            <Ionicons name="share-outline" size={16} color={colors.muted} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/staff')}
            style={({ pressed }) => [styles.teamChip, pressed && styles.pressed]}
          >
            <Ionicons name="people-outline" size={14} color={colors.ink} />
            <Text style={styles.teamChipText}>Team</Text>
          </Pressable>
        </View>

        {/* Native Search Bar */}
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search services or prices"
        />

        {/* Responsive Category Grid */}
        <View style={styles.categoryGrid}>
          <Pressable
            onPress={() => setSelectedCategory(null)}
            style={({ pressed }) => [
              styles.categoryGridBox,
              selectedCategory === null && styles.categoryGridBoxActive,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.categoryGridCopy}>
              <Text
                style={[
                  styles.categoryGridTitle,
                  selectedCategory === null && styles.categoryGridTitleActive,
                ]}
                numberOfLines={1}
              >
                All services
              </Text>
              <Text
                style={[
                  styles.categoryGridCount,
                  selectedCategory === null && styles.categoryGridCountActive,
                ]}
              >
                {services.length} {services.length === 1 ? 'service' : 'services'}
              </Text>
            </View>
          </Pressable>

          {categories.map((cat) => {
            const count = services.filter(
              (s) => s.category_id === cat.id || s.category === cat.name
            ).length;
            const isSelected = selectedCategory === cat.id || selectedCategory === cat.name;

            return (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCategory(isSelected ? null : cat.id)}
                onLongPress={() => setActionSheetCategory(cat)}
                style={({ pressed }) => [
                  styles.categoryGridBox,
                  isSelected && styles.categoryGridBoxActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.categoryGridCopy}>
                  <Text
                    style={[
                      styles.categoryGridTitle,
                      isSelected && styles.categoryGridTitleActive,
                    ]}
                    numberOfLines={1}
                  >
                    {cat.name}
                  </Text>
                  <Text
                    style={[
                      styles.categoryGridCount,
                      isSelected && styles.categoryGridCountActive,
                    ]}
                  >
                    {count} {count === 1 ? 'service' : 'services'}
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Category options for ${cat.name}`}
                  hitSlop={8}
                  onPress={(e) => {
                    e.stopPropagation();
                    setActionSheetCategory(cat);
                  }}
                  style={styles.categoryGridMoreBtn}
                >
                  <Ionicons
                    name="ellipsis-vertical"
                    size={14}
                    color={isSelected ? colors.coral : colors.muted}
                  />
                </Pressable>
              </Pressable>
            );
          })}

          <Pressable
            onPress={openNewCategory}
            style={({ pressed }) => [styles.newCategoryGridBox, pressed && styles.pressed]}
          >
            <Ionicons name="add-circle-outline" size={17} color={colors.coral} />
            <Text style={styles.newCategoryChipText}>New category</Text>
          </Pressable>
        </View>

        {/* Service Cards List */}
        <View style={styles.servicesList}>
          {visible.map((service, index) => {
            const tone = SERVICE_TONES[index % SERVICE_TONES.length];
            const isHidden = service.show_on_booking_page === false;
            const catLabel =
              categories.find((c) => c.id === service.category_id)?.name ||
              (service.category && service.category !== 'General' ? service.category : null);

            return (
              <Pressable
                key={service.id}
                onPress={() => openEditService(service)}
                style={({ pressed }) => [
                  styles.serviceCard,
                  { borderLeftColor: tone.accent },
                  pressed && styles.cardPressed,
                ]}
              >
                {/* Left Colored Icon Badge */}
                <View
                  style={[
                    styles.serviceIconBox,
                    { backgroundColor: tone.bg, borderColor: tone.border },
                  ]}
                >
                  <Ionicons name="cut-outline" size={17} color={tone.icon} />
                </View>

                {/* Middle Service Info */}
                <View style={styles.serviceInfo}>
                  <View style={styles.serviceTitleRow}>
                    <Text style={styles.serviceName} numberOfLines={1}>
                      {service.name}
                    </Text>
                    {isHidden ? (
                      <View style={styles.hiddenBadge}>
                        <Text style={styles.hiddenBadgeText}>Hidden</Text>
                      </View>
                    ) : catLabel ? (
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText} numberOfLines={1}>
                          {catLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {service.description ? (
                    <Text style={styles.serviceDescription} numberOfLines={1}>
                      {service.description}
                    </Text>
                  ) : null}

                  <View style={styles.serviceMetaRow}>
                    <Text style={styles.serviceMetaText}>
                      {service.duration_minutes} mins
                      {service.buffer_minutes ? ` (+${service.buffer_minutes}m)` : ''} ·{' '}
                      <Text style={styles.servicePriceText}>{formatPrice(service.price)}</Text>
                    </Text>
                    {service.deposit_type &&
                    service.deposit_type !== 'none' &&
                    service.deposit_amount ? (
                      <View style={styles.depositPill}>
                        <Text style={styles.depositPillText}>
                          {service.deposit_type === 'percentage'
                            ? `${service.deposit_amount}% deposit`
                            : `PHP ${service.deposit_amount} deposit`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Right Actions: Share Icon + Ellipsis Button */}
                <View style={styles.serviceCardActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Share link for ${service.name}`}
                    hitSlop={6}
                    onPress={(e) => {
                      e.stopPropagation();
                      void copyOrShareBookingUrl(service);
                    }}
                    style={({ pressed }) => [styles.shareIconBtn, pressed && styles.pressed]}
                  >
                    <Ionicons name="share-outline" size={16} color={colors.ink} />
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`More options for ${service.name}`}
                    hitSlop={8}
                    onPress={(e) => {
                      e.stopPropagation();
                      setActionSheetService(service);
                    }}
                    style={({ pressed }) => [styles.ellipsisBtn, pressed && styles.pressed]}
                  >
                    <Ionicons name="ellipsis-vertical" size={18} color={colors.ink} />
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </View>

        {!visible.length ? (
          <EmptyState
            icon="cut-outline"
            title="No services found"
            message="Add your first service so clients can book your offerings online."
            actionLabel="Add service"
            onAction={openNewService}
          />
        ) : null}
      </ScrollView>

      {/* Native Action Sheet Modal for Service Ellipsis (⋮) */}
      <Modal
        visible={Boolean(actionSheetService)}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSheetService(null)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.backdropOverlay}
            onPress={() => setActionSheetService(null)}
          />
          {actionSheetService ? (
            <View style={styles.actionSheetContainer}>
              <View style={styles.sheetHandle} />
              <View style={styles.actionSheetHeader}>
                <View style={styles.actionSheetTitleWrap}>
                  <Text style={styles.actionSheetTitle} numberOfLines={1}>
                    {actionSheetService.name}
                  </Text>
                  <Text style={styles.actionSheetSubtitle}>
                    {actionSheetService.duration_minutes} mins ·{' '}
                    {formatPrice(actionSheetService.price)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close menu"
                  onPress={() => setActionSheetService(null)}
                  style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="close" size={20} color={colors.ink} />
                </Pressable>
              </View>

              <View style={styles.actionSheetList}>
                <Pressable
                  onPress={() => openEditService(actionSheetService)}
                  style={({ pressed }) => [styles.actionSheetRow, pressed && styles.pressed]}
                >
                  <View style={[styles.actionSheetIcon, { backgroundColor: '#FFF1F0' }]}>
                    <Ionicons name="create-outline" size={18} color={colors.coral} />
                  </View>
                  <View style={styles.actionSheetRowCopy}>
                    <Text style={styles.actionSheetRowTitle}>Edit service</Text>
                    <Text style={styles.actionSheetRowSub}>
                      Update title, duration, price, or deposit rule
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>

                <Pressable
                  onPress={() => void handleDuplicate(actionSheetService)}
                  style={({ pressed }) => [styles.actionSheetRow, pressed && styles.pressed]}
                >
                  <View style={[styles.actionSheetIcon, { backgroundColor: '#F5F3FF' }]}>
                    <Ionicons name="copy-outline" size={18} color="#7C3AED" />
                  </View>
                  <View style={styles.actionSheetRowCopy}>
                    <Text style={styles.actionSheetRowTitle}>Duplicate service</Text>
                    <Text style={styles.actionSheetRowSub}>
                      Create a copy of this service in your catalog
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>

                <Pressable
                  onPress={() => void copyOrShareBookingUrl(actionSheetService)}
                  style={({ pressed }) => [styles.actionSheetRow, pressed && styles.pressed]}
                >
                  <View style={[styles.actionSheetIcon, { backgroundColor: '#ECFDF5' }]}>
                    <Ionicons name="link-outline" size={18} color="#059669" />
                  </View>
                  <View style={styles.actionSheetRowCopy}>
                    <Text style={styles.actionSheetRowTitle}>Copy direct booking link</Text>
                    <Text style={styles.actionSheetRowSub}>
                      Share a direct link to book this service
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>

                <Pressable
                  onPress={() => void handleToggleVisibility(actionSheetService)}
                  style={({ pressed }) => [styles.actionSheetRow, pressed && styles.pressed]}
                >
                  <View style={[styles.actionSheetIcon, { backgroundColor: '#FFFBEB' }]}>
                    <Ionicons
                      name={
                        actionSheetService.show_on_booking_page === false
                          ? 'eye-outline'
                          : 'eye-off-outline'
                      }
                      size={18}
                      color="#D97706"
                    />
                  </View>
                  <View style={styles.actionSheetRowCopy}>
                    <Text style={styles.actionSheetRowTitle}>
                      {actionSheetService.show_on_booking_page === false
                        ? 'Show on booking page'
                        : 'Hide from booking page'}
                    </Text>
                    <Text style={styles.actionSheetRowSub}>
                      {actionSheetService.show_on_booking_page === false
                        ? 'Make this service bookable online again'
                        : 'Temporarily hide from public booking page'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>

                <Pressable
                  onPress={() => confirmDeleteService(actionSheetService)}
                  style={({ pressed }) => [
                    styles.actionSheetRow,
                    styles.actionSheetRowDanger,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.actionSheetIcon, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </View>
                  <View style={styles.actionSheetRowCopy}>
                    <Text style={[styles.actionSheetRowTitle, { color: colors.danger }]}>
                      Delete service
                    </Text>
                    <Text style={styles.actionSheetRowSub}>
                      Permanently remove this service
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Native Action Sheet Modal for Category Options */}
      <Modal
        visible={Boolean(actionSheetCategory)}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSheetCategory(null)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.backdropOverlay}
            onPress={() => setActionSheetCategory(null)}
          />
          {actionSheetCategory ? (
            <View style={styles.actionSheetContainer}>
              <View style={styles.sheetHandle} />
              <View style={styles.actionSheetHeader}>
                <View style={styles.actionSheetTitleWrap}>
                  <Text style={styles.actionSheetTitle} numberOfLines={1}>
                    {actionSheetCategory.name}
                  </Text>
                  <Text style={styles.actionSheetSubtitle}>Service category</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close category options"
                  onPress={() => setActionSheetCategory(null)}
                  style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="close" size={20} color={colors.ink} />
                </Pressable>
              </View>

              <View style={styles.actionSheetList}>
                <Pressable
                  onPress={() => openEditCategory(actionSheetCategory)}
                  style={({ pressed }) => [styles.actionSheetRow, pressed && styles.pressed]}
                >
                  <View style={[styles.actionSheetIcon, { backgroundColor: '#FFF1F0' }]}>
                    <Ionicons name="create-outline" size={18} color={colors.coral} />
                  </View>
                  <View style={styles.actionSheetRowCopy}>
                    <Text style={styles.actionSheetRowTitle}>Edit category name</Text>
                    <Text style={styles.actionSheetRowSub}>Rename this service category</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>

                <Pressable
                  onPress={() => confirmDeleteCategory(actionSheetCategory)}
                  style={({ pressed }) => [
                    styles.actionSheetRow,
                    styles.actionSheetRowDanger,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.actionSheetIcon, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </View>
                  <View style={styles.actionSheetRowCopy}>
                    <Text style={[styles.actionSheetRowTitle, { color: colors.danger }]}>
                      Delete category
                    </Text>
                    <Text style={styles.actionSheetRowSub}>
                      Services in this category will remain in your catalog
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* New / Edit Service Modal (All form fields guaranteed visible) */}
      <Modal
        visible={serviceModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setServiceModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetBackdrop}
        >
          <Pressable
            style={styles.backdropOverlay}
            onPress={() => setServiceModalOpen(false)}
          />
          <View style={styles.editorSheetContainer}>
            <View style={styles.sheetHandle} />
            <View style={styles.headerNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to services"
                onPress={() => setServiceModalOpen(false)}
                style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>

              <Text style={styles.headerTitleText}>
                {editingService ? 'Edit service' : 'New service'}
              </Text>

              {editingService ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete service"
                  onPress={() => confirmDeleteService(editingService)}
                  style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="trash-outline" size={19} color={colors.danger} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={() => setServiceModalOpen(false)}
                  style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="close" size={20} color={colors.ink} />
                </Pressable>
              )}
            </View>

            <KeyboardAwareScrollView
              style={styles.editorScroll}
              contentContainerStyle={styles.sheetBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Service Image Upload Block */}
              <View style={styles.serviceImageField}>
                <View style={styles.serviceImagePlaceholder}>
                  <Ionicons name="image-outline" size={24} color={colors.ink} />
                </View>
                <View style={styles.serviceImageCopy}>
                  <Text style={styles.serviceImageLabel}>Service image</Text>
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        'Service image',
                        'Choose a JPG or PNG image up to 5MB in your web workspace.'
                      )
                    }
                    style={({ pressed }) => [styles.serviceUploadBtn, pressed && styles.pressed]}
                  >
                    <Ionicons name="image-outline" size={15} color={colors.ink} />
                    <Text style={styles.serviceUploadBtnText}>Upload</Text>
                  </Pressable>
                  <Text style={styles.serviceUploadHint}>JPG or PNG · Up to 5MB in size.</Text>
                </View>
              </View>

              {/* Title */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Title <Text style={styles.requiredMark}>*</Text>
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setFocusedField('serviceName')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="e.g. Softgel Extension"
                  placeholderTextColor={colors.muted}
                  style={[styles.textInput, focusedField === 'serviceName' && styles.inputFocused]}
                />
              </View>

              {/* Subtitle / Note */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Subtitle / Note</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  onFocus={() => setFocusedField('serviceDesc')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Optional service description"
                  placeholderTextColor={colors.muted}
                  style={[styles.textInput, focusedField === 'serviceDesc' && styles.inputFocused]}
                />
              </View>

              {/* Duration + Buffer time + Cost */}
              <View style={styles.detailsGrid}>
                <View style={styles.gridCol}>
                  <Text style={styles.fieldLabel}>Duration</Text>
                  <View
                    style={[
                      styles.affixInputWrap,
                      focusedField === 'duration' && styles.inputFocused,
                    ]}
                  >
                    <TextInput
                      value={duration}
                      onChangeText={setDuration}
                      onFocus={() => setFocusedField('duration')}
                      onBlur={() => setFocusedField(null)}
                      keyboardType="number-pad"
                      placeholder="60"
                      placeholderTextColor={colors.muted}
                      style={styles.affixTextInput}
                    />
                    <Text style={styles.inputSuffix}>mins</Text>
                  </View>
                </View>

                <View style={styles.gridCol}>
                  <Text style={styles.fieldLabel}>Buffer time</Text>
                  <View
                    style={[
                      styles.affixInputWrap,
                      focusedField === 'buffer' && styles.inputFocused,
                    ]}
                  >
                    <TextInput
                      value={bufferTime}
                      onChangeText={setBufferTime}
                      onFocus={() => setFocusedField('buffer')}
                      onBlur={() => setFocusedField(null)}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                      style={styles.affixTextInput}
                    />
                    <Text style={styles.inputSuffix}>mins</Text>
                  </View>
                </View>

                <View style={styles.gridColFull}>
                  <Text style={styles.fieldLabel}>Cost</Text>
                  <View
                    style={[
                      styles.affixInputWrap,
                      focusedField === 'price' && styles.inputFocused,
                    ]}
                  >
                    <Text style={styles.inputPrefix}>PHP</Text>
                    <TextInput
                      value={price}
                      onChangeText={setPrice}
                      onFocus={() => setFocusedField('price')}
                      onBlur={() => setFocusedField(null)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                      style={styles.affixTextInput}
                    />
                  </View>
                </View>
              </View>

              {/* Category Slot Grid */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Category</Text>
                <View style={styles.slotGrid}>
                  {categoryChoices.map((cat) => {
                    const selected = categoryName.toLowerCase() === cat.toLowerCase();
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => setCategoryName(cat)}
                        style={[styles.slotBox, selected && styles.slotBoxSelected]}
                      >
                        <Text
                          style={[styles.slotBoxText, selected && styles.slotBoxTextSelected]}
                          numberOfLines={1}
                        >
                          {cat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Show on booking page */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleRowCopy}>
                  <Text style={styles.toggleRowTitle}>Show on booking page</Text>
                  <Text style={styles.toggleRowSub}>Let customers book this service online</Text>
                </View>
                <Switch
                  value={showOnBookingPage}
                  onValueChange={setShowOnBookingPage}
                  trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                  thumbColor={showOnBookingPage ? colors.coral : '#fff'}
                />
              </View>

              {/* Deposit rule fieldset */}
              <View style={styles.depositFieldset}>
                <Text style={styles.depositLegend}>Deposit rule</Text>
                <Text style={styles.depositHelp}>
                  Override the business default for this service.
                </Text>

                <Text style={styles.fieldLabel}>Deposit type</Text>
                <View style={styles.slotGrid}>
                  {(
                    [
                      { key: 'none', label: 'No deposit' },
                      { key: 'fixed', label: 'Fixed amount' },
                      { key: 'percentage', label: 'Percentage' },
                    ] as const
                  ).map((item) => {
                    const selected = depositType === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => setDepositType(item.key)}
                        style={[styles.slotBoxThird, selected && styles.slotBoxSelected]}
                      >
                        <Text
                          style={[styles.slotBoxText, selected && styles.slotBoxTextSelected]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {depositType !== 'none' ? (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>
                      {depositType === 'percentage' ? 'Percentage' : 'Amount'}
                    </Text>
                    <View
                      style={[
                        styles.affixInputWrap,
                        focusedField === 'depositAmount' && styles.inputFocused,
                      ]}
                    >
                      <Text style={styles.inputPrefix}>
                        {depositType === 'percentage' ? '%' : 'PHP'}
                      </Text>
                      <TextInput
                        value={depositAmount}
                        onChangeText={setDepositAmount}
                        onFocus={() => setFocusedField('depositAmount')}
                        onBlur={() => setFocusedField(null)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.muted}
                        style={styles.affixTextInput}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            </KeyboardAwareScrollView>

            {/* Sticky Modal Actions */}
            <View style={styles.serviceModalActions}>
              <Pressable
                onPress={() => setServiceModalOpen(false)}
                style={({ pressed }) => [styles.modalCancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={savingService}
                onPress={() => void submitService()}
                style={({ pressed }) => [
                  styles.modalSaveBtn,
                  savingService && { opacity: 0.5 },
                  pressed && styles.pressed,
                ]}
              >
                {savingService ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>
                    {editingService ? 'Save changes' : 'Add service'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* New / Edit Category Bottom-Sheet Modal */}
      <Modal
        visible={categoryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetBackdrop}
        >
          <Pressable
            style={styles.backdropOverlay}
            onPress={() => setCategoryModalOpen(false)}
          />
          <View style={styles.categorySheetContainer}>
            <View style={styles.sheetHandle} />
            <View style={styles.headerNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={() => setCategoryModalOpen(false)}
                style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>
              <Text style={styles.headerTitleText}>
                {editingCategory ? 'Edit category' : 'New category'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close modal"
                onPress={() => setCategoryModalOpen(false)}
                style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <View style={styles.categoryModalBody}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Category title</Text>
                <TextInput
                  value={categoryTitle}
                  onChangeText={setCategoryTitle}
                  onFocus={() => setFocusedField('categoryTitle')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="e.g. Hair services"
                  placeholderTextColor={colors.muted}
                  style={[styles.textInput, focusedField === 'categoryTitle' && styles.inputFocused]}
                />
              </View>
            </View>

            <View style={styles.serviceModalActions}>
              <Pressable
                onPress={() => setCategoryModalOpen(false)}
                style={({ pressed }) => [styles.modalCancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={savingCategory}
                onPress={() => void submitCategory()}
                style={({ pressed }) => [
                  styles.modalSaveBtn,
                  savingCategory && { opacity: 0.5 },
                  pressed && styles.pressed,
                ]}
              >
                {savingCategory ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>
                    {editingCategory ? 'Save changes' : 'Add category'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  backChevronBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  topAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#17212B',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  fabPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  pressed: {
    opacity: 0.72,
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: 12,
    paddingBottom: 60,
    gap: 12,
  },
  // Top Utility Row (Public Booking Link + Team Filter)
  topUtilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bookingLinkPill: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#F8F9FA',
  },
  bookingLinkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF1F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingLinkText: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  teamChip: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  teamChipText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  // Responsive Category Grid
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryGridBox: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 140,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  categoryGridBoxActive: {
    borderWidth: 1.5,
    borderColor: colors.coral,
    backgroundColor: '#FFF7F6',
  },
  categoryGridCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  categoryGridTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  categoryGridTitleActive: {
    color: colors.coral,
  },
  categoryGridCount: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '500',
  },
  categoryGridCountActive: {
    color: colors.coral,
  },
  categoryGridMoreBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newCategoryGridBox: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 140,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.coral,
    backgroundColor: '#FFF7F6',
  },
  newCategoryChipText: {
    color: colors.coral,
    fontSize: 12.5,
    fontWeight: '700',
  },
  // Service Cards
  servicesList: {
    gap: 10,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 3.5,
    backgroundColor: '#FFFFFF',
  },
  cardPressed: {
    backgroundColor: '#F8F9FA',
    transform: [{ scale: 0.995 }],
  },
  serviceIconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  serviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  serviceName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  categoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: '#F3F4F6',
    maxWidth: 100,
  },
  categoryBadgeText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  hiddenBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: '#FEF2F2',
  },
  hiddenBadgeText: {
    color: colors.danger,
    fontSize: 10,
    fontWeight: '700',
  },
  serviceDescription: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  serviceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 1,
  },
  serviceMetaText: {
    color: colors.muted,
    fontSize: 13,
  },
  servicePriceText: {
    color: colors.ink,
    fontWeight: '700',
  },
  depositPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    backgroundColor: '#FFF7F6',
    borderWidth: 1,
    borderColor: '#FADCD8',
  },
  depositPillText: {
    color: colors.coral,
    fontSize: 10,
    fontWeight: '700',
  },
  serviceCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shareIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ellipsisBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modals & Native Action Sheets
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
  actionSheetContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 24,
    overflow: 'hidden',
  },
  actionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  actionSheetTitleWrap: {
    flex: 1,
    gap: 2,
  },
  actionSheetTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  actionSheetSubtitle: {
    color: colors.muted,
    fontSize: 12.5,
  },
  actionSheetList: {
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 4,
  },
  actionSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  actionSheetRowDanger: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#FEE2E2',
    paddingTop: 14,
  },
  actionSheetIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetRowCopy: {
    flex: 1,
    gap: 1,
  },
  actionSheetRowTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  actionSheetRowSub: {
    color: colors.muted,
    fontSize: 12,
  },
  // Service Form Bottom Sheet
  editorSheetContainer: {
    width: '100%',
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  categorySheetContainer: {
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
  editorScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetBodyContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  categoryModalBody: {
    padding: 16,
    gap: 14,
  },
  serviceImageField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  serviceImagePlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceImageCopy: {
    flex: 1,
    gap: 5,
  },
  serviceImageLabel: {
    color: colors.ink,
    fontSize: 13.5,
    fontWeight: '700',
  },
  serviceUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  serviceUploadBtnText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  serviceUploadHint: {
    color: colors.muted,
    fontSize: 11.5,
  },
  fieldGroup: {
    gap: 7,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  requiredMark: {
    color: colors.coral,
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
  inputFocused: {
    borderColor: colors.coral,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
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
    width: '48.2%',
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  toggleRowCopy: {
    flex: 1,
    gap: 3,
  },
  toggleRowTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  toggleRowSub: {
    color: colors.muted,
    fontSize: 12,
  },
  depositFieldset: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    gap: 10,
  },
  depositLegend: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  depositHelp: {
    color: colors.muted,
    fontSize: 12,
    marginTop: -4,
  },
  serviceModalActions: {
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
});
