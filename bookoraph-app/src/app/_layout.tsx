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
import { useEffect } from 'react';
import { Pressable } from 'react-native';

import { LoadingState } from '@/components/ui';
import { AppProvider, useApp } from '@/providers/app-provider';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

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
      <AppNavigator />
    </AppProvider>
  );
}

function AppNavigator() {
  const { loading, session } = useApp();

  if (loading) return <LoadingState />;

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
