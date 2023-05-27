import type { BullFeeder } from './BullFeeder'

export type TaskInputSource = {
  register(bullfeeder: BullFeeder): Promise<unknown>
}
