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
import { Button, Card, EmptyState, Field, Screen } from '@/components/ui';
import { useApp } from '@/providers/app-provider';
import { colors, space } from '@/theme';
import type { BlockTimeEvent } from '@/types';

const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export default function BlockTimeScreen() {
  const { blockEvents, addBlockTime, deleteBlockTime, refreshing, refresh } = useApp();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(todayKey);
  const [startTime, setStartTime] = useState('12:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [personalEvent, setPersonalEvent] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const dur = Number(durationMinutes);
    if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate.trim()) || !Number.isFinite(dur) || dur < 5) {
      Alert.alert('Check details', 'Add a title, valid date (YYYY-MM-DD), and duration of at least 5 minutes.');
      return;
    }
    setSaving(true);
    const err = await addBlockTime({
      title: title.trim(),
      event_date: eventDate.trim(),
      start_time: startTime.trim() || '09:00',
      duration_minutes: dur,
      personal_event: personalEvent,
      notes: notes.trim(),
    });
    setSaving(false);
    if (err) {
      Alert.alert('Could not block time', err);
      return;
    }
    setTitle('');
    setNotes('');
    setOpen(false);
  };

  const confirmDelete = (item: BlockTimeEvent) => {
    Alert.alert(`Remove "${item.title}"?`, 'This time slot will become available for bookings again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const err = await deleteBlockTime(item.id);
          if (err) Alert.alert('Could not remove blocked time', err);
        },
      },
    ]);
  };

  return (
    <>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Calendar controls</Text>
            <Text style={styles.heading}>Block time</Text>
            <Text style={styles.sub}>
              Keep appointments away from breaks, personal commitments, or maintenance.
            </Text>
          </View>
          <Button label="Block time" onPress={() => setOpen(true)} />
        </View>

        {blockEvents.length > 0 ? (
          <View style={styles.list}>
            {blockEvents.map((evt) => (
              <Card key={evt.id} style={styles.card}>
                <View style={styles.iconBox}>
                  <Ionicons name="ban-outline" size={20} color={colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{evt.title}</Text>
                  <Text style={styles.meta}>
                    {evt.event_date} · {evt.start_time} · {evt.duration_minutes} mins
                    {evt.personal_event ? ' · Personal' : ''}
                  </Text>
                  {evt.notes ? <Text style={styles.notes}>{evt.notes}</Text> : null}
                </View>
                <Pressable
                  accessibilityLabel={`Remove ${evt.title}`}
                  onPress={() => confirmDelete(evt)}
                  style={styles.deleteBtn}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </Card>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="ban-outline"
            title="No blocked periods yet"
            message="Add a break or private event to protect that time from online bookings."
            actionLabel="Block time"
            onAction={() => setOpen(true)}
          />
        )}
      </Screen>

      <Modal
        visible={open}
        animationType="fade"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.kicker}>Unavailable period</Text>
                  <Text style={styles.modalTitle}>Block time</Text>
                </View>
                <Pressable onPress={() => setOpen(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              </View>

              <Field
                label="Title *"
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Lunch break or private event"
              />
              <View style={styles.row3}>
                <View style={{ flex: 1.3 }}>
                  <Field
                    label="Date *"
                    value={eventDate}
                    onChangeText={setEventDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Start time *"
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="12:00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Mins *"
                    value={durationMinutes}
                    onChangeText={setDurationMinutes}
                    placeholder="60"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Field
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional internal note"
                multiline
              />

              <Card style={styles.switchCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Personal / private event</Text>
                  <Text style={styles.switchSub}>Hide event details from shared team views.</Text>
                </View>
                <Switch
                  value={personalEvent}
                  onValueChange={setPersonalEvent}
                  trackColor={{ false: '#D5D9DD', true: '#F5AAA4' }}
                  thumbColor={personalEvent ? colors.coral : '#fff'}
                />
              </Card>

              <Button
                label={saving ? 'Saving…' : 'Block time'}
                disabled={saving}
                icon="checkmark"
                onPress={() => void handleSave()}
              />
            </ScrollView>
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
  sub: { color: colors.muted, fontSize: 13, marginTop: 4 },
  list: { gap: space.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  notes: { color: colors.warning, fontSize: 12, marginTop: 4 },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSafe: { flex: 1, backgroundColor: colors.canvas },
  modalContent: { padding: space.xl, gap: space.md, paddingBottom: 48 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
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
  row3: { flexDirection: 'row', gap: space.sm },
  switchCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  switchTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  switchSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
