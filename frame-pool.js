// The renderer owns published buffers until it returns them. Keep a bounded
// number in flight so a slow consumer cannot queue unlimited snapshots.
export class FramePool {
  constructor(limit = 3) { this.limit = limit; this.slots = []; this.nextId = 1; }
  acquire(count, bondCount) {
    let slot = this.slots.find(item => !item.inFlight);
    if (!slot) {
      if (this.slots.length >= this.limit) return null;
      slot = { id: this.nextId++, inFlight: false }; this.slots.push(slot);
    }
    if (slot.positions?.length !== count * 3) {
      slot.positions = new Float32Array(count * 3);
      slot.types = new Uint16Array(count);
      slot.energies = new Float32Array(count);
    }
    const required = bondCount * 2;
    if (!slot.bonds || slot.bonds.length < required) slot.bonds = new Uint32Array(Math.max(required, (slot.bonds?.length ?? 0) * 2, 32));
    return slot;
  }
  publish(slot, sim) {
    slot.positions.set(sim.positions); slot.types.set(sim.types); slot.energies.set(sim.energies);
    let index = 0;
    for (const [a, b] of sim.bonds.values()) { slot.bonds[index++] = a; slot.bonds[index++] = b; }
    const frame = { frameId: slot.id, positions: slot.positions, types: slot.types, energies: slot.energies, bonds: slot.bonds.subarray(0, index) };
    slot.byteLengths = frameBuffers(frame).map(buffer => buffer.byteLength); slot.inFlight = true;
    return frame;
  }
  recycle(frame) {
    const slot = this.slots.find(item => item.id === frame.frameId && item.inFlight);
    if (!slot) return false;
    const arrays = [frame.positions, frame.types, frame.energies, frame.bonds];
    const classes = [Float32Array, Uint16Array, Float32Array, Uint32Array];
    if (arrays.some((array, i) => !(array instanceof classes[i]) || array.buffer.byteLength !== slot.byteLengths[i])) return false;
    [slot.positions, slot.types, slot.energies] = arrays;
    slot.bonds = new Uint32Array(frame.bonds.buffer); slot.inFlight = false;
    return true;
  }
}
export function frameBuffers(frame) { return [frame.positions.buffer, frame.types.buffer, frame.energies.buffer, frame.bonds.buffer]; }
