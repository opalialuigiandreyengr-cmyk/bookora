import type { ComponentProps } from 'react';
import { StyleSheet, Text as NativeText } from 'react-native';

type TextProps = ComponentProps<typeof NativeText>;

function familyFor(style: TextProps['style']) {
  const weight = String(StyleSheet.flatten(style)?.fontWeight ?? '400');
  if (weight === '300' || weight === 'light') return 'SpaceGrotesk_300Light';
  if (weight === '500' || weight === 'medium') return 'SpaceGrotesk_500Medium';
  if (weight === '600' || weight === 'semibold') return 'SpaceGrotesk_600SemiBold';
  if (['700', '800', '900', 'bold'].includes(weight)) return 'SpaceGrotesk_700Bold';
  return 'SpaceGrotesk_400Regular';
}

export function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[style, { fontFamily: familyFor(style), fontWeight: 'normal' }]} />;
}

