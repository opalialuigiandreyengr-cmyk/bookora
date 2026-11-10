import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { type ComponentProps } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type MenuItem = {
  title: string;
  icon: IconName;
  route: Href;
  badge?: string | number;
  comingSoon?: boolean;
};

export default function SettingsHub() {
  const {
    adminContext,
    businessProfile,
    publicBookingUrl,
    services,
    signOut,
  } = useApp();

  const activeSlug =
    businessProfile.slug?.trim() ||
    businessProfile.business_name
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') ||
    'nailsou';

  const menuSections: { heading: string; items: MenuItem[] }[] = [
    {
      heading: 'Business setup',
      items: [
        {
          title: 'Business profile',
          icon: 'business-outline',
          route: { pathname: '/settings', params: { section: 'Business profile' } },
        },
        {
          title: 'Business hours',
          icon: 'time-outline',
          route: { pathname: '/settings', params: { section: 'Business hours' } },
        },
        {
          title: 'Booking preferences',
          icon: 'calendar-outline',
          route: { pathname: '/settings', params: { section: 'Booking preferences' } },
        },
      ],
    },
    {
      heading: 'Workspace',
      items: [
        {
          title: 'Services',
          icon: 'cut-outline',
          route: '/services',
          badge: services.length || undefined,
        },
        {
          title: 'Team',
          icon: 'people-outline',
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
          route: '/reports',
          comingSoon: true,
        },
        {
          title: 'Integrations',
          icon: 'git-network-outline',
          route: '/integrations',
          comingSoon: true,
        },
      ],
    },
    {
      heading: 'Account & system',
      items: [
        ...(adminContext.is_admin
          ? [
              {
                title: 'Platform Admin Console',
                icon: 'shield-checkmark-outline' as IconName,
                route: '/admin' as Href,
                badge: adminContext.role || 'admin',
              },
            ]
          : []),
        {
          title: 'Notifications',
          icon: 'notifications-outline',
          route: '/notifications',
        },
        {
          title: 'Account',
          icon: 'person-outline',
          route: { pathname: '/settings', params: { section: 'Account' } },
        },
        {
          title: 'Security',
          icon: 'lock-closed-outline',
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
    <SafeAreaView edges={['top']} style={styles.page}>
      <View style={styles.topHeader}>
        <Text style={styles.pageTitle}>Settings</Text>
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {menuSections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            <View style={styles.menuList}>
              {section.items.map((item) => (
                <Pressable
                  key={item.title}
                  accessibilityRole="button"
                  accessibilityLabel={item.comingSoon ? `${item.title}, Coming soon` : item.title}
                  accessibilityState={{ disabled: Boolean(item.comingSoon) }}
                  disabled={Boolean(item.comingSoon)}
                  onPress={() => {
                    if (!item.comingSoon) router.push(item.route);
                  }}
                  style={({ pressed }) => [
                    styles.menuRow,
                    item.comingSoon && styles.menuRowDisabled,
                    !item.comingSoon && pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.menuRowLeft}>
                    <Ionicons
                      name={item.icon}
                      size={19}
                      color={item.comingSoon ? colors.muted : colors.ink}
                    />
                    <Text
                      style={[
                        styles.menuRowTitle,
                        item.comingSoon && styles.menuRowTitleDisabled,
                      ]}
                    >
                      {item.title}
                    </Text>
                  </View>
                  <View style={styles.menuRowRight}>
                    {item.comingSoon ? (
                      <View style={styles.comingSoonBadge}>
                        <Text style={styles.comingSoonBadgeText}>Coming soon</Text>
                      </View>
                    ) : (
                      <>
                        {item.badge !== undefined ? (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>{item.badge}</Text>
                          </View>
                        ) : null}
                        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                      </>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={handleLogout}
          style={({ pressed }) => [styles.signOutRow, pressed && styles.rowPressed]}
        >
          <View style={styles.menuRowLeft}>
            <Ionicons name="log-out-outline" size={19} color={colors.danger} />
            <Text style={styles.signOutText}>Sign out</Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  pageTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  sharePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '62%',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: '#F3F4F6',
  },
  sharePillText: {
    color: colors.ink,
    fontSize: 12.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.72,
  },
  rowPressed: {
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: 8,
    paddingBottom: 48,
    gap: 20,
  },
  section: {
    gap: 4,
  },
  sectionHeading: {
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 6,
    marginBottom: 2,
  },
  menuList: {
    backgroundColor: '#FFFFFF',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  menuRowDisabled: {
    opacity: 0.62,
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuRowTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  menuRowTitleDisabled: {
    color: colors.muted,
  },
  menuRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  comingSoonBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: colors.line,
  },
  comingSoonBadgeText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: '#F3F4F6',
  },
  badgeText: {
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: '600',
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  signOutText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
  },
});
