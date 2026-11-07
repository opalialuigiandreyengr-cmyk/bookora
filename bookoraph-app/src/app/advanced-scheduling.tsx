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

const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export default function AdvancedSchedulingScreen() {
  const {
    schedulingSettings,
    classSessions,
    saveSchedulingSettings,
    addClassSession,
    deleteClassSession,
    refreshing,
    refresh,
  } = useApp();

  const [dailyLimit, setDailyLimit] = useState(
    String(schedulingSettings.daily_capacity)
  );
  const [waitlistEnabled, setWaitlistEnabled] = useState(
    schedulingSettings.waitlist_enabled
  );
  const [privateLinkOnly, setPrivateLinkOnly] = useState(
    schedulingSettings.private_booking_enabled
  );
  const [seasonalEnabled, setSeasonalEnabled] = useState(
    schedulingSettings.seasonal_availability_enabled
  );
  const [rooms, setRooms] = useState<string[]>(schedulingSettings.resources);
  const [newRoom, setNewRoom] = useState('');
  const [savingRules, setSavingRules] = useState(false);

  const [classModalOpen, setClassModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sessionDate, setSessionDate] = useState(todayISO);
  const [startTime, setStartTime] = useState('10:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [capacity, setCapacity] = useState('12');
  const [savingClass, setSavingClass] = useState(false);

  const handleAddRoom = () => {
    const trimmed = newRoom.trim();
    if (!trimmed || rooms.includes(trimmed)) return;
    setRooms((prev) => [...prev, trimmed]);
    setNewRoom('');
  };

  const handleRemoveRoom = (target: string) => {
    setRooms((prev) => prev.filter((item) => item !== target));
  };

  const handleSaveRules = async () => {
    setSavingRules(true);
    const err = await saveSchedulingSettings({
      daily_capacity: Math.max(0, Number(dailyLimit) || 0),
      waitlist_enabled: waitlistEnabled,
      private_booking_enabled: privateLinkOnly,
      seasonal_availability_enabled: seasonalEnabled,
      resources: rooms,
    });
    setSavingRules(false);
    if (err) {
      Alert.alert('Could not save settings', err);
      return;
    }
    Alert.alert('Saved', 'Advanced scheduling rules updated.');
  };

  const handleCreateClass = async () => {
    if (!name.trim()) {
      Alert.alert('Title required', 'Enter a class or workshop title.');
      return;
    }
    setSavingClass(true);
    const err = await addClassSession({
      name: name.trim(),
      description: description.trim() || 'Group session',
      session_date: sessionDate.trim(),
      start_time: startTime.trim() || '10:00',
      duration_minutes: Math.max(15, Number(durationMinutes) || 60),
      capacity: Math.max(1, Number(capacity) || 10),
    });
    setSavingClass(false);
    if (err) {
      Alert.alert('Could not create session', err);
      return;
    }
    setClassModalOpen(false);
    setName('');
    setDescription('');
  };

  return (
    <>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Card style={styles.heroCard}>
          <Text style={styles.eyebrow}>CAPACITY, ROOMS & GROUP SESSIONS</Text>
          <Text style={styles.heroTitle}>Advanced Scheduling</Text>
          <Text style={styles.heroSub}>
            Control daily booking caps, waitlist intake, resource rooms, and multi-seat classes.
          </Text>
        </Card>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Capacity & Intake Rules</Text>
            <Text style={styles.sectionSub}>Guard against overbooking</Text>
          </View>
          <Field
            label="Daily appointment cap (0 = unlimited)"
            value={dailyLimit}
            onChangeText={setDailyLimit}
            keyboardType="numeric"
          />

          <View style={styles.switchItem}>
            <View style={styles.flex1}>
              <Text style={styles.switchTitle}>Enable automatic waitlist</Text>
              <Text style={styles.switchSub}>
                Let clients join a standby queue when a day or slot is full
              </Text>
            </View>
            <Switch
              value={waitlistEnabled}
              onValueChange={setWaitlistEnabled}
              trackColor={{ false: colors.line, true: colors.coral }}
            />
          </View>

          <View style={styles.switchItem}>
            <View style={styles.flex1}>
              <Text style={styles.switchTitle}>Private booking link mode</Text>
              <Text style={styles.switchSub}>
                Require direct invitation URL to access public booking page
              </Text>
            </View>
            <Switch
              value={privateLinkOnly}
              onValueChange={setPrivateLinkOnly}
              trackColor={{ false: colors.line, true: colors.coral }}
            />
          </View>

          <View style={styles.switchItem}>
            <View style={styles.flex1}>
              <Text style={styles.switchTitle}>Seasonal availability overrides</Text>
              <Text style={styles.switchSub}>
                Allow holiday and peak-season operating hours
              </Text>
            </View>
            <Switch
              value={seasonalEnabled}
              onValueChange={setSeasonalEnabled}
              trackColor={{ false: colors.line, true: colors.coral }}
            />
          </View>

          <View style={styles.roomSection}>
            <Text style={styles.switchTitle}>Rooms & equipment resources</Text>
            <View style={styles.chipsWrap}>
              {rooms.map((item) => (
                <View key={item} style={styles.roomChip}>
                  <Ionicons name="cube-outline" size={14} color={colors.coral} />
                  <Text style={styles.roomChipText}>{item}</Text>
                  <Pressable onPress={() => handleRemoveRoom(item)} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={styles.addRoomRow}>
              <View style={styles.flex1}>
                <Field
                  label="Add room or station"
                  value={newRoom}
                  onChangeText={setNewRoom}
                  placeholder="e.g. Treatment Room 2"
                />
              </View>
              <Button label="Add" icon="add" secondary onPress={handleAddRoom} compact />
            </View>
          </View>

          <Button
            label={savingRules ? 'Saving…' : 'Save Scheduling Rules'}
            icon="save-outline"
            onPress={() => void handleSaveRules()}
            disabled={savingRules}
          />
        </Card>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Group Classes & Workshops</Text>
            <Text style={styles.sectionSub}>{classSessions.length} scheduled</Text>
          </View>
          <Button
            label="New Session"
            icon="add"
            compact
            onPress={() => setClassModalOpen(true)}
          />
        </View>

        {classSessions.length === 0 ? (
          <EmptyState
            icon="people-circle-outline"
            title="No group sessions scheduled"
            message="Host multi-seat classes, workshops, or group appointments with capacity tracking."
            actionLabel="Create session"
            onAction={() => setClassModalOpen(true)}
          />
        ) : (
          <View style={styles.list}>
            {classSessions.map((session) => (
              <Card key={session.id} style={styles.sessionCard}>
                <View style={styles.sessionHeader}>
                  <View style={styles.flex1}>
                    <Text style={styles.sessionTitle}>{session.name}</Text>
                    <Text style={styles.sessionMeta}>
                      {session.session_date} at {session.start_time} •{' '}
                      {session.duration_minutes}m
                    </Text>
                    {session.description ? (
                      <Text style={styles.sessionSub}>{session.description}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => void deleteClassSession(session.id)}
                    style={styles.deleteBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>

                <View style={styles.sessionFooter}>
                  <View style={styles.seatBadge}>
                    <Ionicons name="people-outline" size={14} color={colors.navy} />
                    <Text style={styles.seatText}>
                      {session.enrolled_count}/{session.capacity} seats filled
                    </Text>
                  </View>
                  <StatusBadge status={session.status} />
                </View>
              </Card>
            ))}
          </View>
        )}
      </Screen>

      <Modal
        visible={classModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setClassModalOpen(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Group Class / Session</Text>
              <Pressable onPress={() => setClassModalOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Field
                label="Session title *"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Saturday Morning Nail Art Workshop"
              />
              <Field
                label="Description / Instructor notes"
                value={description}
                onChangeText={setDescription}
                placeholder="Instructor & room details"
                multiline
              />
              <View style={styles.row2}>
                <View style={styles.flex1}>
                  <Field
                    label="Date (YYYY-MM-DD)"
                    value={sessionDate}
                    onChangeText={setSessionDate}
                  />
                </View>
                <View style={styles.flex1}>
                  <Field
                    label="Start time (HH:MM)"
                    value={startTime}
                    onChangeText={setStartTime}
                  />
                </View>
              </View>
              <View style={styles.row2}>
                <View style={styles.flex1}>
                  <Field
                    label="Duration (mins)"
                    value={durationMinutes}
                    onChangeText={setDurationMinutes}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.flex1}>
                  <Field
                    label="Max capacity (seats)"
                    value={capacity}
                    onChangeText={setCapacity}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <Button
                label={savingClass ? 'Scheduling…' : 'Create Group Session'}
                icon="checkmark-circle-outline"
                onPress={() => void handleCreateClass()}
                disabled={savingClass}
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
    gap: 6,
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
  card: {
    gap: space.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
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
  switchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  flex1: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  switchSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  roomSection: {
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.sm,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  roomChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.coral,
  },
  addRoomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
  },
  list: {
    gap: space.sm,
  },
  sessionCard: {
    gap: space.sm,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  sessionMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  sessionSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  seatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.lilac,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  seatText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
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
});
