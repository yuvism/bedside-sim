// The engine's working model (mirrors src/engine/model.ts): the loaded case,
// its state, lookup tables and the derived outputs for the current tick.
using System;
using System.Collections.Generic;
using System.Linq;

namespace BedsideSim.Engine
{
    public class Defs
    {
        public Dictionary<string, DrugDef> Drugs;
        public Dictionary<string, FluidDef> Fluids;
        public Dictionary<string, DeviceDef> Devices;
        public Dictionary<string, ProcedureDef> Procedures;
        public Dictionary<string, InvestigationDef> Investigations;
        public Dictionary<string, ProcessDef> Processes;

        public static Defs Build(EngineLibrary lib, CaseDef c) => new Defs
        {
            Drugs = ById(lib.Drugs, x => x.Id),
            Fluids = ById(lib.Fluids, x => x.Id),
            Devices = ById(lib.Devices, x => x.Id),
            Procedures = ById(lib.Procedures, x => x.Id),
            Investigations = ById(lib.Investigations, x => x.Id),
            Processes = ById(c.Processes, x => x.Id),
        };

        static Dictionary<string, T> ById<T>(List<T> xs, Func<T, string> id)
        {
            var d = new Dictionary<string, T>();
            foreach (var x in xs) d[id(x)] = x;
            return d;
        }
    }

    public class Computed
    {
        public Vitals Vitals = new Vitals();
        public Dictionary<string, double> Labs = new Dictionary<string, double>();
        public Dictionary<string, double> Signs = new Dictionary<string, double>();
        /// <summary>Physiological heart rate before any rhythm override.</summary>
        public double HrPre;
        /// <summary>Current drug effects: additive targets plus block:&lt;group&gt; fractions.</summary>
        public Dictionary<string, double> Fx = new Dictionary<string, double>();
    }

    public class CollectedEffects
    {
        public EffectTotals Totals;
        public Dictionary<string, double> Deltas;
        public double Fio2;
    }

    public class Model : IConditionContext
    {
        /// <summary>Ectopy shows while an ectopy-causing transient is above this amplitude.</summary>
        public const double EctopyMin = 0.25;

        public CaseDef C;
        public EngineState S;
        public Rng Rng;
        public Defs Defs;
        public Computed Out = new Computed();

        static void AddTo(Dictionary<string, double> d, string k, double v) => d[k] = (d.TryGetValue(k, out double x) ? x : 0) + v;

        /// <summary>Sum every source of effect into one table of offsets.</summary>
        public CollectedEffects CollectEffects()
        {
            var totals = Pharmacology.DrugEffects(Defs.Drugs, S.Drugs, C.Patient.WeightKg);
            var deltas = new Dictionary<string, double>();
            foreach (var ps in S.Processes)
                if (Defs.Processes.TryGetValue(ps.Id, out var def)) Processes.AccumulateEffects(def, ps, totals.Block, deltas);
            foreach (var kv in totals.Add)
                if (!kv.Key.StartsWith("process:", StringComparison.Ordinal)) AddTo(deltas, kv.Key, kv.Value);
            foreach (var f in S.Fluids)
            {
                if (!Defs.Fluids.TryGetValue(f.FluidId, out var def)) continue;
                foreach (var e in def.Effects)
                {
                    if (e.Target.StartsWith("process:", StringComparison.Ordinal)) continue; // applied per litre infused
                    double litres = Math.Min(f.CirculatingMl / 1000, e.MaxLitres ?? double.PositiveInfinity);
                    AddTo(deltas, e.Target, e.PerLitre * litres);
                }
            }
            double fio2 = Coupling.AirFio2;
            foreach (var id in S.Devices)
            {
                if (!Defs.Devices.TryGetValue(id, out var def)) continue;
                if (def.Fio2.HasValue) fio2 = Math.Max(fio2, def.Fio2.Value);
                foreach (var e in def.Effects) AddTo(deltas, e.Target, e.Value);
                if (def.HasVentilation)
                {
                    deltas["_ventSupport"] = Math.Max(deltas.TryGetValue("_ventSupport", out double vs) ? vs : 0, def.VentSupport);
                    deltas["_minRr"] = Math.Max(deltas.TryGetValue("_minRr", out double mr) ? mr : 0, def.VentMinRr);
                }
            }
            foreach (var tr in S.Transients)
                foreach (var e in tr.Effects) AddTo(deltas, e.Target, e.Value * tr.Amplitude);
            return new CollectedEffects { Totals = totals, Deltas = deltas, Fio2 = fio2 };
        }

        public Computed Compute() => Compute(CollectEffects());

        public Computed Compute(CollectedEffects eff)
        {
            var p = Coupling.Physiology(C.Baseline, S, C.Labs, eff.Deltas, eff.Fio2, C.Patient.WeightKg);
            bool ectopy = S.Transients.Any(tr => tr.Ectopy && tr.Amplitude > EctopyMin);
            var fx = new Dictionary<string, double>(eff.Totals.Add);
            foreach (var kv in eff.Totals.Block) fx["block:" + kv.Key] = kv.Value;
            if (S.Arrest || !RhythmRules.IsPerfusing(S.Rhythm))
            {
                var signs = new Dictionary<string, double>(p.Signs)
                {
                    ["cyanosis"] = 1, ["eyesClosed"] = 1, ["effort"] = 0, ["sweating"] = 0,
                };
                return new Computed
                {
                    Vitals = new Vitals
                    {
                        Hr = RhythmRules.ArrestMonitorRate(S.Rhythm),
                        Sbp = null, Dbp = null, Map = null, Spo2 = null,
                        Rr = 0,
                        // Good-quality CPR gives an EtCO2 of roughly 2–3 kPa.
                        Etco2 = S.Cpr ? 18 + (S.Noise.TryGetValue("etco2", out double n) ? n : 0) * 2 : 2,
                        Temp = p.Temp, Gcs = 3, Glucose = p.Glucose, Rhythm = S.Rhythm, Ectopy = false,
                    },
                    Labs = p.Labs, Signs = signs, HrPre = p.Hr, Fx = fx,
                };
            }
            return new Computed
            {
                Vitals = new Vitals
                {
                    Hr = p.Hr, Sbp = p.Sbp, Dbp = p.Dbp, Map = p.Map, Spo2 = p.Spo2, Rr = p.Rr, Etco2 = p.Etco2,
                    Temp = p.Temp, Gcs = p.Gcs, Glucose = p.Glucose, Rhythm = S.Rhythm, Ectopy = ectopy,
                },
                Labs = p.Labs, Signs = p.Signs, HrPre = p.Hr, Fx = fx,
            };
        }

        public double SeverityOf(string processId) => S.Processes.Find(p => p.Id == processId)?.Severity ?? 0;

        // --- IConditionContext (reads the live model, as the TypeScript closures do) ---
        public double T => S.T;
        public double Severity(string processId) => SeverityOf(processId);
        public Vitals Vitals => Out.Vitals;
        public Dictionary<string, double> Labs => Out.Labs;

        public double? FirstDoseT(string drugId, string route)
        {
            var d = S.Drugs.Find(x => x.DrugId == drugId);
            var dose = d?.Doses.Find(x => route == null || x.Route == route);
            if (dose != null) return dose.T;
            return d != null && d.InfusionRate > 0 && route == null ? S.T : (double?)null;
        }

        public bool Infusing(string drugId) => (S.Drugs.Find(d => d.DrugId == drugId)?.InfusionRate ?? 0) > 0;
        public double? ProcedureT(string procedureId) => S.ProceduresDone.TryGetValue(procedureId, out double t) ? t : (double?)null;
        public double Effect(string target) => Out.Fx.TryGetValue(target, out double v) ? v : 0;
        public bool DeviceOn(string deviceId) => S.Devices.Contains(deviceId);
        public Access Access => S.Access;
        public bool Arrest => S.Arrest;
        public bool Cpr => S.Cpr;

        public bool Check(Condition c) => Conditions.Eval(c, this);

        /// <summary>"15 L O₂" or "air", for text templates.</summary>
        public string O2Label()
        {
            foreach (var id in S.Devices)
                if (Defs.Devices.TryGetValue(id, out var def) && def.Category == "oxygen") return def.Short ?? def.Label;
            return "air";
        }

        public SimEvent Event(string type, string code, string text, Dictionary<string, object> data = null) =>
            new SimEvent { T = S.T, Type = type, Code = code, Text = text, Data = data };
    }
}
