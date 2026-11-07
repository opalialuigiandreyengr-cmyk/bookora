import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { Button, Card, EmptyState, Field, Screen, StatusBadge } from '@/components/ui';
import { useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';

const php = (value: number) =>
  `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

export default function PackagesScreen() {
  const { packages, services, addPackage, deletePackage, refreshing, refresh } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sessionCount, setSessionCount] = useState('5');
  const [price, setPrice] = useState('1800');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const openModal = () => {
    setName('');
    setDescription('');
    setSessionCount('5');
    setPrice('1800');
    setSelectedServiceIds([]);
    setActive(true);
    setModalOpen(true);
  };

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((item) => item !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Package name required', 'Please enter a package name.');
      return;
    }
    setBusy(true);
    const err = await addPackage({
      name: name.trim(),
      description: description.trim() || 'Prepaid bundle for repeat clients',
      session_count: Math.max(1, Number(sessionCount) || 1),
      price: Math.max(0, Number(price) || 0),
      service_ids: selectedServiceIds,
      active,
    });
    setBusy(false);
    if (err) {
      Alert.alert('Could not create package', err);
      return;
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string, pkgName: string) => {
    Alert.alert('Delete package?', `Remove "${pkgName}" from your catalog?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deletePackage(id);
        },
      },
    ]);
  };

  const activeCount = packages.filter((pkg) => pkg.active).length;
  const totalSessions = packages.reduce((sum, pkg) => sum + pkg.session_count, 0);

  return (
    <>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Card style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>PREPAID BUNDLES</Text>
              <Text style={styles.heroTitle}>Service Packages</Text>
              <Text style={styles.heroSub}>
                Sell multi-session bundles to boost upfront cashflow and repeat visits.
              </Text>
            </View>
            <Button label="New Package" icon="add" onPress={openModal} compact />
          </View>
          <View style={styles.statsStrip}>
            <View style={styles.statCell}>
              <Text style={styles.statVal}>{packages.length}</Text>
              <Text style={styles.statLbl}>Total packages</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statVal, { color: '#6EE7B7' }]}>{activeCount}</Text>
              <Text style={styles.statLbl}>Active</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statVal}>{totalSessions}</Text>
              <Text style={styles.statLbl}>Bundled sessions</Text>
            </View>
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Catalog packages</Text>
          <Text style={styles.sectionSub}>{packages.length} configured</Text>
        </View>

        {packages.length === 0 ? (
          <EmptyState
            icon="gift-outline"
            title="No service packages yet"
            message="Create a 5-session or 10-session bundle so loyal clients can prepay and save."
            actionLabel="Create package"
            onAction={openModal}
          />
        ) : (
          <View style={styles.list}>
            {packages.map((pkg) => {
              const perSession =
                pkg.session_count > 0 ? Math.round(pkg.price / pkg.session_count) : pkg.price;
              const eligibleNames = pkg.service_ids
                .map((id) => services.find((s) => s.id === id)?.name || id)
                .filter(Boolean);
              return (
                <Card key={pkg.id} style={styles.pkgCard}>
                  <View style={styles.pkgHeader}>
                    <View style={styles.pkgTitleWrap}>
                      <View style={styles.titleRow}>
                        <Text style={styles.pkgName}>{pkg.name}</Text>
                        <StatusBadge status={pkg.active ? 'active' : 'paused'} />
                      </View>
                      <Text style={styles.pkgDesc}>
                        {pkg.description || 'Prepaid bundle for repeat clients'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDelete(pkg.id, pkg.name)}
                      style={styles.iconBtn}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>

                  <View style={styles.metaGrid}>
                    <View style={styles.metaBox}>
                      <Text style={styles.metaLabel}>Package price</Text>
                      <Text style={styles.metaValue}>{php(pkg.price)}</Text>
                    </View>
                    <View style={styles.metaBox}>
                      <Text style={styles.metaLabel}>Sessions</Text>
                      <Text style={styles.metaValue}>{pkg.session_count} visits</Text>
                    </View>
                    <View style={styles.metaBox}>
                      <Text style={styles.metaLabel}>Per visit</Text>
                      <Text style={styles.metaValue}>{php(perSession)}</Text>
                    </View>
                  </View>

                  <View style={styles.includedRow}>
                    <Ionicons name="sparkles-outline" size={14} color={colors.coral} />
                    <Text style={styles.includedText}>
                      {eligibleNames.length > 0
                        ? `Eligible: ${eligibleNames.join(', ')}`
                        : 'Eligible across all services'}
                    </Text>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Screen>

      <Modal
        visible={modalOpen}
        animationType="fade"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalOpen(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Service Package</Text>
              <Pressable onPress={() => setModalOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Field
                label="Package name *"
                value={name}
                onChangeText={setName}
                placeholder="e.g. 5-Session Gel Manicure Pass"
              />
              <Field
                label="Description"
                value={description}
                onChangeText={setDescription}
                placeholder="Save 15% when pre-booking 5 sessions"
                multiline
              />
              <View style={styles.row2}>
                <View style={styles.flex1}>
                  <Field
                    label="Number of sessions"
                    value={sessionCount}
                    onChangeText={setSessionCount}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.flex1}>
                  <Field
                    label="Total price (PHP)"
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.groupLabel}>Included services (optional)</Text>
                <Text style={styles.groupSub}>
                  Leave unselected to allow redemption on any service.
                </Text>
                <View style={styles.chipsWrap}>
                  {services.map((svc) => {
                    const selected = selectedServiceIds.includes(svc.id);
                    return (
                      <Pressable
                        key={svc.id}
                        onPress={() => toggleService(svc.id)}
                        style={[styles.chip, selected && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                          {svc.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.switchRow}>
                <View style={styles.flex1}>
                  <Text style={styles.switchTitle}>Package active</Text>
                  <Text style={styles.switchSub}>
                    Available to assign and redeem at checkout
                  </Text>
                </View>
                <Switch
                  value={active}
                  onValueChange={setActive}
                  trackColor={{ false: colors.line, true: colors.coral }}
                />
              </View>

              <Button
                label={busy ? 'Saving…' : 'Create Package'}
                icon="checkmark-circle-outline"
                onPress={() => void handleSave()}
                disabled={busy}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
    gap: space.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.peach,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroSub: {
    fontSize: 13,
    lineHeight: 18,
    color: '#CBD5E1',
  },
  statsStrip: {
    flexDirection: 'row',
    gap: space.sm,
    paddingTop: space.xs,
  },
  statCell: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    padding: space.sm,
    gap: 2,
  },
  statVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statLbl: {
    fontSize: 11,
    color: '#94A3B8',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.muted,
  },
  list: {
    gap: space.sm,
  },
  pkgCard: {
    gap: space.md,
  },
  pkgHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  pkgTitleWrap: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  pkgName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  pkgDesc: {
    fontSize: 13,
    color: colors.muted,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaGrid: {
    flexDirection: 'row',
    gap: space.xs,
  },
  metaBox: {
    flex: 1,
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    padding: space.sm,
    gap: 2,
  },
  metaLabel: {
    fontSize: 11,
    color: colors.muted,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  includedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  includedText: {
    flex: 1,
    fontSize: 12,
    color: colors.muted,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: space.lg,
    gap: space.md,
    paddingBottom: space.xxl,
  },
  row2: {
    flexDirection: 'row',
    gap: space.sm,
  },
  flex1: {
    flex: 1,
  },
  fieldGroup: {
    gap: 6,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  groupSub: {
    fontSize: 12,
    color: colors.muted,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.coral,
    backgroundColor: colors.coralSoft,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  chipTextActive: {
    color: colors.coral,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  switchSub: {
    fontSize: 12,
    color: colors.muted,
  },
});
