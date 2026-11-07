import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type PropsWithChildren, type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { colors, radius, space } from '@/theme';

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
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor }]}>
      {fixedHeader}
      <KeyboardAwareScrollView
        stickyHeaderIndices={stickyHeaderIndices}
        contentContainerStyle={[styles.screen, style]}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.coral} /> : undefined
        }
      >
        {children}
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

export function LoadingState() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.coral} />
      <Text style={styles.emptyMessage}>Loading your workspace…</Text>
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
  screen: { paddingHorizontal: space.lg, paddingBottom: 120, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md, paddingTop: space.md },
  headerCopy: { flex: 1, gap: space.xs },
  eyebrow: { color: colors.coral, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.6 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: space.lg },
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
  loading: { flex: 1, justifyContent: 'center', padding: space.xxl, alignItems: 'center', gap: space.md, backgroundColor: colors.surface },
});
