const C = 12

export const SHEET = { side: 13, radius: 3.75, offset: 3.25 } as const

export const DISC = { radius: 8 } as const

export const TICK = 'M8.5 12.3L11.1 14.9L15.5 9.7'

export const SEAM = 2.4

export const DASH = '1 2'

export function sheetPose(dir: 1 | -1) {
  const near = C - SHEET.side / 2 + dir * SHEET.offset
  return {
    attrX: near,
    attrY: near,
    width: SHEET.side,
    height: SHEET.side,
    rx: SHEET.radius,
  }
}

export const DISC_POSE = {
  attrX: C - DISC.radius,
  attrY: C - DISC.radius,
  width: DISC.radius * 2,
  height: DISC.radius * 2,
  rx: DISC.radius,
}
