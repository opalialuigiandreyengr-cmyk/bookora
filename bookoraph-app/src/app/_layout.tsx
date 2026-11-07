import Ionicons from '@expo/vector-icons/Ionicons';
import {
  SpaceGrotesk_300Light,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Component, type PropsWithChildren, Suspense, useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Text } from '@/components/app-text';
import { Button, LoadingState } from '@/components/ui';
import { AppProvider, useApp } from '@/providers/app-provider';
import { colors, space } from '@/theme';

void SplashScreen.preventAutoHideAsync();

class RouteErrorBoundary extends Component<
  PropsWithChildren,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
            padding: space.xxl,
            gap: space.md,
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 18,
              backgroundColor: colors.coralSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="cloud-offline-outline" size={26} color={colors.coral} />
          </View>
          <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
            Unable to load this page
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
            Please check your internet connection and try again.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: space.xs }}>
            <Button
              label="Try Again"
              icon="refresh"
              compact
              onPress={() => {
                this.setState({ hasError: false });
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
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
                onPress={() => {
                  this.setState({ hasError: false });
                  router.back();
                }}
              />
            ) : null}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_300Light,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <RouteErrorBoundary>
        <Suspense fallback={<LoadingState />}>
          <AppNavigator />
        </Suspense>
      </RouteErrorBoundary>
    </AppProvider>
  );
}

function AppNavigator() {
  const { loading, session } = useApp();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'bookora-no-focus-outline';
      if (!document.getElementById(styleId)) {
        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
          input, textarea, select, [contenteditable] {
            outline: none !important;
            outline-width: 0 !important;
            box-shadow: none !important;
          }
          input:focus, input:focus-visible, textarea:focus, textarea:focus-visible, select:focus, select:focus-visible {
            outline: none !important;
            outline-width: 0 !important;
            box-shadow: none !important;
          }
        `;
        document.head.appendChild(styleEl);
      }
    }
  }, []);

  useEffect(() => {
    if (!session || Platform.OS !== 'web') return;
    const timer = setTimeout(() => {
      void import('./services').catch(() => undefined);
      void import('./staff').catch(() => undefined);
      void import('./reports').catch(() => undefined);
      void import('./integrations').catch(() => undefined);
      void import('./notifications').catch(() => undefined);
      void import('./settings').catch(() => undefined);
      void import('./appointment/[id]').catch(() => undefined);
      void import('./booking/[id]').catch(() => undefined);
    }, 150);
    return () => clearTimeout(timer);
  }, [session]);

  if (loading) return <LoadingState message="Loading your workspace…" />;

  return (
    <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: colors.ink,
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          headerLeft: ({ canGoBack }) =>
            (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={() => canGoBack ? router.back() : router.replace('/(tabs)/more')}
                hitSlop={8}
                style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}
              >
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </Pressable>
            ),
          headerTitleStyle: { fontFamily: 'SpaceGrotesk_700Bold', fontWeight: 'normal' },
          contentStyle: { backgroundColor: '#FFFFFF' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Protected guard={Boolean(session)} redirectTo="/sign-in">
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="appointment/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="booking/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="ointment/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="services" options={{ headerShown: false }} />
          <Stack.Screen name="staff" options={{ title: 'Staff & Team' }} />
          <Stack.Screen name="block-time" options={{ title: 'Block Time' }} />
          <Stack.Screen name="packages" options={{ title: 'Packages' }} />
          <Stack.Screen name="memberships" options={{ title: 'Memberships' }} />
          <Stack.Screen name="advanced-scheduling" options={{ title: 'Advanced Scheduling' }} />
          <Stack.Screen name="reports" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="integrations" options={{ title: 'Integrations & Webhooks' }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
  );
}
