// SimpleEngine: the deterministic teaching model (mirrors SimpleEngine in
// src/engine/engine.ts). Time advances in fixed 1 s ticks. Within a tick:
// drugs absorb and clear, fluids run in, transients decay, processes progress,
// noise wanders, then vitals are recomputed and rhythm, patient lines,
// results and outcomes are checked. Same seed + same actions = same run.
using System;
using System.Collections.Generic;
using System.Linq;

namespace BedsideSim.Engine
{
    public class SimpleEngine : IBedsideEngine
    {
        /// <summary>Smooth monitor noise: correlation time (s) and SD, in this fixed order.</summary>
        public static readonly (string key, double tau, double sigma)[] Noise =
        {
            ("hr", 20, 1.2), ("sbp", 25, 1.5), ("rr", 30, 0.5), ("spo2", 15, 0.3), ("etco2", 20, 0.6),
        };

        const double Tick = 1;
        readonly EngineLibrary lib;
        Model m;

        public SimpleEngine(EngineLibrary library) { lib = library; }

        Model M => m ?? throw new InvalidOperationException("No case loaded. Call Load() first.");

        public double Time => m?.S.T ?? 0;
        public CaseDef Case => M.C;

        public void Load(CaseDef caseDef, int seed)
        {
            var rng = new Rng(Rng.SeedToState(seed));
            var b = caseDef.Baseline;
            double sbp = rng.Jitter(b.Sbp, b.SbpJitter ?? 0);
            var s = new EngineState
            {
                CaseId = caseDef.Id,
                Seed = seed,
                BaseHr = rng.Jitter(b.Hr, b.HrJitter ?? 0),
                BaseSbp = sbp,
                BaseDbp = (b.Dbp * sbp) / b.Sbp,
                BaseRr = b.Rr,
            };
            foreach (var p in caseDef.Processes) s.Processes.Add(Processes.Init(p, rng));
            foreach (var n in Noise) s.Noise[n.key] = 0;
            var model = new Model { C = caseDef, S = s, Rng = rng, Defs = Defs.Build(lib, caseDef) };
            model.Out = model.Compute();
            s.Rhythm = RhythmRules.SinusFor(model.Out.HrPre);
            model.Out = model.Compute();
            s.Rng = rng.State;
            m = model;
        }

        public bool Check(Condition c) => Conditions.Eval(c, M);

        public List<SimEvent> Step(double dtSec)
        {
            var model = M;
            var output = new List<SimEvent>();
            model.S.Acc += Math.Max(0, dtSec);
            while (model.S.Acc >= Tick - 1e-9)
            {
                model.S.Acc -= Tick;
                output.AddRange(TickOnce(model));
            }
            if (model.S.Acc < 1e-9) model.S.Acc = 0;
            model.S.Rng = model.Rng.State;
            return output;
        }

        public List<SimEvent> Apply(EngineAction action)
        {
            var model = M;
            var events = Actions.Apply(model, action);
            model.Out = model.Compute();
            model.S.Rng = model.Rng.State;
            return events;
        }

        public Vitals Vitals() => M.Out.Vitals.Clone();
        public Dictionary<string, double> Labs() => new Dictionary<string, double>(M.Out.Labs);
        public Dictionary<string, double> Signs() => new Dictionary<string, double>(M.Out.Signs);
        public Dictionary<string, double> Severities() => M.S.Processes.ToDictionary(p => p.Id, p => p.Severity);
        public EngineState State => M.S;

        public EngineState Snapshot()
        {
            M.S.Rng = M.Rng.State;
            return M.S.Clone();
        }

        public void Restore(EngineState state)
        {
            var model = M;
            if (state.CaseId != model.C.Id)
                throw new InvalidOperationException($"Snapshot is for case {state.CaseId}, but {model.C.Id} is loaded.");
            model.S = state.Clone();
            model.Rng = new Rng(state.Rng);
            model.Out = model.Compute();
        }

        // -----------------------------------------------------------------

        static List<SimEvent> TickOnce(Model m)
        {
            var s = m.S;
            var c = m.C;
            var defs = m.Defs;
            double dtMin = Tick / 60;
            double tMin = s.T / 60;
            var ev = new List<SimEvent>();

            foreach (var d in s.Drugs)
                if (defs.Drugs.TryGetValue(d.DrugId, out var def)) Pharmacology.StepDrug(def, d, dtMin, c.Patient.WeightKg);

            foreach (var f in s.Fluids)
            {
                if (!defs.Fluids.TryGetValue(f.FluidId, out var def)) continue;
                if (f.PendingMl > 0)
                {
                    double g = Math.Min(def.MaxRateMlPerMin * dtMin, f.PendingMl);
                    f.PendingMl -= g;
                    f.CirculatingMl += g;
                    f.TotalMl += g;
                    foreach (var e in def.Effects)
                    {
                        if (!e.Target.StartsWith("process:", StringComparison.Ordinal)) continue;
                        string type = e.Target.Substring("process:".Length);
                        foreach (var ps in s.Processes)
                        {
                            if (!defs.Processes.TryGetValue(ps.Id, out var pd) || pd.Type != type) continue;
                            ps.Severity = Math.Max(0, Math.Min(100, ps.Severity + (e.PerLitre * g * ps.Sensitivity) / 1000));
                        }
                    }
                    if (f.PendingMl <= 1e-6)
                    {
                        f.PendingMl = 0;
                        ev.Add(m.Event("system", $"done:fluid:{def.Id}", $"{def.Name} bolus finished."));
                    }
                }
                f.CirculatingMl *= Math.Exp(-dtMin / def.RedistributionTauMin);
            }

            foreach (var tr in s.Transients) tr.Amplitude *= Math.Exp(-dtMin / tr.TauMin);
            s.Transients = s.Transients.Where(tr => tr.Amplitude > 0.01).ToList();

            {
                // Processes keep going in arrest; drugs then only circulate with CPR.
                var totals = m.CollectEffects().Totals;
                double circulation = s.Arrest ? (s.Cpr ? 0.5 : 0) : 1;
                foreach (var ps in s.Processes)
                {
                    if (!defs.Processes.TryGetValue(ps.Id, out var def)) continue;
                    double rate = (totals.Add.TryGetValue("process:" + def.Type, out double add) ? add : 0) * circulation;
                    foreach (var tr in def.Treatments)
                        if (Conditions.Eval(tr.When, m)) rate += tr.RatePerMin;
                    Processes.Step(def, ps, tMin, dtMin, rate);
                }
            }
            foreach (var n in Noise)
                s.Noise[n.key] = Rng.OuStep(s.Noise.TryGetValue(n.key, out double x) ? x : 0, n.tau, n.sigma, Tick, m.Rng.Normal());

            s.T += Tick;
            m.Out = m.Compute();
            // Event times are stamped after the clock moves, so they line up with the vitals.
            foreach (var e in ev) e.T = s.T;

            if (!s.Arrest)
            {
                foreach (var ps in s.Processes)
                {
                    if (defs.Processes.TryGetValue(ps.Id, out var def) && def.ArrestAt.HasValue && ps.Severity >= def.ArrestAt.Value)
                    {
                        ev.AddRange(Als.EnterArrest(m, def.ArrestRhythm ?? "vf"));
                        break;
                    }
                }
            }
            if (!s.Arrest)
            {
                var r = RhythmRules.Next(s.Rhythm, m.Out.HrPre, c.RhythmRules, m, m.Rng, dtMin);
                if (r.rhythm != s.Rhythm)
                {
                    if (!RhythmRules.IsPerfusing(r.rhythm)) ev.AddRange(Als.EnterArrest(m, r.rhythm));
                    else
                    {
                        bool quiet = r.ruleId == null;
                        s.Rhythm = r.rhythm;
                        m.Out = m.Compute();
                        if (!quiet) ev.Add(m.Event("warn", $"rhythm:{r.rhythm}", $"{RhythmRules.Labels[r.rhythm]}."));
                    }
                }
            }

            if (s.Arrest) ev.AddRange(Als.ArrestTick(m, Tick));

            if (!s.Arrest)
            {
                foreach (var line in c.PatientLines)
                {
                    if (s.LinesFired.Contains(line.Id) || !Conditions.Eval(line.When, m)) continue;
                    s.LinesFired.Add(line.Id);
                    ev.Add(m.Event("patient", $"line:{line.Id}", line.Text));
                }
            }

            foreach (var o in s.Orders)
            {
                if (o.Reported || s.T < o.DueT) continue;
                o.Reported = true;
                string label = defs.Investigations.TryGetValue(o.InvestigationId, out var inv) ? inv.Label : o.InvestigationId;
                ev.Add(m.Event("result", $"result:{o.InvestigationId}", $"{label}: {o.Text}"));
            }

            if (s.Outcome == null && !s.Arrest)
            {
                if (Conditions.Eval(c.StabilisedWhen, m))
                {
                    s.StableForSec += Tick;
                    if (s.StableForSec >= c.StabilisedForSec)
                    {
                        s.Outcome = "stabilised";
                        ev.Add(m.Event("system", "stable", c.StabilisedText));
                        ev.Add(m.Event("outcome", "outcome:stabilised", "Patient stabilised."));
                    }
                }
                else s.StableForSec = 0;
            }
            return ev;
        }
    }
}
