import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { LoadingState } from '@/components/ui';
import { useApp } from '@/providers/app-provider';
import { colors } from '@/theme';

export default function TabsLayout() {
  const { loading, session, needsOnboarding } = useApp();
  if (loading) return <LoadingState />;
  if (!session) return <Redirect href="/sign-in" />;
  if (needsOnboarding) return <Redirect href="/onboarding" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.coral, tabBarInactiveTintColor: colors.muted, tabBarStyle: { height: 72, paddingTop: 7, paddingBottom: 9, backgroundColor: colors.surface, borderTopColor: colors.line }, tabBarLabelStyle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 11, fontWeight: 'normal' } }}>
    <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={String(color)} /> }} />
    <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={String(color)} /> }} />
    <Tabs.Screen name="clients" options={{ title: 'Clients', tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={String(color)} /> }} />
    <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: ({ color, size }) => <Ionicons name="card-outline" size={size} color={String(color)} /> }} />
    <Tabs.Screen name="more" options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={String(color)} /> }} />
  </Tabs>;
}
