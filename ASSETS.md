# Assets

Bedside sim uses no third-party art, models, textures, sounds or fonts.

- **3D resus bay** (`src/ui/bay/`): every object (room, bed, patient, monitor, drip stand, crash trolley, wall outlets) is built in code from three.js primitive shapes. No model files are loaded.
- **Monitor screen in 3D:** drawn at runtime from the live waveform canvas and vitals.
- **2D patient avatar** (`src/ui/patient/Avatar.tsx`): hand-written inline SVG.
- **Monitor sounds:** tones generated with the Web Audio API; there are no audio files.
- **Fonts:** Atkinson Hyperlegible and Barlow Condensed, loaded from Google Fonts under the SIL Open Font License.

If CC0 assets are added later (for example from Kenney or Quaternius), list each one here with its author, source URL and licence.

## Libraries

- [three.js](https://threejs.org/) (MIT) renders the optional 3D view. It is loaded only when the 3D view is switched on.

## Reference videos

No video is included in or loaded by the app. Annotations of public videos are written in our own words, with the source named in the file:

- `src/content/validation/amax4-simulation-annotation.csv`: annotated from "AMAX4 Simulation MASTER" by Live to the MAX! (YouTube, https://www.youtube.com/watch?v=o3NDS3snnxc), a manikin simulation. Vital signs and timings only; no frames, audio, captions or transcript are reproduced.
