import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Redirect, router, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';

const INDUSTRIES = [
  { id: 'nail-salon', label: 'Nail salon', icon: 'sparkles-outline' as const },
  { id: 'hair-salon', label: 'Hair salon', icon: 'cut-outline' as const },
  { id: 'barbershop', label: 'Barbershop', icon: 'person-outline' as const },
  { id: 'facial-spa', label: 'Facial & spa', icon: 'leaf-outline' as const },
  { id: 'makeup-studio', label: 'Makeup studio', icon: 'color-palette-outline' as const },
  { id: 'beauty-clinic', label: 'Beauty clinic', icon: 'medkit-outline' as const },
];

const TIME_ZONES = [
  { id: 'Asia/Manila', label: 'Philippine Time (GMT+8)' },
  { id: 'Asia/Singapore', label: 'Singapore Time (GMT+8)' },
  { id: 'Asia/Tokyo', label: 'Japan Time (GMT+9)' },
  { id: 'America/Los_Angeles', label: 'Pacific Time (US)' },
];

const CURRENCIES = [
  { id: 'PHP', label: 'Philippine Peso (₱ PHP)' },
  { id: 'USD', label: 'US Dollar ($ USD)' },
  { id: 'SGD', label: 'Singapore Dollar ($ SGD)' },
];

export default function OnboardingScreen() {
  const { session, loading, adminContext, completeOnboarding, signOut } = useApp();
  const meta = session?.user.user_metadata ?? {};

  const [step, setStep] = useState<1 | 2>(1);
  const [brandName, setBrandName] = useState(
    String(meta.business_name ?? '')
  );
  const [industry, setIndustry] = useState(
    String(meta.industry ?? 'nail-salon')
  );
  const [phone, setPhone] = useState(String(meta.phone ?? ''));
  const [timeZone, setTimeZone] = useState(
    String(meta.time_zone ?? 'Asia/Manila')
  );
  const [currency, setCurrency] = useState(
    String(meta.currency ?? 'PHP')
  );
  const [focused, setFocused] = useState<'brand' | 'phone' | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!loading && !session) {
    return <Redirect href="/sign-in" />;
  }
  if (!loading && adminContext.is_admin) {
    return <Redirect href={'/admin' as Href} />;
  }

  const canContinueStep1 = Boolean(brandName.trim() && industry && phone.trim());

  const handleFinish = async () => {
    setErrorMessage(null);
    setSaving(true);
    const err = await completeOnboarding({
      brandName: brandName.trim(),
      industry,
      phone: phone.trim(),
      timeZone,
      currency,
    });
    setSaving(false);
    if (err) {
      setErrorMessage(err);
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top Brand Row */}
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <View style={styles.logoShell}>
                <Image
                  source={require('../../assets/images/bookora-logo.png')}
                  style={styles.logo}
                  contentFit="contain"
                  accessibilityLabel="Bookora logo"
                />
              </View>
              <Text style={styles.brandName}>Bookora</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => void signOut()}
              style={styles.signOutButton}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>

          {/* Progress Indicator */}
          <View style={styles.progressSection}>
            <Text style={styles.stepEyebrow}>STEP {step} OF 2</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressDot, styles.progressDotActive]} />
              <View
                style={[
                  styles.progressDot,
                  step === 2 && styles.progressDotActive,
                ]}
              />
            </View>
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.card}>
              <View style={styles.headerBlock}>
                <Text accessibilityRole="header" style={styles.title}>
                  Let’s start with your brand
                </Text>
                <Text style={styles.subtitle}>
                  Tell us a few details so we can tailor your booking workspace.
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Brand name</Text>
                <View
                  style={[
                    styles.inputShell,
                    focused === 'brand' && styles.inputShellFocused,
                  ]}
                >
                  <Ionicons
                    name="storefront-outline"
                    size={18}
                    color={focused === 'brand' ? colors.coral : colors.muted}
                  />
                  <TextInput
                    accessibilityLabel="Brand name"
                    value={brandName}
                    onChangeText={setBrandName}
                    onFocus={() => setFocused('brand')}
                    onBlur={() => setFocused(null)}
                    placeholder="Glow Hair & Beauty Studio"
                    placeholderTextColor="#96918B"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Industry</Text>
                <View style={styles.industryGrid}>
                  {INDUSTRIES.map((item) => {
                    const active = industry === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        onPress={() => setIndustry(item.id)}
                        style={[
                          styles.industryChip,
                          active && styles.industryChipActive,
                        ]}
                      >
                        <Ionicons
                          name={item.icon}
                          size={17}
                          color={active ? colors.coral : colors.muted}
                        />
                        <Text
                          style={[
                            styles.industryChipText,
                            active && styles.industryChipTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Phone</Text>
                <View
                  style={[
                    styles.inputShell,
                    focused === 'phone' && styles.inputShellFocused,
                  ]}
                >
                  <Ionicons
                    name="call-outline"
                    size={18}
                    color={focused === 'phone' ? colors.coral : colors.muted}
                  />
                  <TextInput
                    accessibilityLabel="Phone number"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    onFocus={() => setFocused('phone')}
                    onBlur={() => setFocused(null)}
                    placeholder="+63 917 000 0000"
                    placeholderTextColor="#96918B"
                    style={styles.input}
                  />
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={!canContinueStep1}
                onPress={() => setStep(2)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                  !canContinueStep1 && styles.primaryButtonDisabled,
                ]}
              >
                <Text style={styles.primaryButtonText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF9F5" />
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.headerBlock}>
                <Text accessibilityRole="header" style={styles.title}>
                  Confirm your time zone and currency
                </Text>
                <Text style={styles.subtitle}>
                  You can change these later in Settings.
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Time zone</Text>
                <View style={styles.optionStack}>
                  {TIME_ZONES.map((tz) => {
                    const active = timeZone === tz.id;
                    return (
                      <Pressable
                        key={tz.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        onPress={() => setTimeZone(tz.id)}
                        style={[
                          styles.optionRow,
                          active && styles.optionRowActive,
                        ]}
                      >
                        <View style={styles.optionRowLeft}>
                          <Ionicons
                            name="globe-outline"
                            size={18}
                            color={active ? colors.coral : colors.muted}
                          />
                          <Text
                            style={[
                              styles.optionRowText,
                              active && styles.optionRowTextActive,
                            ]}
                          >
                            {tz.label}
                          </Text>
                        </View>
                        <Ionicons
                          name={active ? 'radio-button-on' : 'radio-button-off'}
                          size={19}
                          color={active ? colors.coral : colors.line}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Currency</Text>
                <View style={styles.optionStack}>
                  {CURRENCIES.map((curr) => {
                    const active = currency === curr.id;
                    return (
                      <Pressable
                        key={curr.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        onPress={() => setCurrency(curr.id)}
                        style={[
                          styles.optionRow,
                          active && styles.optionRowActive,
                        ]}
                      >
                        <View style={styles.optionRowLeft}>
                          <Ionicons
                            name="cash-outline"
                            size={18}
                            color={active ? colors.coral : colors.muted}
                          />
                          <Text
                            style={[
                              styles.optionRowText,
                              active && styles.optionRowTextActive,
                            ]}
                          >
                            {curr.label}
                          </Text>
                        </View>
                        <Ionicons
                          name={active ? 'radio-button-on' : 'radio-button-off'}
                          size={19}
                          color={active ? colors.coral : colors.line}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => setStep(1)}
                  style={({ pressed }) => [
                    styles.backButton,
                    pressed && styles.backButtonPressed,
                  ]}
                >
                  <Ionicons name="arrow-back" size={17} color={colors.ink} />
                  <Text style={styles.backButtonText}>Back</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => void handleFinish()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.finishButton,
                    pressed && styles.primaryButtonPressed,
                    saving && styles.primaryButtonDisabled,
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFF9F5" />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>Finish setup</Text>
                      <Ionicons name="checkmark-circle-outline" size={19} color="#FFF9F5" />
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  keyboard: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingTop: 20,
    paddingBottom: space.xxl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoShell: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
  },
  logo: { width: 32, height: 32 },
  brandName: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  signOutButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  signOutText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  stepEyebrow: {
    color: colors.coral,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  progressTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    width: 28,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.line,
  },
  progressDotActive: {
    backgroundColor: colors.coral,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.coralSoft,
    marginBottom: space.md,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  card: {
    gap: space.lg,
  },
  headerBlock: {
    gap: 6,
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13.5,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  inputShell: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  },
  inputShellFocused: {
    borderColor: colors.coral,
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    minHeight: 50,
    color: colors.ink,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    paddingVertical: 0,
    outlineStyle: 'none' as unknown as undefined,
  },
  industryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  industryChip: {
    width: '48.5%',
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  industryChipActive: {
    borderColor: colors.coral,
    backgroundColor: colors.coralSoft,
  },
  industryChipText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  industryChipTextActive: {
    color: colors.coral,
    fontWeight: '700',
  },
  optionStack: {
    gap: 8,
  },
  optionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  optionRowActive: {
    borderColor: colors.coral,
    backgroundColor: '#FFFFFF',
  },
  optionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionRowText: {
    color: colors.ink,
    fontSize: 13.5,
    fontWeight: '600',
  },
  optionRowTextActive: {
    color: colors.ink,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  backButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
  },
  backButtonPressed: {
    backgroundColor: '#F5F3EF',
  },
  backButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: colors.coral,
    paddingHorizontal: space.lg,
  },
  finishButton: {
    flex: 1,
  },
  primaryButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#FFF9F5',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
});

