import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { parseTimeToMinutes } from '@/components/calendar/types';
import { Button, Card, EmptyState, Field, Metric, Screen, SearchField, StatusBadge } from '@/components/ui';
import { DEFAULT_STAFF_HOURS, useApp } from '@/providers/app-provider';
import { colors, radius, space } from '@/theme';
import type { StaffHours, StaffMember, StaffRole, StaffStatus } from '@/types';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ROLES: { value: StaffRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'staff', label: 'Staff' },
  { value: 'limited', label: 'Limited access' },
];
const STATUSES: StaffStatus[] = ['invited', 'active', 'paused'];

const emptyStaff = (): StaffMember => ({
  id: '',
  full_name: '',
  email: '',
  phone: '',
  bio: '',
  role: 'staff',
  status: 'invited',
  working_hours: JSON.parse(JSON.stringify(DEFAULT_STAFF_HOURS)) as Record<string, StaffHours>,
  time_off: [],
  service_ids: [],
});

export default function StaffScreen() {
  const {
    staff,
    services,
    appointments,
    saveStaffMember,
    deleteStaffMember,
    refreshing,
    refresh,
  } = useApp();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [timeOffInput, setTimeOffInput] = useState('');
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter(
      (m) =>
        !q ||
        [m.full_name, m.email, m.role, m.status].some((val) => val.toLowerCase().includes(q))
    );
  }, [staff, query]);

  const openEditor = (member: StaffMember) => {
    setTimeOffInput('');
    setSelected({
      ...member,
      working_hours: JSON.parse(JSON.stringify(member.working_hours)) as Record<string, StaffHours>,
      time_off: [...member.time_off],
      service_ids: [...member.service_ids],
    });
  };

  const updateDayHour = (day: string, patch: Partial<StaffHours>) => {
    setSelected((current) => {
      if (!current) return current;
      const existing = current.working_hours[day] || { open: false, start: '09:00', end: '17:00' };
      return {
        ...current,
        working_hours: {
          ...current.working_hours,
          [day]: { ...existing, ...patch },
        },
      };
    });
  };

  const toggleServiceId = (serviceId: string) => {
    setSelected((current) => {
      if (!current) return current;
      const exists = current.service_ids.includes(serviceId);
      return {
        ...current,
        service_ids: exists
          ? current.service_ids.filter((id) => id !== serviceId)
          : [...current.service_ids, serviceId],
      };
    });
  };

  const addTimeOffDate = () => {
    const val = timeOffInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      Alert.alert('Invalid date', 'Enter date as YYYY-MM-DD (e.g. 2026-12-25).');
      return;
    }
    setSelected((current) => {
      if (!current || current.time_off.includes(val)) return current;
      return { ...current, time_off: [...current.time_off, val].sort() };
    });
    setTimeOffInput('');
  };

  const handleSave = async () => {
    if (!selected) return;
    if (!selected.full_name.trim() || !selected.email.trim()) {
      Alert.alert('Missing details', 'Add a name and email first.');
      return;
    }

    const invalidDay = Object.entries(selected.working_hours).find(
      ([, h]) => h.open && (!h.start || !h.end || h.start >= h.end)
    );
    if (invalidDay) {
      Alert.alert('Check hours', `${invalidDay[0]} needs a valid start and end time.`);
      return;
    }

    // Check conflicts with upcoming appointments
    const todayStr = new Date().toISOString().slice(0, 10);
    const conflicts = appointments
      .filter(
        (a) =>
          selected.id &&
          a.staff_member_id === selected.id &&
          a.appointment_date >= todayStr &&
          !['cancelled', 'no_show'].includes(a.status)
      )
      .filter((a) => {
        const dt = new Date(`${a.appointment_date}T12:00:00`);
        const dayName = DAY_NAMES[dt.getDay() === 0 ? 6 : dt.getDay() - 1];
        const h = selected.working_hours[dayName];
        if (!h?.open) return true;
        const start = parseTimeToMinutes(a.appointment_time);
        const end = start + Math.max(Number(a.duration_minutes) || 60, 1);
        return start < parseTimeToMinutes(h.start) || end > parseTimeToMinutes(h.end);
      });

    if (conflicts.length > 0) {
      Alert.alert(
        'Schedule conflict',
        `${conflicts.length} upcoming appointment${conflicts.length === 1 ? '' : 's'} fall outside this availability. Adjust the schedule or reassign the appointments.`
      );
      return;
    }

    setSaving(true);
    const err = await saveStaffMember(selected);
    setSaving(false);
    if (err) {
      Alert.alert('Could not save staff member', err);
      return;
    }
    setSelected(null);
  };

  const confirmRemove = (member: StaffMember) => {
    Alert.alert(
      `Remove ${member.full_name}?`,
      'This removes the staff profile and its service assignments.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const err = await deleteStaffMember(member.id);
            if (err) Alert.alert('Could not remove staff', err);
            else setSelected(null);
          },
        },
      ]
    );
  };

  return (
    <>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Team & access</Text>
            <Text style={styles.heading}>Staff</Text>
          </View>
          <Button label="Invite staff" onPress={() => openEditor(emptyStaff())} />
        </View>

        <View style={styles.metrics}>
          <Metric label="Team members" value={staff.length} icon="people-outline" tone="coral" />
          <Metric
            label="Active access"
            value={staff.filter((m) => m.status === 'active').length}
            icon="shield-checkmark-outline"
            tone="mint"
          />
          <Metric
            label="With hours"
            value={staff.filter((m) => Object.values(m.working_hours).some((d) => d.open)).length}
            icon="time-outline"
            tone="lilac"
          />
        </View>

        <SearchField value={query} onChangeText={setQuery} placeholder="Search staff by name, email, or role" />

        <View style={styles.list}>
          {visible.map((member) => {
            const initials =
              member.full_name
                .split(/\s+/)
                .map((p) => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase() || '?';
            const openDays = Object.values(member.working_hours).filter((d) => d.open).length;
            return (
              <Pressable
                key={member.id}
                onPress={() => openEditor(member)}
                style={({ pressed }) => [styles.staffCard, pressed && styles.pressed]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={styles.copy}>
                  <Text style={styles.name}>{member.full_name}</Text>
                  <Text style={styles.email}>{member.email}</Text>
                  <View style={styles.metaRow}>
                    <StatusBadge status={member.status} />
                    <View style={styles.rolePill}>
                      <Text style={styles.rolePillText}>
                        {ROLES.find((r) => r.value === member.role)?.label || member.role}
                      </Text>
                    </View>
                    <Text style={styles.daysText}>{openDays} working days</Text>
                  </View>
                </View>
                <Ionicons name="create-outline" size={19} color={colors.muted} />
              </Pressable>
            );
          })}
        </View>

        {!visible.length ? (
          <EmptyState
            icon="people-outline"
            title={staff.length ? 'No matching staff' : 'No staff yet'}
            message={
              staff.length
                ? 'Try a different name, email, or role.'
                : 'Invite your first team member to assign services and schedules.'
            }
            actionLabel="Invite staff"
            onAction={() => openEditor(emptyStaff())}
          />
        ) : null}
      </Screen>

      <Modal
        visible={Boolean(selected)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            {selected ? (
              <ScrollView
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalEyebrow}>Team member</Text>
                    <Text style={styles.modalTitle}>
                      {selected.id ? 'Edit staff member' : 'Invite staff'}
                    </Text>
                  </View>
                  <Pressable onPress={() => setSelected(null)} style={styles.closeBtn}>
                    <Ionicons name="close" size={22} color={colors.ink} />
                  </Pressable>
                </View>

                <Card style={styles.formCard}>
                  <Text style={styles.sectionTitle}>Profile</Text>
                  <Field
                    label="Full name *"
                    value={selected.full_name}
                    onChangeText={(v) => setSelected({ ...selected, full_name: v })}
                    placeholder="e.g. Mia Santos"
                  />
                  <Field
                    label="Email *"
                    value={selected.email}
                    onChangeText={(v) => setSelected({ ...selected, email: v })}
                    placeholder="name@business.com"
                    keyboardType="email-address"
                  />
                  <Field
                    label="Phone"
                    value={selected.phone}
                    onChangeText={(v) => setSelected({ ...selected, phone: v })}
                    placeholder="Optional"
                    keyboardType="phone-pad"
                  />
                  <Field
                    label="Bio"
                    value={selected.bio}
                    onChangeText={(v) => setSelected({ ...selected, bio: v })}
                    placeholder="Short profile description"
                    multiline
                  />
                </Card>

                <Card style={styles.formCard}>
                  <Text style={styles.sectionTitle}>Access & status</Text>
                  <Text style={styles.subLabel}>Role</Text>
                  <View style={styles.chipsWrap}>
                    {ROLES.map((r) => (
                      <Pressable
                        key={r.value}
                        onPress={() => setSelected({ ...selected, role: r.value })}
                        style={[styles.chip, selected.role === r.value && styles.chipActive]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selected.role === r.value && styles.chipTextActive,
                          ]}
                        >
                          {r.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.subLabel}>Status</Text>
                  <View style={styles.chipsWrap}>
                    {STATUSES.map((st) => (
                      <Pressable
                        key={st}
                        onPress={() => setSelected({ ...selected, status: st })}
                        style={[styles.chip, selected.status === st && styles.chipActive]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selected.status === st && styles.chipTextActive,
                          ]}
                        >
                          {st}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </Card>

                <Card style={styles.formCard}>
                  <Text style={styles.sectionTitle}>Working hours</Text>
                  {DAY_NAMES.map((day) => {
                    const h = selected.working_hours[day] || {
                      open: false,
                      start: '09:00',
                      end: '17:00',
                    };
                    return (
                      <View key={day} style={styles.hourRow}>
                        <View style={styles.hourDayLeft}>
                          <Switch
                            value={h.open}
                            onValueChange={(val) => updateDayHour(day, { open: val })}
                            trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                            thumbColor={h.open ? colors.coral : '#fff'}
                          />
                          <Text style={styles.hourDayName}>{day}</Text>
                        </View>
                        {h.open ? (
                          <View style={styles.hourInputs}>
                            <TextInput
                              value={h.start}
                              onChangeText={(v) => updateDayHour(day, { start: v })}
                              style={styles.timeInput}
                            />
                            <Text style={{ color: colors.muted }}>to</Text>
                            <TextInput
                              value={h.end}
                              onChangeText={(v) => updateDayHour(day, { end: v })}
                              style={styles.timeInput}
                            />
                          </View>
                        ) : (
                          <Text style={styles.offText}>Off</Text>
                        )}
                      </View>
                    );
                  })}
                </Card>

                <Card style={styles.formCard}>
                  <Text style={styles.sectionTitle}>Time off dates</Text>
                  <View style={styles.timeOffAddRow}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Date (YYYY-MM-DD)"
                        value={timeOffInput}
                        onChangeText={setTimeOffInput}
                        placeholder="2026-12-25"
                      />
                    </View>
                    <Button label="Add day" secondary compact onPress={addTimeOffDate} />
                  </View>
                  {selected.time_off.length > 0 ? (
                    <View style={styles.chipsWrap}>
                      {selected.time_off.map((dt) => (
                        <Pressable
                          key={dt}
                          onPress={() =>
                            setSelected({
                              ...selected,
                              time_off: selected.time_off.filter((d) => d !== dt),
                            })
                          }
                          style={styles.timeOffPill}
                        >
                          <Text style={styles.timeOffPillText}>{dt}</Text>
                          <Ionicons name="close-circle" size={15} color={colors.danger} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </Card>

                {services.length > 0 ? (
                  <Card style={styles.formCard}>
                    <Text style={styles.sectionTitle}>Assigned services</Text>
                    <View style={styles.chipsWrap}>
                      {services.map((svc) => {
                        const checked = selected.service_ids.includes(svc.id);
                        return (
                          <Pressable
                            key={svc.id}
                            onPress={() => toggleServiceId(svc.id)}
                            style={[styles.chip, checked && styles.chipActive]}
                          >
                            <Ionicons
                              name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                              size={14}
                              color={checked ? '#fff' : colors.muted}
                            />
                            <Text style={[styles.chipText, checked && styles.chipTextActive]}>
                              {svc.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Card>
                ) : null}

                <View style={styles.footerRow}>
                  {selected.id ? (
                    <Button
                      label="Remove"
                      danger
                      icon="trash-outline"
                      onPress={() => confirmRemove(selected)}
                    />
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Button
                      label={
                        saving
                          ? 'Saving…'
                          : selected.id
                            ? 'Save changes'
                            : 'Save invited staff'
                      }
                      disabled={saving}
                      icon="checkmark"
                      onPress={() => void handleSave()}
                    />
                  </View>
                </View>
              </ScrollView>
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  kicker: { color: colors.coral, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  heading: { color: colors.ink, fontSize: 26, fontWeight: '800', marginTop: 2 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  list: { gap: space.md },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.lilac,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.navy, fontSize: 15, fontWeight: '800' },
  copy: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  email: { color: colors.muted, fontSize: 12, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
  rolePill: {
    backgroundColor: colors.canvas,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rolePillText: { color: colors.navy, fontSize: 10, fontWeight: '700' },
  daysText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  modalSafe: { flex: 1, backgroundColor: colors.canvas },
  modalContent: { padding: space.xl, gap: space.md, paddingBottom: 48 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalEyebrow: { color: colors.coral, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  modalTitle: { color: colors.ink, fontSize: 24, fontWeight: '800', marginTop: 2 },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCard: { gap: space.md },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  subLabel: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  hourDayLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  hourDayName: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  hourInputs: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeInput: {
    width: 68,
    height: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    textAlign: 'center',
    color: colors.ink,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12,
  },
  offText: { color: colors.muted, fontSize: 12, fontStyle: 'italic' },
  timeOffAddRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  timeOffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timeOffPillText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  footerRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
