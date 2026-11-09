/**
 * The live waveform canvas of the bedside monitor, shared so the 3D view can
 * mirror it onto the monitor's screen without drawing the traces twice.
 */
let current: HTMLCanvasElement | null = null;

export function setTraceCanvas(canvas: HTMLCanvasElement | null): void {
  current = canvas;
}

export function traceCanvas(): HTMLCanvasElement | null {
  return current;
}
