import { Linking, Platform } from 'react-native';

export async function openExternalLink(url: string) {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (/^(mailto:|tel:)/i.test(url)) {
        window.location.href = url;
        return true;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
