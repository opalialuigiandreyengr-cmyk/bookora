import { Redirect } from 'expo-router';
import { LoadingState } from '@/components/ui';
import { useApp } from '@/providers/app-provider';

export default function Index() {
  const { loading, session } = useApp();
  if (loading) return <LoadingState />;
  return <Redirect href={session ? '/(tabs)' : '/sign-in'} />;
}
