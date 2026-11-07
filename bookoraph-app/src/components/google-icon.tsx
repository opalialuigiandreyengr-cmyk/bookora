import Svg, { Path } from 'react-native-svg';

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Google" accessibilityRole="image">
      <Path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.54-.23-2.27H12v4.3h5.22c-.23 1.5-.87 2.78-1.85 3.63v3h3c1.76-1.62 2.98-4.01 2.98-8.66Z" />
      <Path fill="#34A853" d="M12 22c2.52 0 4.63-.83 6.17-2.25l-3-3c-.83.56-1.89.89-3.17.89-2.43 0-4.49-1.64-5.23-3.84H3.67v3.09C5.2 19.98 8.35 22 12 22Z" />
      <Path fill="#FBBC05" d="M6.77 13.8A6.9 6.9 0 0 1 6.41 12c0-.62.13-1.22.36-1.8V7.11H3.67A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.49l3.7-2.69Z" />
      <Path fill="#EA4335" d="M12 6.36c1.37 0 2.6.47 3.57 1.4l2.67-2.67C16.63 3.52 14.52 2.5 12 2.5 8.35 2.5 5.2 4.52 3.67 7.61l3.7 2.69C8.34 8 9.57 6.36 12 6.36Z" />
    </Svg>
  );
}
