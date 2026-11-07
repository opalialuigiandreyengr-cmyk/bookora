import { Linking } from 'react-native';

export async function openExternalLink(url: string) {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
