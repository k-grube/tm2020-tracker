import type { Detector } from './types.ts'

export const steerDevice: Detector = (ctx) => {
  const distinct = ctx.steer ? new Set(ctx.steer).size : 0
  return {
    id: 'steer_device',
    level: 'info',
    applicable: ctx.steer !== null,
    fired: false,
    value: null,
    unit: '',
    evidence: [`device: ${ctx.device}, distinct steer values: ${distinct}`],
    references: [],
  }
}
