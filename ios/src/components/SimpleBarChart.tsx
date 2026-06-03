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

export default function SimpleBarChart({ data, width, height = 110, color = colors.brand[500], avgLine }: Props) {
  if (!data || data.length === 0) return <View style={{ width, height }} />;

  const PAD = { top: 8, bottom: 20, left: 36, right: 4 };
  const W = width - PAD.left - PAD.right;
  const H = height - PAD.top - PAD.bottom;

  const vals = data.map(d => d.value).filter(v => v != null);
  const minV = Math.min(...vals) * 0.95;
  const maxV = Math.max(...vals) * 1.02;
  const range = maxV - minV || 1;

  const barW = Math.max(4, (W / data.length) * 0.6);
  const gap   = W / data.length;

  const barH = (v: number) => Math.max(2, ((v - minV) / range) * H);
  const barY = (v: number) => PAD.top + H - barH(v);
  const barX = (i: number) => PAD.left + i * gap + (gap - barW) / 2;

  // Y axis ticks
  const step = range <= 5 ? 1 : range <= 20 ? 5 : range <= 50 ? 10 : 20;
  const yMin = Math.floor(minV / step) * step;
  const yMax = Math.ceil(maxV / step) * step;
  const yTicks: number[] = [];
  for (let t = yMin; t <= yMax + 0.01; t += step) yTicks.push(Math.round(t * 10) / 10);

  // X labels — show ~3
  const xIndices = data.length <= 3
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 2), data.length - 1];

  const avgBarY = avgLine != null ? PAD.top + H - ((avgLine - minV) / range) * H : null;

  return (
    <Svg width={width} height={height}>
      {yTicks.map(t => (
        <SvgText key={t} x={PAD.left - 4} y={barY(t) + 4} fontSize={9} fill={colors.gray[400]} textAnchor="end">
          {Number.isInteger(t) ? String(t) : t.toFixed(1)}
        </SvgText>
      ))}
      {data.map((d, i) => (
        <Rect key={i} x={barX(i)} y={barY(d.value)} width={barW} height={barH(d.value)}
          fill={color} rx={2} opacity={0.85} />
      ))}
      {avgBarY != null && (
        <SvgLine x1={PAD.left} y1={avgBarY} x2={PAD.left + W} y2={avgBarY}
          stroke={color} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.5} />
      )}
      {xIndices.map(i => (
        <SvgText key={i} x={barX(i) + barW / 2} y={height - 4}
          fontSize={9} fill={colors.gray[400]} textAnchor="middle">
          {data[i].label}
        </SvgText>
      ))}
    </Svg>
  );
}
