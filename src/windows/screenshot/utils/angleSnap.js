const calculateAngle = (x1, y1, x2, y2) => {
  return Math.atan2(y2 - y1, x2 - x1);
};

const snapAngleTo22_5Degrees = (angle) => {
  const step = Math.PI / 8;
  return Math.round(angle / step) * step;
};

export const snapToAngle = (startX, startY, currentX, currentY) => {
  const dx = currentX - startX;
  const dy = currentY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 1) {
    return { x: currentX, y: currentY };
  }
  
  const angle = calculateAngle(startX, startY, currentX, currentY);
  const snappedAngle = snapAngleTo22_5Degrees(angle);
  
  return {
    x: startX + distance * Math.cos(snappedAngle),
    y: startY + distance * Math.sin(snappedAngle),
  };
};
