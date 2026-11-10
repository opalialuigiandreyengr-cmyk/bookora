import { Redirect, type Href } from 'expo-router';
import { LoadingState } from '@/components/ui';
import { useApp } from '@/providers/app-provider';

export default function Index() {
  const { loading, session, needsOnboarding, adminContext } = useApp();
  if (loading) return <LoadingState />;
  if (!session) return <Redirect href="/sign-in" />;
  if (adminContext.is_admin) return <Redirect href={'/admin' as Href} />;
  return <Redirect href={needsOnboarding ? '/onboarding' : '/(tabs)'} />;
}
