import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { AppointmentOverviewSheet } from '@/components/calendar/AppointmentOverviewSheet';
import { Button } from '@/components/ui';
import { goBackOrReplace } from '@/lib/navigation';
import { useApp } from '@/providers/app-provider';
import { colors } from '@/theme';

export default function AppointmentPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    appointments,
    services,
    clients,
    updateAppointmentStatus,
    updateAppointment,
    updateAppointmentFinalAmount,
    collectPayment,
    deleteAppointment,
  } = useApp();

  const appointment = appointments.find((item) => item.id === id);

  if (!appointment) {
    return (
      <SafeAreaView style={styles.emptyPage} edges={['top', 'bottom']}>
        <View style={styles.emptyCopy}>
          <Text style={styles.emptyTitle}>Appointment not found</Text>
          <Text style={styles.emptySubtitle}>This appointment may have been removed.</Text>
          <Button label="Back to calendar" icon="calendar-outline" onPress={() => goBackOrReplace('/(tabs)/calendar')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <AppointmentOverviewSheet
        page
        key={appointment.id}
        appointment={appointment}
        services={services}
        clients={clients}
        onClose={() => goBackOrReplace('/(tabs)/calendar')}
        onUpdateStatus={updateAppointmentStatus}
        onUpdateAppointment={updateAppointment}
        onUpdateFinalAmount={updateAppointmentFinalAmount}
        onCollectPayment={collectPayment}
        onDeleteAppointment={async (appointmentId) => {
          const error = await deleteAppointment(appointmentId);
          if (!error) goBackOrReplace('/(tabs)/calendar');
          return error;
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  emptyPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.canvas,
  },
  emptyCopy: {
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
});
