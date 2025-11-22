// 序号标注渲染组件
import { Group, Circle, Rect, Text, Line } from 'react-konva';

// 序号类型转换函数
function convertNumber(num, type) {
  const n = parseInt(num, 10);
  if (isNaN(n)) return '1';
  
  switch (type) {
    case 'lower-alpha':
      return String.fromCharCode(96 + ((n - 1) % 26) + 1);
    case 'upper-alpha':
      return String.fromCharCode(64 + ((n - 1) % 26) + 1);
    case 'lower-roman':
      return toRoman(n).toLowerCase();
    case 'upper-roman':
      return toRoman(n);
    case 'cjk':
      return toChinese(n);
    case 'decimal':
    default:
      return String(n);
  }
}

// 转换为罗马数字
function toRoman(num) {
  const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const symbols = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
  let result = '';
  for (let i = 0; i < values.length && num > 0; i++) {
    while (num >= values[i]) {
      result += symbols[i];
      num -= values[i];
    }
  }
  return result || 'I';
}

// 转换为中文数字
function toChinese(num) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const units = ['', '十', '百', '千'];
  
  if (num === 0) return '零';
  if (num < 10) return digits[num];
  if (num === 10) return '十';
  if (num < 20) return '十' + digits[num % 10];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return digits[tens] + '十' + (ones > 0 ? digits[ones] : '');
  }
  
  let result = '';
  let str = String(num);
  for (let i = 0; i < str.length; i++) {
    const digit = parseInt(str[i]);
    const unit = str.length - i - 1;
    if (digit !== 0) {
      result += digits[digit] + units[unit];
    } else if (result && !result.endsWith('零')) {
      result += '零';
    }
  }
  return result.replace(/零+$/, '');
}

export default function NumberMarker({ shape, isSelected, onClick, onTransform }) {
  const {
    x = 0,
    y = 0,
    number = 1,
    numberType = 'decimal',
    style = 'circle',
    size = 32,
    backgroundColor = '#ff4d4f',
    textColor = '#ffffff',
    borderWidth = 2,
    borderColor = '#ffffff',
    opacity = 1,
    showFill = true,
    fontSize = 16,
    fontWeight = 'bold',
  } = shape;

  const radius = size / 2;
  const cornerRadius = size * 0.2;

  // 转换序号显示
  const displayNumber = convertNumber(number, numberType);

  // 渲染不同样式的背景
  const renderBackground = () => {
    const fillColor = showFill ? backgroundColor : undefined;
    
    switch (style) {
      case 'circle':
        return (
          <Circle
            x={radius}
            y={radius}
            radius={radius}
            fill={fillColor}
            stroke={borderWidth > 0 ? borderColor : undefined}
            strokeWidth={borderWidth}
            opacity={opacity}
          />
        );
      
      case 'square':
        return (
          <Rect
            x={0}
            y={0}
            width={size}
            height={size}
            fill={fillColor}
            stroke={borderWidth > 0 ? borderColor : undefined}
            strokeWidth={borderWidth}
            opacity={opacity}
          />
        );
      
      case 'rounded-square':
        return (
          <Rect
            x={0}
            y={0}
            width={size}
            height={size}
            cornerRadius={cornerRadius}
            fill={fillColor}
            stroke={borderWidth > 0 ? borderColor : undefined}
            strokeWidth={borderWidth}
            opacity={opacity}
          />
        );
      
      case 'hexagon':
        // 六边形
        const hexPoints = [];
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 2;
          hexPoints.push(radius + radius * Math.cos(angle));
          hexPoints.push(radius + radius * Math.sin(angle));
        }
        return (
          <Line
            x={0}
            y={0}
            points={hexPoints}
            closed={true}
            fill={fillColor}
            stroke={borderWidth > 0 ? borderColor : undefined}
            strokeWidth={borderWidth}
            opacity={opacity}
          />
        );
      
      case 'diamond':
        // 菱形
        const diamondPoints = [
          radius, 0,
          size, radius,
          radius, size,
          0, radius,
        ];
        return (
          <Line
            points={diamondPoints}
            closed={true}
            fill={fillColor}
            stroke={borderWidth > 0 ? borderColor : undefined}
            strokeWidth={borderWidth}
            opacity={opacity}
          />
        );
      
      case 'octagon':
        // 八边形
        const octPoints = [];
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI / 4) * i - Math.PI / 2;
          octPoints.push(radius + radius * Math.cos(angle));
          octPoints.push(radius + radius * Math.sin(angle));
        }
        return (
          <Line
            x={0}
            y={0}
            points={octPoints}
            closed={true}
            fill={fillColor}
            stroke={borderWidth > 0 ? borderColor : undefined}
            strokeWidth={borderWidth}
            opacity={opacity}
          />
        );
      
      case 'tag':
        const notchSize = size * 0.15;
        const tagPoints = [
          cornerRadius, 0,
          size - notchSize, 0,
          size, radius,
          size - notchSize, size,
          cornerRadius, size,
          0, size - cornerRadius,
          0, cornerRadius,
        ];
        return (
          <Line
            points={tagPoints}
            closed={true}
            fill={fillColor}
            stroke={borderWidth > 0 ? borderColor : undefined}
            strokeWidth={borderWidth}
            opacity={opacity}
          />
        );
      
      case 'badge':
        const badgePoints = [
          cornerRadius, 0,
          size - cornerRadius, 0,
          size, cornerRadius,
          size, size * 0.65,
          radius, size,
          0, size * 0.65,
          0, cornerRadius,
        ];
        return (
          <Line
            points={badgePoints}
            closed={true}
            fill={fillColor}
            stroke={borderWidth > 0 ? borderColor : undefined}
            strokeWidth={borderWidth}
            opacity={opacity}
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <Group
      x={x}
      y={y}
      draggable={shape.draggable}
      onClick={onClick}
      onTap={onClick}
      onDragEnd={(e) => {
        if (onTransform) {
          onTransform({
            ...shape,
            x: e.target.x(),
            y: e.target.y(),
          });
        }
      }}
    >
      {/* 背景 */}
      {renderBackground()}
      
      {/* 序号文字 */}
      <Text
        x={0}
        y={0}
        width={size}
        height={size}
        text={displayNumber}
        fontSize={fontSize}
        fontFamily="Arial, sans-serif"
        fontStyle={fontWeight}
        fill={textColor}
        align="center"
        verticalAlign="middle"
        opacity={opacity}
      />
      
      {/* 选中状态的高亮边框 */}
      {isSelected && (
        <Rect
          x={-2}
          y={-2}
          width={size + 4}
          height={size + 4}
          stroke="#00a8ff"
          strokeWidth={2}
          dash={[4, 4]}
          listening={false}
        />
      )}
    </Group>
  );
}
