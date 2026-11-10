import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { Platform, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadingState } from '@/components/ui';
import { useApp } from '@/providers/app-provider';
import { colors } from '@/theme';

export default function TabsLayout() {
  const { loading, session, needsOnboarding, adminContext, appointments } = useApp();
  const insets = useSafeAreaInsets();

  if (loading) return <LoadingState />;
  if (!session) return <Redirect href="/sign-in" />;
  if (needsOnboarding && !adminContext.is_admin) return <Redirect href="/onboarding" />;

  const pendingCount = appointments.filter((item) => item.status === 'pending').length;
  const bottomInset = Math.max(8, insets.bottom);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.coral,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          height: 60 + bottomInset,
          paddingTop: 7,
          paddingBottom: bottomInset,
          backgroundColor: Platform.OS === 'web' ? 'rgba(255, 255, 255, 0.90)' : colors.surface,
          borderTopColor: colors.line,
          ...(Platform.OS === 'web'
            ? ({ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as ViewStyle)
            : {}),
        },
        tabBarLabelStyle: {
          fontFamily: 'SpaceGrotesk_600SemiBold',
          fontSize: 11,
          fontWeight: 'normal',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.coral,
            color: '#FFFFFF',
            fontSize: 10,
            fontFamily: 'SpaceGrotesk_700Bold',
          },
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={size}
              color={String(color)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: 'Payments',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'card' : 'card-outline'} size={size} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'settings' : 'settings-outline'}
              size={size}
              color={String(color)}
            />
          ),
        }}
      />
    </Tabs>
  );
}
