import { TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../utils/colors';

type Props = { onPress: () => void; size?: number };

export default function PlusButton({ onPress, size = 28 }: Props) {
  const iconSize = Math.round(size * 0.43);
  return (
    <TouchableOpacity onPress={onPress}
      style={[styles.btn, { width: size, height: size, borderRadius: size / 2 }]}>
      <Svg width={iconSize} height={iconSize} viewBox="0 0 12 12">
        <Path d="M6 1v10M1 6h10" stroke="white" strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: colors.brand[500], alignItems: 'center', justifyContent: 'center' },
});
