import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';

import { LoadingState } from '@/components/ui';
import { useApp } from '@/providers/app-provider';
import { colors } from '@/theme';

export default function NativeTabsLayout() {
  const { loading, session, needsOnboarding, adminContext, appointments } = useApp();

  if (loading) return <LoadingState />;
  if (!session) return <Redirect href="/sign-in" />;
  if (needsOnboarding && !adminContext.is_admin) return <Redirect href="/onboarding" />;

  const pendingCount = appointments.filter((item) => item.status === 'pending').length;

  return (
    <NativeTabs
      tintColor={colors.coral}
      iconColor={{ default: colors.muted, selected: colors.coral }}
      indicatorColor={colors.coralSoft}
      labelStyle={{
        default: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 11 },
        selected: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 11 },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
          md="dashboard"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'calendar', selected: 'calendar' }}
          md="calendar_month"
        />
        {pendingCount > 0 ? (
          <NativeTabs.Trigger.Badge>{String(pendingCount)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="clients">
        <NativeTabs.Trigger.Label>Clients</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.2', selected: 'person.2.fill' }}
          md="group"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="payments">
        <NativeTabs.Trigger.Label>Payments</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'creditcard', selected: 'creditcard.fill' }}
          md="credit_card"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
          md="settings"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

