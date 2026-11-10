// Cardiac arrest and the ALS loop (mirrors src/engine/als.ts): CPR,
// defibrillation, rhythm/pulse checks, ROSC and death after prolonged arrest.
using System;
using System.Collections.Generic;
using System.Linq;

namespace BedsideSim.Engine
{
    public static class Als
    {
        public const double DefaultMaxArrestSec = 900;
        public const string PadsDevice = "defib_pads";

        // Teaching parameters for the ROSC model (listed in docs/clinical-review.md).
        public const double BaseShock = 0.6, BaseCheck = 0.35, MinCheckCprSec = 90, GraceSec = 60, TimeTauMin = 10;
        public const double CauseUnfixedShockable = 0.55, CauseUnfixedNonShockable = 0.12, CauseFixedMargin = 20;
        public const double AdrenalineGain = 1.25, AmiodaroneGain = 1.3, NoAdrenalineNonShockable = 0.4;
        public const double VfToAsystolePerMinNoCpr = 0.15, VfToAsystolePerMinCpr = 0.03, MaxChance = 0.92;

        public static List<SimEvent> EnterArrest(Model m, string rhythm)
        {
            var s = m.S;
            s.Arrest = true;
            s.ArrestT = s.T;
            s.Arrests += 1;
            s.Rhythm = rhythm;
            s.Als = new ArrestState { T0 = s.T };
            m.Out = m.Compute();
            return new List<SimEvent>
            {
                m.Event("danger", "arrest", $"Cardiac arrest. {RhythmRules.Labels[rhythm]} on the monitor.",
                    new Dictionary<string, object> { ["rhythm"] = rhythm }),
            };
        }

        static bool GivenDuringArrest(Model m, string drugId, double t0)
        {
            var d = m.S.Drugs.Find(x => x.DrugId == drugId);
            return d != null && d.Doses.Any(x => x.T >= t0 && (x.Route == "IV" || x.Route == "IO"));
        }

        /// <summary>Is every arrest-causing process now well below its arrest threshold?</summary>
        public static bool CauseFixed(Model m) => m.S.Processes.All(ps =>
        {
            m.Defs.Processes.TryGetValue(ps.Id, out var def);
            return def?.ArrestAt == null || ps.Severity < def.ArrestAt.Value - CauseFixedMargin;
        });

        public static double RoscChance(Model m, string via)
        {
            var s = m.S;
            var a = s.Als;
            if (a == null) return 0;
            double elapsed = Math.Max(1, s.T - a.T0);
            double quality = elapsed <= GraceSec ? 1 : 0.3 + 0.7 * JsMath.Clamp(a.CprSec / elapsed, 0, 1);
            double timeF = Math.Exp(-elapsed / 60 / TimeTauMin);
            bool shockable = RhythmRules.IsShockable(s.Rhythm);
            bool fixedCause = CauseFixed(m);
            double cause = fixedCause ? 1 : shockable ? CauseUnfixedShockable : CauseUnfixedNonShockable;
            bool adr = GivenDuringArrest(m, "adrenaline", a.T0);
            bool amio = GivenDuringArrest(m, "amiodarone", a.T0);
            double drugs = adr ? AdrenalineGain : 1;
            if (shockable && amio) drugs *= AmiodaroneGain;
            if (!shockable && !adr) drugs *= NoAdrenalineNonShockable;
            double b = via == "shock" ? BaseShock : BaseCheck;
            return JsMath.Clamp(b * quality * timeF * cause * drugs, 0, MaxChance);
        }

        static List<SimEvent> Rosc(Model m)
        {
            var s = m.S;
            double minutes = JsMath.Round((s.T - (s.Als?.T0 ?? s.T)) / 6) / 10;
            s.Arrest = false;
            s.Als = null;
            s.Cpr = false;
            s.Rhythm = "sinus_tachy";
            foreach (var ps in s.Processes)
                if (m.Defs.Processes.TryGetValue(ps.Id, out var def) && def.ArrestAt.HasValue)
                    ps.Severity = Math.Min(ps.Severity, def.ArrestAt.Value - 15);
            m.Out = m.Compute();
            return new List<SimEvent>
            {
                m.Event("system", "rosc", $"Return of spontaneous circulation after {JsMath.NumberToString(minutes)} min."),
            };
        }

        public static List<SimEvent> SetCpr(Model m, bool on)
        {
            var s = m.S;
            if (on && !s.Arrest) return new List<SimEvent> { m.Event("warn", "blocked:cpr", "There is a pulse. CPR is not indicated.") };
            if (on == s.Cpr)
                return new List<SimEvent> { m.Event("system", "noop:cpr", on ? "CPR is already running." : "CPR is not running.") };
            s.Cpr = on;
            m.Out = m.Compute();
            return new List<SimEvent> { m.Event("action", on ? "cpr:on" : "cpr:off", on ? "CPR started, 30:2." : "CPR paused.") };
        }

        public static List<SimEvent> Shock(Model m, double joules)
        {
            var s = m.S;
            if (!s.Devices.Contains(PadsDevice))
                return new List<SimEvent> { m.Event("warn", "blocked:pads", "Attach the defibrillator pads first.") };
            if (!s.Arrest || s.Als == null)
            {
                var harm = m.Event("danger", "adverse:shock_with_pulse",
                    "Unsynchronised shock delivered to a patient with a pulse. Ventricular fibrillation follows.",
                    new Dictionary<string, object> { ["harm"] = true });
                var list = new List<SimEvent> { harm };
                list.AddRange(EnterArrest(m, "vf"));
                return list;
            }
            var a = s.Als;
            a.Shocks += 1;
            a.CprSinceCheck = 0;
            var output = new List<SimEvent>
            {
                m.Event("action", "shock", $"Shock {JsMath.NumberToString(a.Shocks)} delivered, {JsMath.NumberToString(joules)} J.",
                    new Dictionary<string, object> { ["joules"] = joules, ["n"] = a.Shocks }),
            };
            if (!RhythmRules.IsShockable(s.Rhythm))
            {
                output.Add(m.Event("danger", "adverse:shock_nonshockable",
                    $"Shock delivered to a non-shockable rhythm ({RhythmRules.Labels[s.Rhythm]}). No benefit, and compressions were interrupted.",
                    new Dictionary<string, object> { ["harm"] = true }));
                return output;
            }
            if (m.Rng.Chance(RoscChance(m, "shock"))) { output.AddRange(Rosc(m)); return output; }
            output.Add(m.Event("system", "shock:no-rosc", "Still in a shockable rhythm. Resume CPR."));
            return output;
        }

        public static List<SimEvent> PulseCheck(Model m)
        {
            var s = m.S;
            var a = s.Als;
            if (!s.Arrest || a == null)
            {
                string hr = JsMath.RoundToString(m.Out.Vitals.Hr ?? 0);
                return new List<SimEvent> { m.Event("finding", "pulse", $"Central pulse present, rate about {hr}.") };
            }
            bool shockable = RhythmRules.IsShockable(s.Rhythm);
            var output = new List<SimEvent>
            {
                m.Event("finding", "pulse", $"No pulse. {RhythmRules.Labels[s.Rhythm]}: {(shockable ? "shockable" : "non-shockable")}."),
            };
            bool enoughCpr = a.CprSinceCheck >= MinCheckCprSec;
            a.CprSinceCheck = 0;
            if (!shockable && enoughCpr && m.Rng.Chance(RoscChance(m, "check"))) output.AddRange(Rosc(m));
            return output;
        }

        /// <summary>Per-tick bookkeeping while in arrest.</summary>
        public static List<SimEvent> ArrestTick(Model m, double dtSec)
        {
            var s = m.S;
            var a = s.Als;
            var output = new List<SimEvent>();
            if (a == null) return output;
            if (s.Cpr)
            {
                a.CprSec += dtSec;
                a.CprSinceCheck += dtSec;
            }
            if (RhythmRules.IsShockable(s.Rhythm) && s.T - a.T0 > 240)
            {
                double perMin = s.Cpr ? VfToAsystolePerMinCpr : VfToAsystolePerMinNoCpr;
                if (m.Rng.Chance(1 - Math.Exp((-perMin * dtSec) / 60)))
                {
                    s.Rhythm = "asystole";
                    m.Out = m.Compute();
                    output.Add(m.Event("warn", "rhythm:asystole", "The rhythm has deteriorated to asystole."));
                }
            }
            double max = m.C.MaxArrestSec ?? DefaultMaxArrestSec;
            if (s.Outcome == null && s.T - a.T0 >= max)
            {
                s.Outcome = "died";
                s.Cpr = false;
                output.Add(m.Event("danger", "died", $"Resuscitation stopped after {JsMath.RoundToString(max / 60)} minutes. The patient has died."));
                output.Add(m.Event("outcome", "outcome:died", "Patient died."));
            }
            return output;
        }
    }
}
