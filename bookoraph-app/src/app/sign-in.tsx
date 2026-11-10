import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Redirect, router, type Href } from 'expo-router';
import { type ElementRef, useRef, useState } from 'react';
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
import { GoogleIcon } from '@/components/google-icon';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';

type FocusedField = 'email' | 'password' | null;
type AuthMode = 'signin' | 'signup' | 'reset';

export default function SignIn() {
  const { session, loading, needsOnboarding, adminContext, configured, signIn, signUp, signInWithGoogle, resetPassword } = useApp();
  const passwordRef = useRef<ElementRef<typeof TextInput>>(null);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<FocusedField>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  if (session && !loading) {
    if (adminContext.is_admin) return <Redirect href={'/admin' as Href} />;
    return <Redirect href={needsOnboarding ? '/onboarding' : '/(tabs)'} />;
  }

  const normalizedEmail = email.trim();

  const submit = async () => {
    setMessage(null);
    if (!configured) {
      setMessage({ type: 'error', text: 'This app build is missing its Supabase connection. Restart Expo after adding the environment variables.' });
      return;
    }
    if (!normalizedEmail || !password) {
      setMessage({ type: 'error', text: 'Enter the email and password for your Bookora account.' });
      return;
    }
    setSubmitting(true);
    if (mode === 'signup') {
      const error = await signUp({
        email: normalizedEmail,
        password,
      });
      if (error) {
        setSubmitting(false);
        setMessage({ type: 'error', text: error });
        return;
      }
      // Attempt immediate sign-in if session wasn't automatically established
      const signInErr = await signIn(normalizedEmail, password);
      setSubmitting(false);
      if (!signInErr) {
        router.replace('/onboarding');
        return;
      }
      setMessage({ type: 'success', text: 'Account created! Check your inbox to confirm your email, then sign in to finish onboarding.' });
      return;
    }
    const error = await signIn(normalizedEmail, password);
    setSubmitting(false);
    if (error) {
      setMessage({ type: 'error', text: error === 'Invalid login credentials' ? 'That email or password does not match your Bookora account.' : error });
      return;
    }
    router.replace('/');
  };

  const sendReset = async () => {
    setMessage(null);
    if (!normalizedEmail) {
      setMessage({ type: 'error', text: 'Enter the email address connected to your Bookora account.' });
      return;
    }
    setSubmitting(true);
    const error = await resetPassword(normalizedEmail);
    setSubmitting(false);
    setMessage(error
      ? { type: 'error', text: error }
      : { type: 'success', text: 'Reset link sent. Check your inbox to choose a new password.' });
  };

  const continueWithGoogle = async () => {
    setMessage(null);
    if (!configured) {
      setMessage({ type: 'error', text: 'This app build is missing its Supabase connection. Restart Expo after adding the environment variables.' });
      return;
    }
    setGoogleSubmitting(true);
    const result = await signInWithGoogle();
    setGoogleSubmitting(false);
    if (result.status === 'error') {
      setMessage({ type: 'error', text: result.message });
      return;
    }
    if (result.status === 'success') router.replace('/(tabs)');
  };

  const resetView = mode === 'reset';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView
          automaticallyAdjustKeyboardInsets={false}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <View style={styles.logoShell}>
              <Image source={require('../../assets/images/bookora-logo.png')} style={styles.logo} contentFit="contain" accessibilityLabel="Bookora logo" />
            </View>
            <Text style={styles.brandName}>Bookora</Text>
          </View>

          <View style={styles.intro}>
            <Text accessibilityRole="header" style={styles.title}>
              {mode === 'reset' ? 'Reset your password.' : mode === 'signup' ? 'Build your workspace.' : 'Welcome back.'}
            </Text>
            <Text style={styles.introText}>
              {resetView
                ? 'Enter your account email and we’ll send a secure reset link.'
                : mode === 'signup'
                  ? 'Set up your business and start managing bookings in one place.'
                  : 'Sign in to manage today’s bookings, clients, and payments.'}
            </Text>
          </View>

          <View style={styles.formPanel}>
            {!resetView ? (
              <View style={styles.authSwitch}>
                {(['signin', 'signup'] as const).map((authMode) => (
                  <Pressable
                    key={authMode}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === authMode }}
                    onPress={() => { setMode(authMode); setMessage(null); }}
                    style={[styles.authSwitchItem, mode === authMode && styles.authSwitchItemActive]}
                  >
                    <Text style={[styles.authSwitchText, mode === authMode && styles.authSwitchTextActive]}>
                      {authMode === 'signin' ? 'Sign in' : 'Create account'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {!configured ? <StatusMessage type="error" text="Supabase is not configured for this build. Restart Expo after adding the public variables." /> : null}
            {message ? <StatusMessage type={message.type} text={message.text} /> : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email address</Text>
              <View style={[styles.inputShell, focused === 'email' && styles.inputShellFocused, message?.type === 'error' && !normalizedEmail && styles.inputShellError]}>
                <Ionicons name="mail-outline" size={18} color={focused === 'email' ? colors.coral : colors.muted} />
                <TextInput
                  accessibilityLabel="Email address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onBlur={() => setFocused(null)}
                  onChangeText={(value) => { setEmail(value); if (message?.type === 'error') setMessage(null); }}
                  onFocus={() => setFocused('email')}
                  onSubmitEditing={() => resetView ? void sendReset() : passwordRef.current?.focus()}
                  placeholder="you@business.com"
                  placeholderTextColor="#96918B"
                  returnKeyType={resetView ? 'send' : 'next'}
                  style={styles.input}
                  value={email}
                />
              </View>
            </View>

            {!resetView ? <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Password</Text>
                {mode === 'signin' ? (
                  <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { setMode('reset'); setMessage(null); }}><Text style={styles.forgotText}>Forgot password?</Text></Pressable>
                ) : null}
              </View>
              <View style={[styles.inputShell, focused === 'password' && styles.inputShellFocused, message?.type === 'error' && !password && styles.inputShellError]}>
                <Ionicons name="lock-closed-outline" size={18} color={focused === 'password' ? colors.coral : colors.muted} />
                <TextInput
                  ref={passwordRef}
                  accessibilityLabel="Password"
                  autoCapitalize="none"
                  autoComplete="current-password"
                  onBlur={() => setFocused(null)}
                  onChangeText={(value) => { setPassword(value); if (message?.type === 'error') setMessage(null); }}
                  onFocus={() => setFocused('password')}
                  onSubmitEditing={() => void submit()}
                  placeholder="Enter your password"
                  placeholderTextColor="#96918B"
                  returnKeyType="go"
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  value={password}
                />
                <Pressable accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} accessibilityRole="button" hitSlop={10} onPress={() => setShowPassword((current) => !current)} style={styles.eyeButton}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
                </Pressable>
              </View>
            </View> : null}

            <Pressable
              accessibilityRole="button"
              disabled={submitting || googleSubmitting || !configured}
              onPress={() => void (resetView ? sendReset() : submit())}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed, (submitting || googleSubmitting || !configured) && styles.primaryButtonDisabled]}
            >
              {submitting ? <ActivityIndicator color="#FFF9F5" /> : <><Text style={styles.primaryButtonText}>{resetView ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Sign in'}</Text><Ionicons name={resetView ? 'mail-outline' : 'arrow-forward'} size={19} color="#FFF9F5" /></>}
            </Pressable>

            {!resetView ? <>
              <View style={styles.divider} accessibilityElementsHidden>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              <Pressable
                accessibilityLabel="Continue with Google"
                accessibilityRole="button"
                disabled={submitting || googleSubmitting || !configured}
                onPress={() => void continueWithGoogle()}
                style={({ pressed }) => [styles.googleButton, pressed && styles.googleButtonPressed, (submitting || googleSubmitting || !configured) && styles.googleButtonDisabled]}
              >
                {googleSubmitting ? <ActivityIndicator color={colors.ink} /> : <><GoogleIcon size={18} /><Text style={styles.googleButtonText}>Continue with Google</Text></>}
              </Pressable>
            </> : null}

            {resetView ? <Pressable accessibilityRole="button" onPress={() => { setMode('signin'); setMessage(null); }} style={styles.secondaryButton}><Ionicons name="arrow-back" size={17} color={colors.ink} /><Text style={styles.secondaryButtonText}>Back to sign in</Text></Pressable> : null}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By continuing, you agree to Bookora’s Terms and Conditions.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StatusMessage({ type, text }: { type: 'error' | 'success'; text: string }) {
  const success = type === 'success';
  return <View accessibilityLiveRegion="polite" style={[styles.status, success && styles.statusSuccess]}><Ionicons name={success ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={19} color={success ? colors.success : colors.danger} /><Text style={[styles.statusText, success && styles.statusTextSuccess]}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  keyboard: { flex: 1 },
  scrollContent: { flexGrow: 1, width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: space.lg, paddingTop: 24, paddingBottom: space.xl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoShell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  logo: { width: 34, height: 34 },
  brandName: { color: colors.ink, fontSize: 18, lineHeight: 22, fontWeight: '800', letterSpacing: -0.35 },
  intro: { gap: 8, marginBottom: space.xl, paddingHorizontal: space.xs },
  title: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  introText: { maxWidth: 350, color: colors.muted, fontSize: 13, lineHeight: 19 },
  formPanel: { gap: space.lg },
  authSwitch: { flexDirection: 'row', borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, padding: 4, gap: 4 },
  authSwitchItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'transparent' },
  authSwitchItemActive: { backgroundColor: '#FFFFFF', borderColor: colors.coral, shadowColor: '#17212B', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  authSwitchText: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
  authSwitchTextActive: { color: colors.ink },
  fieldGroup: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  label: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  forgotText: { color: colors.coral, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  inputShell: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 14 },
  inputShellFocused: { borderColor: colors.coral, backgroundColor: '#FFFFFF' },
  inputShellError: { borderColor: colors.danger },
  input: { flex: 1, minHeight: 52, color: colors.ink, fontFamily: 'SpaceGrotesk_400Regular', fontSize: 15, paddingVertical: 0, outlineStyle: 'none' as unknown as undefined },
  eyeButton: { minWidth: 36, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  primaryButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 12, backgroundColor: colors.coral, marginTop: 2, paddingHorizontal: space.lg },
  primaryButtonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  primaryButtonDisabled: { opacity: 0.48 },
  primaryButtonText: { color: '#FFF9F5', fontSize: 15, lineHeight: 20, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  googleButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: space.lg },
  googleButtonPressed: { backgroundColor: '#F2EEE9', transform: [{ scale: 0.99 }] },
  googleButtonDisabled: { opacity: 0.48 },
  googleButtonText: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  secondaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryButtonText: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: radius.md, backgroundColor: colors.coralSoft, padding: space.md },
  statusSuccess: { backgroundColor: colors.mint },
  statusText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  statusTextSuccess: { color: colors.success },
  footer: { alignItems: 'center', justifyContent: 'center', marginTop: space.lg, paddingHorizontal: space.lg },
  footerText: { color: colors.muted, fontSize: 10.5, lineHeight: 16, fontWeight: '500', textAlign: 'center' },
});
