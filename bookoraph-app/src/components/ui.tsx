import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { type ComponentProps, type PropsWithChildren, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { colors, radius, shadows, space } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  refreshing = false,
  onRefresh,
  style,
  stickyHeaderIndices,
  backgroundColor = colors.canvas,
  floatingAction,
  fixedHeader,
}: PropsWithChildren<{
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  stickyHeaderIndices?: number[];
  backgroundColor?: string;
  floatingAction?: ReactNode;
  fixedHeader?: ReactNode;
}>) {
  const scrollYRef = useRef(0);
  const pullStartYRef = useRef<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const pullThreshold = 58;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  };

  const webPullHandlers =
    Platform.OS === 'web' && onRefresh
      ? {
          onTouchStart: (event: GestureResponderEvent) => {
            if (scrollYRef.current <= 2 && !refreshing) {
              pullStartYRef.current = event.nativeEvent.touches?.[0]?.pageY ?? null;
            } else {
              pullStartYRef.current = null;
            }
          },
          onTouchMove: (event: GestureResponderEvent) => {
            if (pullStartYRef.current === null || refreshing) return;
            if (scrollYRef.current > 2) {
              pullStartYRef.current = null;
              setPullOffset(0);
              return;
            }
            const currentY = event.nativeEvent.touches?.[0]?.pageY ?? pullStartYRef.current;
            const delta = Math.max(0, currentY - pullStartYRef.current);
            if (delta > 6) {
              setPullOffset(Math.min(76, delta * 0.55));
            }
          },
          onTouchEnd: () => {
            if (pullStartYRef.current !== null && pullOffset >= pullThreshold && !refreshing) {
              onRefresh();
            }
            pullStartYRef.current = null;
            setPullOffset(0);
          },
          onTouchCancel: () => {
            pullStartYRef.current = null;
            setPullOffset(0);
          },
        }
      : {};

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor }]}>
      {fixedHeader}
      <KeyboardAwareScrollView
        stickyHeaderIndices={stickyHeaderIndices}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.screen, style]}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.coral} /> : undefined
        }
        {...webPullHandlers}
      >
        {Platform.OS === 'web' && onRefresh && (pullOffset > 0 || refreshing) ? (
          <View style={[styles.webPullBanner, { height: refreshing ? 44 : Math.max(28, pullOffset * 0.7) }]}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.coral} />
            ) : (
              <View style={styles.webPullRow}>
                <Ionicons
                  name={pullOffset >= pullThreshold ? 'arrow-up' : 'arrow-down'}
                  size={15}
                  color={colors.coral}
                />
                <Text style={styles.webPullText}>
                  {pullOffset >= pullThreshold ? 'Release to refresh' : 'Slide down to refresh'}
                </Text>
              </View>
            )}
          </View>
        ) : null}
        <View style={styles.screenInner}>{children}</View>
      </KeyboardAwareScrollView>
      {floatingAction}
    </SafeAreaView>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function GlassSurface({
  children,
  style,
  interactive = false,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; interactive?: boolean }>) {
  const glassAvailable = Platform.OS === 'ios' && isGlassEffectAPIAvailable();
  if (glassAvailable) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={interactive}
        style={[styles.glassSurface, style]}
      >
        {children}
      </GlassView>
    );
  }
  return <View style={[styles.glassFallback, style]}>{children}</View>;
}

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly { value: T; label: string; badge?: string | number }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.segmentTrack} accessibilityRole="tablist">
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.value)}
            style={({ pressed }) => [
              styles.segmentTab,
              selected && styles.segmentTabActive,
              pressed && !selected && { opacity: 0.72 },
            ]}
          >
            <Text style={[styles.segmentLabel, selected && styles.segmentLabelActive]} numberOfLines={1}>
              {item.label}
            </Text>
            {item.badge !== undefined ? (
              <View style={[styles.segmentBadge, selected && styles.segmentBadgeActive]}>
                <Text style={[styles.segmentBadgeText, selected && styles.segmentBadgeTextActive]}>
                  {item.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function NativeListGroup({
  title,
  footer,
  children,
}: PropsWithChildren<{ title?: string; footer?: string }>) {
  return (
    <View style={styles.listGroupWrap}>
      {title ? <Text style={styles.listGroupTitle}>{title}</Text> : null}
      <View style={styles.listGroupCard}>{children}</View>
      {footer ? <Text style={styles.listGroupFooter}>{footer}</Text> : null}
    </View>
  );
}

export function NativeListRow({
  icon,
  iconBg = colors.surfaceMuted,
  iconColor = colors.ink,
  title,
  subtitle,
  value,
  badge,
  chevron = true,
  destructive = false,
  disabled = false,
  first = false,
  onPress,
}: {
  icon?: IconName;
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  badge?: string | number;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  first?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        !first && styles.listRowBorder,
        disabled && styles.listRowDisabled,
        pressed && onPress && !disabled && styles.listRowPressed,
      ]}
    >
      {icon ? (
        <View style={[styles.listRowIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={17} color={destructive ? colors.danger : iconColor} />
        </View>
      ) : null}
      <View style={styles.listRowBody}>
        <Text style={[styles.listRowTitle, destructive && { color: colors.danger }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.listRowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.listRowRight}>
        {value ? (
          <Text style={styles.listRowValue} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {badge !== undefined ? (
          <View style={styles.listRowBadge}>
            <Text style={styles.listRowBadgeText}>{badge}</Text>
          </View>
        ) : null}
        {chevron && onPress ? <Ionicons name="chevron-forward" size={17} color="#B4ABA0" /> : null}
      </View>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  icon = 'add',
  secondary = false,
  danger = false,
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compactButton,
        secondary && styles.secondaryButton,
        danger && styles.dangerButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Ionicons name={icon} size={compact ? 15 : 17} color={danger ? colors.danger : secondary ? colors.ink : '#fff'} />
      <Text
        style={[
          styles.buttonText,
          compact && styles.compactButtonText,
          secondary && styles.secondaryButtonText,
          danger && styles.dangerButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({ name, onPress, label }: { name: IconName; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Ionicons name={name} size={20} color={colors.ink} />
    </Pressable>
  );
}

export function Metric({
  label,
  value,
  sublabel,
  icon,
  tone = 'coral',
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: IconName;
  tone?: 'coral' | 'mint' | 'lilac' | 'peach';
}) {
  const backgrounds = {
    coral: colors.coralSoft,
    mint: colors.mint,
    lilac: colors.lilac,
    peach: colors.peach,
  };
  return (
    <Card style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: backgrounds[tone] }]}>
        <Ionicons name={icon} size={19} color={colors.navy} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {sublabel ? <Text style={styles.metricSublabel}>{sublabel}</Text> : null}
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.replace(/_/g, ' ');
  const good = ['paid', 'approved', 'completed', 'active', 'sent', 'connected'].includes(status);
  const bad = ['failed', 'cancelled', 'no_show', 'blocked', 'revoked', 'error'].includes(status);
  const neutral = ['refunded', 'paused', 'disconnected', 'unpaid'].includes(status);
  return (
    <View style={[styles.badge, good && styles.goodBadge, bad && styles.badBadge, neutral && styles.neutralBadge]}>
      <Text
        style={[
          styles.badgeText,
          good && styles.goodBadgeText,
          bad && styles.badBadgeText,
          neutral && styles.neutralBadgeText,
        ]}
      >
        {normalized}
      </Text>
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.search, focused && styles.inputFocused]}>
      <Ionicons name="search" size={18} color={focused ? colors.coral : colors.muted} />
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor="#929AA2"
        style={styles.searchInput}
      />
      {value.length > 0 ? (
        <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Field({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline = false,
  secureTextEntry = false,
  editable = true,
  maxLength,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'decimal-pad' | 'numeric' | 'url';
  multiline?: boolean;
  secureTextEntry?: boolean;
  editable?: boolean;
  maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor="#929AA2"
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' || keyboardType === 'url' ? 'none' : 'sentences'}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        editable={editable}
        maxLength={maxLength}
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && styles.inputFocused,
          !editable && styles.inputLocked,
        ]}
      />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={24} color={colors.coral} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <View style={{ marginTop: space.sm }}>
          <Button label={actionLabel} onPress={onAction} compact />
        </View>
      ) : null}
    </Card>
  );
}

export function LoadingState({
  message = 'Loading…',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
} = {}) {
  const [spinAnim] = useState(() => new Animated.Value(0));
  const [isOffline, setIsOffline] = useState(() =>
    Platform.OS === 'web' && typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1050,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spinAnim]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 8000);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => clearTimeout(timer);
  }, []);

  const rotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (isOffline || timedOut) {
    return (
      <View style={styles.loading}>
        <View style={styles.emptyIcon}>
          <Ionicons name={isOffline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={26} color={colors.coral} />
        </View>
        <Text style={styles.emptyTitle}>
          {isOffline ? 'You appear to be offline' : 'Page is taking too long to respond'}
        </Text>
        <Text style={styles.emptyMessage}>
          {isOffline
            ? 'Please check your internet connection and try again.'
            : 'The page could not finish loading. Check your connection or retry.'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: space.sm }}>
          <Button
            label="Try Again"
            icon="refresh"
            compact
            onPress={() => {
              setTimedOut(false);
              if (onRetry) {
                onRetry();
              } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
          />
          {router.canGoBack() ? (
            <Button
              label="Go Back"
              icon="arrow-back"
              secondary
              compact
              onPress={() => router.back()}
            />
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.loading}>
      <View style={styles.logoSpinnerWrap}>
        <Animated.View style={[styles.logoSpinnerRing, { transform: [{ rotate }] }]} />
        <View style={styles.logoSpinnerInner}>
          <Image
            source={require('../../assets/images/bookora-logo.png')}
            style={styles.logoSpinnerImg}
            contentFit="contain"
          />
        </View>
      </View>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

export const uiStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  sectionHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  list: { gap: space.md },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  screen: { paddingHorizontal: space.lg, paddingBottom: 120 },
  screenInner: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: 14 },
  webPullBanner: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  webPullRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  webPullText: { color: colors.coral, fontSize: 12, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md, paddingTop: space.md },
  headerCopy: { flex: 1, gap: space.xs },
  eyebrow: { color: colors.coral, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.7 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.lg, ...shadows.card },
  glassSurface: { borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  glassFallback: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: Platform.OS === 'web' ? 'rgba(255, 255, 255, 0.88)' : colors.surface,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(16px)' } as ViewStyle) : shadows.card),
  },
  segmentTrack: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    gap: 4,
  },
  segmentTab: {
    flex: 1,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  segmentTabActive: {
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  segmentLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  segmentLabelActive: { color: colors.ink },
  segmentBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBadgeActive: { backgroundColor: colors.coralSoft },
  segmentBadgeText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  segmentBadgeTextActive: { color: colors.coral },
  listGroupWrap: { gap: 7 },
  listGroupTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    paddingHorizontal: 6,
  },
  listGroupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadows.card,
  },
  listGroupFooter: { color: colors.muted, fontSize: 12, lineHeight: 17, paddingHorizontal: 6 },
  listRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.surface,
  },
  listRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  listRowDisabled: { opacity: 0.52 },
  listRowPressed: { backgroundColor: '#F7F3ED' },
  listRowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  listRowBody: { flex: 1, gap: 2 },
  listRowTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  listRowSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  listRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '42%' },
  listRowValue: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  listRowBadge: {
    borderRadius: radius.pill,
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  listRowBadgeText: { color: colors.coral, fontSize: 11, fontWeight: '800' },
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    paddingHorizontal: space.lg,
    backgroundColor: colors.coral,
  },
  compactButton: { minHeight: 44, paddingHorizontal: space.md, borderRadius: 10 },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  dangerButton: { backgroundColor: colors.coralSoft, borderWidth: 1, borderColor: '#F5C4BE' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  compactButtonText: { fontSize: 12 },
  secondaryButtonText: { color: colors.ink },
  dangerButtonText: { color: colors.danger },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metric: { flex: 1, minWidth: '46%', gap: space.xs },
  metricIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  metricValue: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  metricLabel: { color: colors.ink, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  metricSublabel: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: colors.peach, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { color: colors.warning, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  goodBadge: { backgroundColor: colors.mint },
  goodBadgeText: { color: colors.success },
  badBadge: { backgroundColor: colors.coralSoft },
  badBadgeText: { color: colors.danger },
  neutralBadge: { backgroundColor: '#EFECE7' },
  neutralBadgeText: { color: colors.muted },
  search: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
  },
  searchInput: { flex: 1, color: colors.ink, fontFamily: 'SpaceGrotesk_400Regular', fontSize: 15 },
  field: { gap: 7 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  fieldHint: { color: colors.muted, fontSize: 11 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    color: colors.ink,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
  },
  inputFocused: {
    borderColor: colors.coral,
    backgroundColor: colors.surface,
  },
  inputLocked: {
    backgroundColor: '#F1EEE9',
    color: colors.muted,
  },
  multiline: { minHeight: 92, paddingTop: space.md, paddingBottom: space.md, textAlignVertical: 'top' },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.coralSoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  emptyMessage: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  loading: { flex: 1, justifyContent: 'center', padding: space.xxl, alignItems: 'center', gap: space.md, backgroundColor: '#FFFFFF' },
  logoSpinnerWrap: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoSpinnerRing: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    borderColor: '#FDE9E5',
    borderTopColor: colors.coral,
    borderRightColor: colors.coral,
  },
  logoSpinnerInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 11,
  },
  logoSpinnerImg: {
    width: 30,
    height: 30,
  },
});
