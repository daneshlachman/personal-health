import Svg, { Rect, Text as SvgText, Line as SvgLine } from 'react-native-svg';
import { View } from 'react-native';
import { colors } from '../utils/colors';

type Point = { label: string; value: number };

type Props = {
  data: Point[];
  width: number;
  height?: number;
  color?: string;
  avgLine?: number;
};

export default function SimpleBarChart({ data, width, height = 120, color = colors.brand[500], avgLine }: Props) {
  if (!data || data.length === 0) return <View style={{ width, height }} />;

  const PAD = { top: 10, bottom: 22, left: 32, right: 4 };
  const W = width - PAD.left - PAD.right;
  const H = height - PAD.top - PAD.bottom;

  const vals = data.map(d => d.value).filter(v => v != null && !isNaN(v));
  if (vals.length === 0) return <View style={{ width, height }} />;

  const maxV = Math.max(...vals);
  // Always start from 0 so bars represent absolute values
  const minV = 0;
  const range = maxV - minV || 1;

  const totalBars = data.length;
  const barW = Math.max(6, (W / totalBars) * 0.55);
  const slotW = W / totalBars;

  const px  = (i: number) => PAD.left + i * slotW + (slotW - barW) / 2;
  const barH = (v: number) => Math.max(2, (v / range) * H);
  const barY = (v: number) => PAD.top + H - barH(v);

  // Y axis: 3 ticks (0, mid, max)
  const yTick = Math.round(maxV / 2);
  const yTicks = [0, yTick, Math.round(maxV)];

  // X axis labels — show up to 5, evenly spaced
  const maxLabels = Math.min(5, totalBars);
  const xIndices = totalBars === 1
    ? [0]
    : Array.from({ length: maxLabels }, (_, i) => Math.round(i * (totalBars - 1) / (maxLabels - 1)));

  const avgY = avgLine != null ? PAD.top + H - (avgLine / range) * H : null;

  return (
    <Svg width={width} height={height}>
      {/* Y ticks */}
      {yTicks.map(t => (
        <SvgText key={t} x={PAD.left - 3} y={PAD.top + H - (t / range) * H + 4}
          fontSize={9} fill={colors.gray[400]} textAnchor="end">
          {t}
        </SvgText>
      ))}

      {/* Bars */}
      {data.map((d, i) => (
        d.value != null && !isNaN(d.value) ? (
          <Rect key={i} x={px(i)} y={barY(d.value)} width={barW} height={barH(d.value)}
            fill={color} rx={2} />
        ) : null
      ))}

      {/* Avg reference line */}
      {avgY != null && (
        <SvgLine x1={PAD.left} y1={avgY} x2={PAD.left + W} y2={avgY}
          stroke={color} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.5} />
      )}

      {/* X labels */}
      {xIndices.map(i => (
        <SvgText key={i} x={px(i) + barW / 2} y={height - 4}
          fontSize={9} fill={colors.gray[400]} textAnchor="middle">
          {data[i].label}
        </SvgText>
      ))}
    </Svg>
  );
}
