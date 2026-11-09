/**
 * Clickable body outline for head-to-toe examination. Pointer users click a
 * region; keyboard and screen-reader users use the matching buttons beside it,
 * so the drawing itself is hidden from assistive tech.
 */
interface Region {
  id: string;
  region: string;
  label: string;
}

interface Props {
  regions: Region[];
  done: Set<string>;
  disabled: boolean;
  onPick: (examId: string) => void;
}

const SHAPES: Record<string, string> = {
  head: 'M60 8 a18 20 0 1 0 0.1 0 Z',
  neck: 'M52 46 h16 v12 h-16 Z',
  chest: 'M34 58 h52 l4 46 h-60 Z',
  abdomen: 'M30 104 h60 l-2 40 h-56 Z',
  arms: 'M34 60 l-14 4 -10 78 10 2 12 -64 Z M86 60 l14 4 10 78 -10 2 -12 -64 Z',
  legs: 'M32 144 h26 l-2 104 h-16 Z M62 144 h26 l-8 104 h-16 Z',
};

export function BodyMap({ regions, done, disabled, onPick }: Props) {
  return (
    <svg viewBox="0 0 120 256" className="bodymap" aria-hidden="true" focusable="false">
      {Object.entries(SHAPES).map(([region, d]) => {
        const r = regions.find((x) => x.region === region);
        const cls = `region${r ? ' live' : ''}${done.has(region) ? ' done' : ''}`;
        return (
          <path key={region} d={d} className={cls} onClick={() => r && !disabled && onPick(r.id)}>
            {r && <title>{r.label}</title>}
          </path>
        );
      })}
    </svg>
  );
}
