// One-compartment pharmacokinetics with first-order absorption, and an Emax
// effect per target (mirrors src/engine/pharmacology.ts).
//   depot --ka--> central --ke--> eliminated
//   effect = Emax × C / (EC50 + C), C normalised to a 70 kg adult
using System;
using System.Collections.Generic;

namespace BedsideSim.Engine
{
    public class EffectTotals
    {
        /// <summary>Summed additive effects by target (including process:&lt;type&gt;).</summary>
        public Dictionary<string, double> Add = new Dictionary<string, double>();
        /// <summary>Combined block fraction by group: 1 − Π(1 − bᵢ).</summary>
        public Dictionary<string, double> Block = new Dictionary<string, double>();
    }

    public static class Pharmacology
    {
        const double RefWeightKg = 70;
        const double Negligible = 1e-6;
        const double MaxBlock = 0.95;
        // JavaScript Math.LN2, bit for bit.
        const double Ln2 = 0.6931471805599453;

        public static DrugState NewDrugState(string drugId) => new DrugState { DrugId = drugId };

        public static DrugRoute FindRoute(DrugDef def, string route) => def.Routes.Find(r => r.Route == route);

        /// <summary>Put a dose into the body at time t (seconds).</summary>
        public static void AddDose(DrugState s, DrugRoute route, double dose, double t)
        {
            double amount = dose * route.Bioavailability;
            if (route.AbsorptionHalfLifeMin > 0)
            {
                var depot = s.Depots.Find(d => d.Route == route.Route);
                if (depot != null) depot.Amount += amount;
                else s.Depots.Add(new Depot { Route = route.Route, Amount = amount });
            }
            else s.Central += amount;
            s.Doses.Add(new DoseRecord { T = t, Route = route.Route, Dose = dose });
        }

        /// <summary>Drug amount per minute delivered by the current infusion rate.</summary>
        public static double InfusionAmountPerMin(DrugDef def, double rate, double weightKg)
        {
            var inf = def.Infusion;
            if (inf == null || rate <= 0) return 0;
            return rate * inf.AmountPerMinPerRate * (inf.PerKg ? weightKg : 1);
        }

        /// <summary>Advance infusion, absorption and elimination by dtMin minutes.</summary>
        public static void StepDrug(DrugDef def, DrugState s, double dtMin, double weightKg)
        {
            s.Central += InfusionAmountPerMin(def, s.InfusionRate, weightKg) * dtMin;
            foreach (var depot in s.Depots)
            {
                var r = FindRoute(def, depot.Route);
                double half = r != null && r.AbsorptionHalfLifeMin > 0 ? r.AbsorptionHalfLifeMin : 1e-3;
                double moved = depot.Amount * (1 - Math.Exp((-Ln2 / half) * dtMin));
                depot.Amount -= moved;
                s.Central += moved;
                if (depot.Amount < Negligible) depot.Amount = 0;
            }
            s.Central *= Math.Exp((-Ln2 / def.HalfLifeMin) * dtMin);
            if (s.Central < Negligible) s.Central = 0;
        }

        public static double EmaxEffect(double c, double emax, double ec50) => c > 0 ? (emax * c) / (ec50 + c) : 0;

        public static EffectTotals DrugEffects(Dictionary<string, DrugDef> defs, List<DrugState> states, double weightKg)
        {
            var totals = new EffectTotals();
            var unblocked = new Dictionary<string, double>();
            double scale = RefWeightKg / weightKg;
            foreach (var s in states)
            {
                if (!defs.TryGetValue(s.DrugId, out var def) || s.Central <= 0) continue;
                double c = s.Central * scale;
                foreach (var e in def.Effects)
                {
                    double v = EmaxEffect(c, e.Emax, e.Ec50);
                    if (e.Target.StartsWith("block:", StringComparison.Ordinal))
                    {
                        string g = e.Target.Substring(6);
                        double b = Math.Min(MaxBlock, Math.Max(0, v));
                        unblocked[g] = (unblocked.TryGetValue(g, out double u) ? u : 1) * (1 - b);
                    }
                    else totals.Add[e.Target] = (totals.Add.TryGetValue(e.Target, out double a) ? a : 0) + v;
                }
            }
            foreach (var kv in unblocked) totals.Block[kv.Key] = 1 - kv.Value;
            return totals;
        }

        /// <summary>Seconds since the last dose of this drug by this route, or +∞.</summary>
        public static double SinceLastDose(DrugState s, string route, double t)
        {
            if (s == null) return double.PositiveInfinity;
            for (int i = s.Doses.Count - 1; i >= 0; i--)
                if (s.Doses[i].Route == route) return t - s.Doses[i].T;
            return double.PositiveInfinity;
        }
    }
}
