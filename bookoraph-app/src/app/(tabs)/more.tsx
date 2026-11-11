import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { type ComponentProps } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, View } from 'react-native';

import { Text } from '@/components/app-text';
import { Card, NativeListGroup, NativeListRow, Screen, StatusBadge } from '@/components/ui';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type MenuItem = {
  title: string;
  subtitle?: string;
  icon: IconName;
  iconBg: string;
  iconColor: string;
  route: Href;
  badge?: string | number;
  comingSoon?: boolean;
};

export default function SettingsHub() {
  const {
    session,
    adminContext,
    businessName,
    businessProfile,
    publicBookingUrl,
    services,
    subscription,
    subscriptionAlert,
    refreshing,
    refresh,
    signOut,
  } = useApp();

  const activeSlug =
    businessProfile.slug?.trim() ||
    businessProfile.business_name
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') ||
    'bookora';

  const initials = (businessName || session?.user.email || 'B')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const menuSections: { heading: string; items: MenuItem[] }[] = [
    {
      heading: 'Business',
      items: [
        {
          title: 'Business profile',
          subtitle: 'Logo, address, contact & branding',
          icon: 'business-outline',
          iconBg: colors.coralSoft,
          iconColor: colors.coral,
          route: { pathname: '/settings', params: { section: 'Business profile' } },
        },
        {
          title: 'Business hours',
          subtitle: 'Opening schedule & breaks',
          icon: 'time-outline',
          iconBg: colors.peach,
          iconColor: colors.warning,
          route: { pathname: '/settings', params: { section: 'Business hours' } },
        },
        {
          title: 'Booking preferences',
          subtitle: 'Lead time, deposits & policy',
          icon: 'calendar-outline',
          iconBg: colors.sky,
          iconColor: colors.skyInk,
          route: { pathname: '/settings', params: { section: 'Booking preferences' } },
        },
      ],
    },
    {
      heading: 'Offerings & team',
      items: [
        {
          title: 'Services',
          subtitle: 'Catalog, pricing & durations',
          icon: 'cut-outline',
          iconBg: colors.mint,
          iconColor: colors.success,
          route: '/services',
          badge: services.length || undefined,
        },
        {
          title: 'Team',
          icon: 'people-outline',
          iconBg: colors.lilac,
          iconColor: colors.navy,
          route: '/staff',
          comingSoon: true,
        },
      ],
    },
    {
      heading: 'Tools',
      items: [
        {
          title: 'Reports',
          icon: 'bar-chart-outline',
          iconBg: colors.surfaceMuted,
          iconColor: colors.muted,
          route: '/reports',
          comingSoon: true,
        },
        {
          title: 'Integrations',
          icon: 'git-network-outline',
          iconBg: colors.surfaceMuted,
          iconColor: colors.muted,
          route: '/integrations',
          comingSoon: true,
        },
      ],
    },
    {
      heading: 'Account & billing',
      items: [
        {
          title: 'Plan & Billing',
          subtitle: subscriptionAlert
            ? subscriptionAlert.title
            : `${subscription?.plan_name || 'Starter'} · Monthly`,
          icon: 'card-outline',
          iconBg: subscriptionAlert ? colors.coralSoft : colors.mint,
          iconColor: subscriptionAlert ? colors.danger : colors.success,
          route: '/billing' as Href,
          badge: subscriptionAlert ? 'Due' : subscription?.plan_name || 'Starter',
        },
        ...(adminContext.is_admin
          ? [
              {
                title: 'Platform Admin Console',
                subtitle: 'Clients, subscriptions & audit logs',
                icon: 'shield-checkmark-outline' as IconName,
                iconBg: colors.coralSoft,
                iconColor: colors.coral,
                route: '/admin' as Href,
                badge: adminContext.role || 'admin',
              },
            ]
          : []),
        {
          title: 'Notifications',
          subtitle: 'Reminders & billing alerts',
          icon: 'notifications-outline',
          iconBg: colors.peach,
          iconColor: colors.warning,
          route: '/notifications',
          badge: subscriptionAlert ? '1' : undefined,
        },
        {
          title: 'Account',
          subtitle: session?.user.email || 'Profile & preferences',
          icon: 'person-outline',
          iconBg: colors.sky,
          iconColor: colors.skyInk,
          route: { pathname: '/settings', params: { section: 'Account' } },
        },
        {
          title: 'Security',
          subtitle: 'Password & 2FA settings',
          icon: 'lock-closed-outline',
          iconBg: colors.lilac,
          iconColor: colors.navy,
          route: { pathname: '/settings', params: { section: 'Security' } },
        },
      ],
    },
  ];

  const shareBookingPage = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(publicBookingUrl);
        Alert.alert('Copied', 'Booking link copied!');
        return;
      }
      await Share.share({
        message: publicBookingUrl,
        url: publicBookingUrl,
      });
    } catch {
      // Share dismissed
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime with your Bookora account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/sign-in');
        },
      },
    ]);
  };

  return (
    <Screen backgroundColor="#FFFFFF" refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.headerLine}>
        <Text style={styles.title}>Settings</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share booking link"
          onPress={() => void shareBookingPage()}
          style={({ pressed }) => [styles.sharePill, pressed && styles.pressed]}
        >
          <Text style={styles.sharePillText} numberOfLines={1}>
            {activeSlug}.bookoraph.com
          </Text>
          <Ionicons name="share-outline" size={15} color={colors.ink} />
        </Pressable>
      </View>

      {subscriptionAlert ? (
        <Pressable onPress={() => router.push('/billing' as Href)} style={({ pressed }) => [pressed && styles.pressed]}>
          <Card style={styles.billingAlertCard}>
            <View style={styles.billingAlertIcon}>
              <Ionicons name="card-outline" size={18} color={colors.danger} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.billingAlertTitle}>{subscriptionAlert.title}</Text>
              <Text style={styles.billingAlertSub} numberOfLines={2}>
                {subscriptionAlert.message}
              </Text>
            </View>
            <Text style={styles.billingAlertCta}>Settle ›</Text>
          </Card>
        </Pressable>
      ) : null}

      <Card style={styles.heroCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.heroTitle} numberOfLines={1}>
            {businessName}
          </Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            {session?.user.email || 'Bookora PH'}
          </Text>
        </View>
        {adminContext.is_admin ? <StatusBadge status={adminContext.role || 'admin'} /> : null}
      </Card>

      {menuSections.map((section) => (
        <NativeListGroup key={section.heading} title={section.heading}>
          {section.items.map((item, idx) => (
            <NativeListRow
              key={item.title}
              first={idx === 0}
              icon={item.icon}
              iconBg={item.iconBg}
              iconColor={item.iconColor}
              title={item.title}
              subtitle={item.subtitle}
              badge={item.comingSoon ? 'Soon' : item.badge}
              chevron={!item.comingSoon}
              disabled={Boolean(item.comingSoon)}
              onPress={item.comingSoon ? undefined : () => router.push(item.route)}
            />
          ))}
        </NativeListGroup>
      ))}

      <NativeListGroup>
        <NativeListRow
          first
          icon="log-out-outline"
          iconBg={colors.coralSoft}
          iconColor={colors.danger}
          title="Sign out"
          destructive
          chevron={false}
          onPress={handleLogout}
        />
      </NativeListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    minHeight: 36,
  },
  title: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  sharePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '58%',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sharePillText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  pressed: { opacity: 0.72 },
  billingAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderColor: '#F5C4BE',
    backgroundColor: '#FFF7F6',
    paddingVertical: 12,
  },
  billingAlertIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billingAlertTitle: { color: colors.ink, fontSize: 13.5, fontWeight: '700' },
  billingAlertSub: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  billingAlertCta: { color: colors.coral, fontSize: 12.5, fontWeight: '800' },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.coral, fontSize: 16, fontWeight: '800' },
  heroTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  heroSub: { color: colors.muted, fontSize: 12 },
});
