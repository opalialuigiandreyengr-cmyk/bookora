import Svg, { Path, Rect } from 'react-native-svg';

export function RobotIcon({ size = 18, color = '#FF6B57' }: { size?: number; color?: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessibilityLabel="Ask AI"
      accessibilityRole="image"
    >
      <Path
        d="M12 8V4H8"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect
        width={16}
        height={12}
        x={4}
        y={8}
        rx={2}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2 14h2M20 14h2M15 13v2M9 13v2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

