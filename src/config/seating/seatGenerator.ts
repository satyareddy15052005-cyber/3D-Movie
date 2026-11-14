import { SeatData, SeatStatus, TheaterConfiguration } from '../../types/cinema';

const ROW_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function computeBaseRowXs(config: TheaterConfiguration): {
  centeredXs: number[];
  aisleXs: number[];
} {
  const { seatsPerRow, seatSpacing, aisleAfterSeats, aisleGapWidth, seatPattern } = config;
  const rawXs: number[] = [];
  let currentX = 0;

  for (let s = 1; s <= seatsPerRow; s++) {
    rawXs.push(currentX);
    if (s < seatsPerRow) {
      if (aisleAfterSeats.includes(s)) {
        currentX += seatSpacing + aisleGapWidth;
      } else if (seatPattern === 'twin_pods') {
        // Pair seats (1,2), (3,4), ... closely together with a wider gap between pods
        currentX += s % 2 === 1 ? seatSpacing * 0.84 : seatSpacing * 1.28;
      } else {
        currentX += seatSpacing;
      }
    }
  }

  const minX = rawXs[0] ?? 0;
  const maxX = rawXs[rawXs.length - 1] ?? 0;
  const centerOffset = (minX + maxX) / 2;
  const centeredXs = rawXs.map((x) => x - centerOffset);

  const aisleXs: number[] = [];
  if (aisleAfterSeats.length > 0) {
    for (const afterSeat of aisleAfterSeats) {
      const idx = afterSeat - 1;
      if (idx >= 0 && idx < centeredXs.length - 1) {
        aisleXs.push((centeredXs[idx] + centeredXs[idx + 1]) / 2);
      }
    }
  } else {
    aisleXs.push((centeredXs[0] ?? 0) - seatSpacing * 0.95);
    aisleXs.push((centeredXs[centeredXs.length - 1] ?? 0) + seatSpacing * 0.95);
  }

  return { centeredXs, aisleXs };
}

export function generateSeatsForTheater(config: TheaterConfiguration): SeatData[] {
  const seats: SeatData[] = [];
  const {
    theaterId,
    seatingRows,
    seatsPerRow,
    seatSpacing,
    rowSpacing,
    rowElevationStep,
    firstRowZ,
    seatEyeOffsetY,
    premiumRows,
    accessibleSeatIds,
    unavailableSeatIds,
    screenPosition,
    seatPattern,
  } = config;

  const { centeredXs, aisleXs } = computeBaseRowXs(config);

  for (let r = 0; r < seatingRows; r++) {
    const rowLabel = ROW_LABELS[r] || `R${r + 1}`;
    const baseRowZ = firstRowZ + r * rowSpacing;
    const tierY = Number((r * rowElevationStep).toFixed(3));
    const staggerShift =
      seatPattern === 'staggered'
        ? r % 2 === 1
          ? seatSpacing * 0.42
          : -seatSpacing * 0.22
        : 0;

    for (let s = 1; s <= seatsPerRow; s++) {
      const seatId = `${rowLabel}${s}`;
      const seatX = Number(((centeredXs[s - 1] ?? 0) + staggerShift).toFixed(3));
      const seatZ = Number(baseRowZ.toFixed(3));
      const yaw = 0;

      let status: SeatStatus = 'available';
      if (unavailableSeatIds.includes(seatId)) {
        status = 'unavailable';
      } else if (accessibleSeatIds.includes(seatId)) {
        status = 'accessible';
      } else if (premiumRows.includes(r)) {
        status = 'premium';
      }

      let nearestAisleX = aisleXs[0] ?? 0;
      let minDist = Math.abs(seatX - nearestAisleX);
      for (const ax of aisleXs) {
        const d = Math.abs(seatX - ax);
        if (d < minDist) {
          minDist = d;
          nearestAisleX = ax;
        }
      }

      const eyeY = Number((tierY + seatEyeOffsetY).toFixed(3));
      const eyeX = Number(seatX.toFixed(3));
      const eyeZ = Number((seatZ + 0.08).toFixed(3));

      seats.push({
        id: seatId,
        rowIndex: r,
        rowLabel,
        seatNumber: s,
        status,
        mapX: s - 1,
        mapY: r,
        worldPosition: [seatX, tierY, seatZ],
        eyePosition: [eyeX, eyeY, eyeZ],
        lookAtTarget: [screenPosition[0], screenPosition[1], screenPosition[2]],
        nearestAisleX: Number(nearestAisleX.toFixed(3)),
        yaw,
        theaterId,
      });
    }
  }

  return seats;
}

export function getAisleWorldXs(config: TheaterConfiguration): number[] {
  return computeBaseRowXs(config).aisleXs;
}
