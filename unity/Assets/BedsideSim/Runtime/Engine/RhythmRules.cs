// Rhythm state machine (mirrors src/engine/rhythms.ts). Sinus-family
// rhythms follow the heart rate; every other rhythm is latched until a rule
// or a procedure moves it on. Probabilistic rules draw from the seeded RNG.
using System;
using System.Collections.Generic;

namespace BedsideSim.Engine
{
    public static class RhythmRules
    {
        public static readonly string[] SinusFamily = { "sinus", "sinus_tachy", "sinus_brady" };
        /// <summary>Shockable arrest rhythms (ALS).</summary>
        public static readonly string[] Shockable = { "vf", "pvt" };

        public static readonly Dictionary<string, string> Labels = new Dictionary<string, string>
        {
            ["sinus"] = "Sinus rhythm",
            ["sinus_tachy"] = "Sinus tachycardia",
            ["sinus_brady"] = "Sinus bradycardia",
            ["af"] = "Atrial fibrillation",
            ["svt"] = "Supraventricular tachycardia",
            ["vt"] = "Ventricular tachycardia",
            ["pvt"] = "Pulseless ventricular tachycardia",
            ["vf"] = "Ventricular fibrillation",
            ["pea"] = "Pulseless electrical activity",
            ["asystole"] = "Asystole",
            ["stemi"] = "Sinus rhythm with ST elevation",
        };

        public static bool IsPerfusing(string r) => Array.IndexOf(Rhythms.NonPerfusing, r) < 0;
        public static bool IsSinusFamily(string r) => Array.IndexOf(SinusFamily, r) >= 0;
        public static bool IsShockable(string r) => Array.IndexOf(Shockable, r) >= 0;

        public static string SinusFor(double hr)
        {
            if (hr >= 100) return "sinus_tachy";
            if (hr < 50) return "sinus_brady";
            return "sinus";
        }

        /// <summary>Electrical rate shown on the monitor during arrest rhythms (null = unmeasurable).</summary>
        public static double? ArrestMonitorRate(string r)
        {
            switch (r)
            {
                case "vf": return null;
                case "asystole": return 0;
                case "pvt": return 190;
                case "pea": return 42;
                default: return null;
            }
        }

        /// <summary>One rhythm update; rules are checked in order and the first that triggers wins.</summary>
        public static (string rhythm, string ruleId) Next(string current, double hr, List<RhythmRule> rules,
            IConditionContext ctx, Rng rng, double dtMin)
        {
            foreach (var rule in rules)
            {
                if (rule.To == current) continue;
                if (rule.From != null && !rule.From.Contains(current)) continue;
                if (!Conditions.Eval(rule.When, ctx)) continue;
                if (rule.ProbPerMin.HasValue)
                {
                    double p = 1 - Math.Exp(-rule.ProbPerMin.Value * dtMin);
                    if (!rng.Chance(p)) continue;
                }
                return (rule.To, rule.Id);
            }
            if (IsSinusFamily(current)) return (SinusFor(hr), null);
            return (current, null);
        }
    }
}
