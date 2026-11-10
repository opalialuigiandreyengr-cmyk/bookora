import Ionicons from '@expo/vector-icons/Ionicons';
import * as ExpoLinking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { parseAuthCallbackUrl } from '@/lib/auth-callback';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/providers/app-provider';
import { colors, space } from '@/theme';

type CallbackState = 'loading' | 'password' | 'success' | 'error';

export default function AuthCallback() {
  const liveUrl = ExpoLinking.useURL();
  const params = useLocalSearchParams<{
    mode?: string;
    type?: string;
    code?: string;
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  }>();
  const { changePassword } = useApp();
  const handled = useRef(false);
  const [state, setState] = useState<CallbackState>('loading');
  const [message, setMessage] = useState('Checking your secure recovery link…');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const prepareCallback = async () => {
      if (!supabase) {
        setMessage('This build is missing its Supabase connection.');
        setState('error');
        return;
      }

      const initialUrl = liveUrl || (await ExpoLinking.getInitialURL());
      const callback = parseAuthCallbackUrl(initialUrl);
      const callbackError =
        params.error_description || params.error || callback.errorDescription || callback.error;
      if (callbackError) {
        setMessage(callbackError);
        setState('error');
        return;
      }

      const mode = params.mode || callback.mode;
      const type = params.type || callback.type;
      const isRecovery = mode === 'recovery' || type === 'recovery';
      const code = params.code || callback.code;
      const accessToken = params.access_token || callback.accessToken;
      const refreshToken = params.refresh_token || callback.refreshToken;

      let session = (await supabase.auth.getSession()).data.session;
      if (code) {
        const exchange = await supabase.auth.exchangeCodeForSession(code);
        if (exchange.error) {
          session = (await supabase.auth.getSession()).data.session;
          if (Platform.OS !== 'web' || !session) {
            setMessage(exchange.error.message);
            setState('error');
            return;
          }
        } else {
          session = exchange.data.session;
        }
      } else if (accessToken && refreshToken) {
        const result = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (result.error) {
          setMessage(result.error.message);
          setState('error');
          return;
        }
        session = result.data.session;
      }

      if (!session) {
        setMessage('This recovery link is invalid or has expired. Request a new link from sign in.');
        setState('error');
        return;
      }

      if (!isRecovery) {
        router.replace('/');
        return;
      }
      setMessage('Choose a new password for your Bookora account.');
      setState('password');
    };

    void prepareCallback();
  }, [liveUrl, params]);

  const savePassword = async () => {
    if (password.length < 8) {
      setMessage('Use at least 8 characters for your new password.');
      return;
    }
    if (password !== confirmation) {
      setMessage('The passwords do not match. Re-enter the confirmation.');
      return;
    }
    setSaving(true);
    const error = await changePassword(password);
    setSaving(false);
    if (error) {
      setMessage(error);
      return;
    }
    setPassword('');
    setConfirmation('');
    setMessage('Your password has been updated.');
    setState('success');
  };

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <View style={styles.content}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Ionicons name="key-outline" size={21} color={colors.coral} />
            </View>
            <Text style={styles.brandName}>Bookora</Text>
          </View>

          {state === 'loading' ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.coral} />
              <Text style={styles.supportingText}>{message}</Text>
            </View>
          ) : state === 'password' ? (
            <View style={styles.form}>
              <View style={styles.headingGroup}>
                <Text accessibilityRole="header" style={styles.title}>Set a new password</Text>
                <Text style={styles.supportingText}>{message}</Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>New password</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="New password"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    value={password}
                    onChangeText={(value) => {
                      setPassword(value);
                      setMessage('Choose a new password for your Bookora account.');
                    }}
                    secureTextEntry={!showPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    hitSlop={8}
                    onPress={() => setShowPassword((current) => !current)}
                  >
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="Confirm new password"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    value={confirmation}
                    onChangeText={(value) => {
                      setConfirmation(value);
                      setMessage('Choose a new password for your Bookora account.');
                    }}
                    secureTextEntry={!showPassword}
                    placeholder="Repeat your new password"
                    placeholderTextColor={colors.muted}
                    onSubmitEditing={() => void savePassword()}
                    style={styles.input}
                  />
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void savePassword()}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, saving && styles.disabled]}
              >
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Update password</Text>}
              </Pressable>
            </View>
          ) : (
            <View style={styles.centerState}>
              <View style={[styles.resultIcon, state === 'error' && styles.resultIconError]}>
                <Ionicons
                  name={state === 'success' ? 'checkmark' : 'alert-circle-outline'}
                  size={24}
                  color={state === 'success' ? colors.success : colors.danger}
                />
              </View>
              <Text accessibilityRole="header" style={styles.resultTitle}>
                {state === 'success' ? 'Password updated' : 'Link unavailable'}
              </Text>
              <Text style={styles.supportingText}>{message}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace(state === 'success' ? '/(tabs)' : '/sign-in')}
                style={({ pressed }) => [styles.primaryButton, styles.resultButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>{state === 'success' ? 'Continue to dashboard' : 'Back to sign in'}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  keyboard: { flex: 1 },
  content: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coralSoft },
  brandName: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 11, paddingBottom: 70 },
  form: { flex: 1, justifyContent: 'center', gap: space.lg, paddingBottom: 60 },
  headingGroup: { gap: 7, marginBottom: 4 },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  supportingText: { maxWidth: 340, color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  fieldGroup: { gap: 7 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  inputShell: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, backgroundColor: colors.surface },
  input: { flex: 1, color: colors.ink, fontFamily: 'SpaceGrotesk_400Regular', fontSize: 15 },
  primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 18, backgroundColor: colors.coral },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  resultIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  resultIconError: { backgroundColor: colors.coralSoft },
  resultTitle: { color: colors.ink, fontSize: 21, lineHeight: 27, fontWeight: '800' },
  resultButton: { alignSelf: 'stretch', marginTop: 9 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
});
