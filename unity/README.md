# Bedside sim — Unity port pack

> **Educational simulation. Simplified physiology. Not clinical guidance.**

A C# port of the web app's physiology engine (`src/engine/`) for Unity, reading the same case and formulary JSON from `StreamingAssets`. The same case, seed and actions at the same times give the same run as the web app; a parity test checks this against a trace exported from the TypeScript engine.

## What's here

```
unity/
  Assets/
    BedsideSim/
      Runtime/Engine/   the engine, pure C# (no UnityEngine): BedsideSim.Engine.asmdef
      Runtime/Unity/    SimulationRunner (runs a case) and MonitorUI (uGUI numerics)
      Tests/Editor/     Edit Mode tests, including the parity test
    StreamingAssets/BedsideSim/
      formulary.json  devices.json  investigations.json  team.json
      cases/*.json      the eleven cases, copied from src/content
      parity/*.json     traces exported from the TypeScript engine
  ParityRunner/         the same parity test as a .NET console app (used by CI)
```

The engine files mirror `src/engine/` one to one:

| TypeScript                 | C#                                       |
| -------------------------- | ---------------------------------------- |
| `engine.ts`                | `PhysiologyEngine.cs`, `SimpleEngine.cs` |
| `processes.ts`             | `Processes.cs`                           |
| `pharmacology.ts`          | `Pharmacology.cs`                        |
| `rhythms.ts`               | `RhythmRules.cs`                         |
| `recorder.ts`              | `Recorder.cs`                            |
| `replay.ts`                | `Replay.cs`                              |
| `coupling.ts`              | `Coupling.cs`                            |
| `conditions.ts`            | `Conditions.cs`                          |
| `actions.ts`               | `Actions.cs`                             |
| `als.ts`                   | `Als.cs`                                 |
| `model.ts`                 | `Model.cs`                               |
| `narrative.ts`             | `Narrative.cs`                           |
| `rng.ts`                   | `Rng.cs`                                 |
| `types.ts`, `caseTypes.ts` | `Types.cs`, `Library.cs`, `CaseDef.cs`   |

Plus `Json.cs` (a small JSON reader, so there are no package dependencies), `JsMath.cs` (JavaScript rounding and number formatting, needed for identical runs), `ContentLoader.cs` and `Parity.cs`.

Not ported yet: scoring (`scoring.ts`), the nurse (`team.ts`), the guided-mode coach (`coach.ts`), case variation (`variation.ts`), the free-text matcher (`dialogue.ts`, except its "I don't know" answer) and video validation. The engine runs cases without them; a Unity front end can add them on top, using `CaseDef.RawJson` for the scoring rules and teaching points.

## Set up in Unity 2022 LTS or newer

1. Create a project (any template), or open yours.
2. Copy `unity/Assets/BedsideSim` into your project's `Assets/`, and `unity/Assets/StreamingAssets/BedsideSim` into `Assets/StreamingAssets/` (create `StreamingAssets` if it doesn't exist).
3. Check that **uGUI** (`com.unity.ugui`) is installed: it is by default. For the tests you also need the **Test Framework** package (`com.unity.test-framework`), also installed by default in most templates.
4. Build a monitor:
   - Add an empty GameObject and give it a **SimulationRunner**. Set the case id (for example `anaphylaxis-01`), the seed and the speed.
   - Add a **Canvas** with **Text** objects for heart rate, SpO₂, NIBP, respiratory rate, EtCO₂, temperature, rhythm and clock. Text is uGUI's built-in text; TextMeshPro works too if you change the field types in `MonitorUI.cs`.
   - Add a **MonitorUI** to the canvas, drag the runner and the Text objects into its fields.
5. Press **Play**. Events appear in the Console; the numerics follow the engine.

Treat the patient from your own scripts:

```csharp
runner.Apply(EngineAction.Device("o2_nrb"));
runner.Apply(EngineAction.Drug("adrenaline", "IM", 0.5));
runner.Apply(EngineAction.Procedure("iv_access"));
runner.Apply(EngineAction.Fluid("crystalloid", 500));
runner.EventRaised += e => Debug.Log(e.Text);
```

Drug, device, procedure and test ids are the ones in `formulary.json`, `devices.json` and `investigations.json`.

**Android and WebGL:** `StreamingAssets` isn't a normal folder on these platforms, so `ContentLoader` (which uses `System.IO`) can't read it. Read the files with `UnityWebRequest` instead and pass the text to `EngineLibrary.Parse(...)` and `CaseDef.Parse(...)`.

## Parity test

The C# engine must reproduce the TypeScript engine. `parity/anaphylaxis-01.json` holds two runs exported from the TypeScript engine with seed 1:

- **ideal**: the anaphylaxis ideal-run script (help, oxygen, IM adrenaline at 1:00 and 6:00, IV access, fluids). It stabilises at 12:19.
- **untreated**: no treatment; PEA arrest, then death after 15 minutes without return of circulation.

The test replays both and requires every event (time, type, code and text) and every sampled vital (to within 1 × 10⁻⁶) to match. On the current code, all 23 events match exactly and the largest difference across 9,783 values is about 1 × 10⁻¹⁴.

Run it:

- **In Unity:** Window > General > Test Runner > Edit Mode > Run All.
- **Without Unity:** `dotnet run --project unity/ParityRunner/ParityRunner.csproj` (needs the .NET 8 SDK). CI runs this on every push, and also compiles the Unity scripts against API stubs.

**After changing the TypeScript engine or the content**, run `npm run unity:sync` in the web project. It copies the content JSON here and regenerates the fixtures; a unit test fails until you do. Then port the change to C# until the parity test passes again.

How parity is kept: the engine uses the same fixed 1 s tick, the same operation order, the same seeded RNG (mulberry32, with JavaScript's 32-bit integer arithmetic reproduced exactly), and JavaScript's rounding (`Math.round` rounds halves up; C#'s `Math.Round` rounds to even).

## Swapping in Pulse

The [Pulse Physiology Engine](https://pulse.kitware.com/) (Kitware, Apache-2.0) is a full, validated whole-body physiology model with a free Unity asset. The engine here is deliberately simple; Pulse can sit behind the same contract:

1. Write a class that implements `IPhysiologyEngine` (`Load`, `Step`, `Apply`, `Vitals`, `Labs`, `Snapshot`, `Restore`) and wraps the Pulse engine from the asset.
2. **Load:** start Pulse from a patient or saved state that matches the case's patient and baseline, then apply the insults or conditions that represent the case's disease processes (for example an airway obstruction, haemorrhage or infection).
3. **Step:** advance Pulse's model time by `dtSec`.
4. **Apply:** translate each `EngineAction` into the matching Pulse action: substance boluses and infusions for drugs, fluid infusions for boluses, oxygen and airway devices, and so on. Map ids through a table you keep alongside the formulary.
5. **Vitals and labs:** fill `Vitals` from Pulse's data requests (heart rate, systolic and diastolic pressure, mean arterial pressure, SpO₂, respiratory rate, end-tidal CO₂, temperature) and the lab dictionary from its blood chemistry.
6. Keep `SimulationRunner` and `MonitorUI` unchanged: they only see the interface.

Check Pulse's own documentation for its current C# API. The case files' disease processes are a simplified model, so each case needs a Pulse scenario designed (and checked by a clinician) to match. Parity with `SimpleEngine` is not expected: a Pulse-backed run is a different, more detailed model.

## Licence

MIT, like the rest of Bedside sim. Pulse is Apache-2.0 and is not included here.
