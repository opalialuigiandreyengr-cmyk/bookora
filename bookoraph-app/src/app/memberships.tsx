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

export default function MembershipsScreen() {
  const {
    membershipPlans,
    clientMemberships,
    clients,
    addMembershipPlan,
    deleteMembershipPlan,
    enrollClientMembership,
    refreshing,
    refresh,
  } = useApp();

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);

  const [name, setName] = useState('');
  const [monthlyPrice, setMonthlyPrice] = useState('1499');
  const [pointsPerVisit, setPointsPerVisit] = useState('25');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const totalPoints = clientMemberships.reduce((sum, item) => sum + item.points_balance, 0);

  const openPlanModal = () => {
    setName('');
    setMonthlyPrice('1499');
    setPointsPerVisit('25');
    setDescription('');
    setActive(true);
    setPlanModalOpen(true);
  };

  const openEnrollModal = () => {
    setSelectedClientId(clients[0]?.id ?? '');
    setSelectedPlanId(membershipPlans[0]?.id ?? '');
    setEnrollModalOpen(true);
  };

  const handleSavePlan = async () => {
    if (!name.trim()) {
      Alert.alert('Plan name required', 'Please enter a membership plan name.');
      return;
    }
    setBusy(true);
    const err = await addMembershipPlan({
      name: name.trim(),
      monthly_price: Math.max(0, Number(monthlyPrice) || 0),
      points_per_visit: Math.max(0, Number(pointsPerVisit) || 0),
      description: description.trim() || 'Priority booking and member-only perks',
      active,
    });
    setBusy(false);
    if (err) {
      Alert.alert('Could not create plan', err);
      return;
    }
    setPlanModalOpen(false);
  };

  const handleDeletePlan = (id: string, planName: string) => {
    Alert.alert('Delete membership plan?', `Remove "${planName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteMembershipPlan(id);
        },
      },
    ]);
  };

  const handleEnrollClient = async () => {
    if (!selectedClientId || !selectedPlanId) {
      Alert.alert('Selection required', 'Choose both a client and a membership plan.');
      return;
    }
    setBusy(true);
    const err = await enrollClientMembership(selectedClientId, selectedPlanId);
    setBusy(false);
    if (err) {
      Alert.alert('Could not enroll client', err);
      return;
    }
    setEnrollModalOpen(false);
  };

  return (
    <>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Card style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>RECURRING REVENUE & LOYALTY</Text>
              <Text style={styles.heroTitle}>Memberships & Loyalty</Text>
              <Text style={styles.heroSub}>
                Configure recurring plans, member perks, and loyalty points per booking.
              </Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{membershipPlans.length}</Text>
              <Text style={styles.statLbl}>Plans</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: colors.coral }]}>
                {clientMemberships.length}
              </Text>
              <Text style={styles.statLbl}>Enrolled</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: colors.peach }]}>{totalPoints}</Text>
              <Text style={styles.statLbl}>Points active</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <View style={styles.flex1}>
              <Button label="New Plan" icon="add-circle-outline" onPress={openPlanModal} />
            </View>
            <View style={styles.flex1}>
              <Button
                label="Enroll Client"
                icon="person-add-outline"
                secondary
                onPress={openEnrollModal}
              />
            </View>
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Membership Tiers</Text>
          <Text style={styles.sectionSub}>{membershipPlans.length} plans</Text>
        </View>

        {membershipPlans.length === 0 ? (
          <EmptyState
            icon="ribbon-outline"
            title="No membership plans yet"
            message="Launch a VIP club or monthly care membership with automatic loyalty points."
            actionLabel="Create plan"
            onAction={openPlanModal}
          />
        ) : (
          <View style={styles.list}>
            {membershipPlans.map((plan) => (
              <Card key={plan.id} style={styles.planCard}>
                <View style={styles.planHeader}>
                  <View style={styles.flex1}>
                    <View style={styles.titleRow}>
                      <Text style={styles.planName}>{plan.name}</Text>
                      <View style={styles.pricePill}>
                        <Text style={styles.pricePillText}>{php(plan.monthly_price)}/mo</Text>
                      </View>
                      <StatusBadge status={plan.active ? 'active' : 'paused'} />
                    </View>
                    <Text style={styles.planBenefits}>{plan.description}</Text>
                  </View>
                  <Pressable
                    onPress={() => handleDeletePlan(plan.id, plan.name)}
                    style={styles.deleteBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>

                <View style={styles.perkRow}>
                  <View style={styles.perkChip}>
                    <Ionicons name="star-outline" size={14} color={colors.warning} />
                    <Text style={styles.perkText}>+{plan.points_per_visit} pts/visit</Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Enrolled Members</Text>
          <Text style={styles.sectionSub}>{clientMemberships.length} active</Text>
        </View>

        {clientMemberships.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No enrolled members yet"
            message="Enroll existing clients into a membership tier to track their loyalty points."
            actionLabel="Enroll a client"
            onAction={openEnrollModal}
          />
        ) : (
          <View style={styles.list}>
            {clientMemberships.map((member) => {
              const clientName =
                member.clients?.full_name ||
                clients.find((c) => c.id === member.client_id)?.full_name ||
                'Client';
              const planName =
                membershipPlans.find((p) => p.id === member.plan_id)?.name || 'Membership';
              return (
                <Card key={member.id} style={styles.memberCard}>
                  <View style={styles.memberTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {clientName.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.memberName}>{clientName}</Text>
                      <Text style={styles.memberPlan}>{planName}</Text>
                    </View>
                    <StatusBadge status={member.status} />
                  </View>
                  <View style={styles.memberStats}>
                    <View style={styles.memberStatBox}>
                      <Text style={styles.memberStatLbl}>Loyalty points</Text>
                      <Text style={[styles.memberStatVal, { color: colors.coral }]}>
                        {member.points_balance} pts
                      </Text>
                    </View>
                    <View style={styles.memberStatBox}>
                      <Text style={styles.memberStatLbl}>Email</Text>
                      <Text style={styles.memberStatVal} numberOfLines={1}>
                        {member.clients?.email || 'On file'}
                      </Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Screen>

      {/* New Plan Modal */}
      <Modal
        visible={planModalOpen}
        animationType="fade"
        presentationStyle="pageSheet"
        onRequestClose={() => setPlanModalOpen(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Membership Plan</Text>
              <Pressable onPress={() => setPlanModalOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Field
                label="Plan name *"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Glow Club VIP"
              />
              <View style={styles.row2}>
                <View style={styles.flex1}>
                  <Field
                    label="Monthly price (PHP)"
                    value={monthlyPrice}
                    onChangeText={setMonthlyPrice}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.flex1}>
                  <Field
                    label="Points per visit"
                    value={pointsPerVisit}
                    onChangeText={setPointsPerVisit}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <Field
                label="Perks & benefits summary"
                value={description}
                onChangeText={setDescription}
                placeholder="Priority weekend slots, complimentary drink, birthday treat"
                multiline
              />
              <View style={styles.switchRow}>
                <View style={styles.flex1}>
                  <Text style={styles.switchTitle}>Plan active</Text>
                  <Text style={styles.switchSub}>Available for new member enrollments</Text>
                </View>
                <Switch
                  value={active}
                  onValueChange={setActive}
                  trackColor={{ false: colors.line, true: colors.coral }}
                />
              </View>
              <Button
                label={busy ? 'Saving…' : 'Create Membership Plan'}
                icon="checkmark-circle-outline"
                onPress={() => void handleSavePlan()}
                disabled={busy}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Enroll Client Modal */}
      <Modal
        visible={enrollModalOpen}
        animationType="fade"
        presentationStyle="pageSheet"
        onRequestClose={() => setEnrollModalOpen(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Enroll Client in Membership</Text>
            <Pressable onPress={() => setEnrollModalOpen(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.selectLabel}>Select client</Text>
            <View style={styles.chipsWrap}>
              {clients.map((client) => {
                const selected = client.id === selectedClientId;
                return (
                  <Pressable
                    key={client.id}
                    onPress={() => setSelectedClientId(client.id)}
                    style={[styles.chip, selected && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                      {client.full_name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.selectLabel}>Select membership tier</Text>
            <View style={styles.chipsWrap}>
              {membershipPlans.map((plan) => {
                const selected = plan.id === selectedPlanId;
                return (
                  <Pressable
                    key={plan.id}
                    onPress={() => setSelectedPlanId(plan.id)}
                    style={[styles.chip, selected && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                      {plan.name} ({php(plan.monthly_price)}/mo)
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Button
              label={busy ? 'Enrolling…' : 'Enroll Member'}
              icon="person-add-outline"
              onPress={() => void handleEnrollClient()}
              disabled={busy || clients.length === 0 || membershipPlans.length === 0}
            />
          </ScrollView>
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
  heroHeader: {
    flexDirection: 'row',
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
  statsRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  statBox: {
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
  actionRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  flex1: {
    flex: 1,
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
  planCard: {
    gap: space.md,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  planName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  pricePill: {
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pricePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.coral,
  },
  planBenefits: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  perkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.canvas,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  perkText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  memberCard: {
    gap: space.sm,
  },
  memberTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.coral,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  memberPlan: {
    fontSize: 12,
    color: colors.muted,
  },
  memberStats: {
    flexDirection: 'row',
    gap: space.xs,
  },
  memberStatBox: {
    flex: 1,
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    padding: space.sm,
    gap: 2,
  },
  memberStatLbl: {
    fontSize: 11,
    color: colors.muted,
  },
  memberStatVal: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
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
  selectLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
});
