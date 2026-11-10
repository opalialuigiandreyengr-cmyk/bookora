import { Platform, type ViewStyle } from 'react-native';

export const colors = {
  ink: '#17212B',
  muted: '#68727D',
  canvas: '#FAF8F5',
  surface: '#FFFFFF',
  surfaceMuted: '#F3EFE9',
  line: '#E8E2DA',
  lineSoft: '#F1ECE5',
  coral: '#F0645A',
  coralSoft: '#FDE9E5',
  navy: '#243B53',
  sky: '#E4F1FA',
  skyInk: '#2F628C',
  lilac: '#EEE8FA',
  mint: '#E3F4EC',
  peach: '#FCECD9',
  success: '#267A55',
  warning: '#9B6418',
  danger: '#B63F3A',
} as const;

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const shadows: Record<'card' | 'floating', ViewStyle> = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#17212B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
    },
    android: {
      elevation: 1,
    },
    default: {
      shadowColor: '#17212B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
    },
  }),
  floating: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#17212B',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
    },
    android: {
      elevation: 6,
    },
    default: {
      shadowColor: '#17212B',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
    },
  }),
};
