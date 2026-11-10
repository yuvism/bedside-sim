// Disease processes (mirrors src/engine/processes.ts). Each has a severity
// 0–100 that progresses on its own, is pushed down by treatments, and maps
// onto vitals, labs and signs through per-point effects.
//   dS/dt = rate·rateMul·e^(−t/τ) − recovery·S + Σ(treatment)·sensitivity
using System;
using System.Collections.Generic;

namespace BedsideSim.Engine
{
    public static class Processes
    {
        public const double SeverityMax = 100;

        /// <summary>Draws seeded variation in a fixed order, so the same seed gives the same patient.</summary>
        public static ProcessState Init(ProcessDef def, Rng rng)
        {
            double severity = JsMath.Clamp(rng.Jitter(def.Initial, def.InitialJitter ?? 0), 0, SeverityMax);
            double rateMul = 1 + rng.Jitter(0, def.RateJitterPct ?? 0) / 100;
            double sensitivity = 1 + rng.Jitter(0, def.SensitivityJitterPct ?? 0) / 100;
            return new ProcessState { Id = def.Id, Severity = severity, RateMul = rateMul, Sensitivity = sensitivity };
        }

        /// <summary>Untreated drive in severity points per minute at time tMin.</summary>
        public static double Drive(ProcessDef def, ProcessState s, double tMin)
        {
            double decay = def.DecayTauMin.HasValue && def.DecayTauMin.Value != 0 ? Math.Exp(-tMin / def.DecayTauMin.Value) : 1;
            return def.RatePerMin * s.RateMul * decay;
        }

        /// <summary>Advance one process by dtMin minutes; treatmentPerMin is negative when improving.</summary>
        public static void Step(ProcessDef def, ProcessState s, double tMin, double dtMin, double treatmentPerMin)
        {
            double recovery = (def.RecoveryPerMin ?? 0) * s.Severity;
            double rate = Drive(def, s, tMin) - recovery + treatmentPerMin * s.Sensitivity;
            s.Severity = JsMath.Clamp(s.Severity + rate * dtMin, 0, SeverityMax);
        }

        public static double EffectValue(ProcessEffect e, double severity)
        {
            double x = Math.Max(0, severity - (e.Above ?? 0));
            if (x == 0) return 0;
            double exp = e.Exponent ?? 1;
            return e.PerPoint * (exp == 1 ? x : Math.Pow(x, exp));
        }

        /// <summary>Add this process's effects into `output`, scaled down by any active blocks.</summary>
        public static void AccumulateEffects(ProcessDef def, ProcessState s, Dictionary<string, double> blocks, Dictionary<string, double> output)
        {
            foreach (var e in def.Effects)
            {
                double v = EffectValue(e, s.Severity);
                if (v == 0) continue;
                if (!string.IsNullOrEmpty(e.Group)) v *= 1 - (blocks.TryGetValue(e.Group, out double b) ? b : 0);
                output[e.Target] = (output.TryGetValue(e.Target, out double o) ? o : 0) + v;
            }
        }
    }
}
