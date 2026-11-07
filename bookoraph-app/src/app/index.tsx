import { Redirect } from 'expo-router';
import { LoadingState } from '@/components/ui';
import { useApp } from '@/providers/app-provider';

export default function Index() {
  const { loading, session, needsOnboarding } = useApp();
  if (loading) return <LoadingState />;
  if (!session) return <Redirect href="/sign-in" />;
  return <Redirect href={needsOnboarding ? '/onboarding' : '/(tabs)'} />;
}
