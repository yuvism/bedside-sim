// Coupling between systems (mirrors src/engine/coupling.ts): turns baseline
// plus summed effect offsets into a consistent set of vitals, gases and signs.
//   baroreflex     HR rises as MAP falls below the patient's baseline MAP
//   oxygenation    alveolar gas equation → V/Q gradient → Severinghaus → shunt
//   ventilation    PaCO2 from RR and lost ventilation; EtCO2 from PaCO2
//   consciousness  GCS from MAP, SpO2 and glucose;  kidneys: urine from MAP
using System;
using System.Collections.Generic;

namespace BedsideSim.Engine
{
    public class PhysOutput
    {
        public double Hr, Sbp, Dbp, Map, Spo2, Rr, Etco2, Temp, Gcs, Glucose;
        public Dictionary<string, double> Labs;
        public Dictionary<string, double> Signs;
    }

    public static class Coupling
    {
        const double PAtmKpa = 101.3;
        const double PH2oKpa = 6.3;
        const double Rq = 0.8;
        const double KpaToMmHg = 7.50062;
        public const double AirFio2 = 0.21;

        // Teaching parameters for the coupling model (listed in docs/clinical-review.md).
        public const double BaroGain = 0.6, BaroMaxHr = 60, DefaultPaco2 = 5.3, RrVentExponent = 0.5;
        public const double DefaultShunt = 0.01, DefaultVq = 0, DefaultSvo2 = 0.72, Svo2PerMapDeficit = 0.005;
        public const double GcsMapFloor = 55, GcsPerMapPoint = 1 / 3.5, GcsSpo2Floor = 85, HypoGlucose = 3;
        public const double LactatePerMapDeficit = 0.05, UrinePerMapPoint = 1.4;

        static double Clamp(double v, double lo, double hi) => JsMath.Clamp(v, lo, hi);

        public static double MapOf(double sbp, double dbp) => dbp + (sbp - dbp) / 3;

        /// <summary>Severinghaus (1979) oxyhaemoglobin dissociation curve; P in mmHg, returns 0–1.</summary>
        public static double Severinghaus(double pMmHg)
        {
            double p = Math.Max(0.1, pMmHg);
            return 1 / (23400 / (p * p * p + 150 * p) + 1);
        }

        /// <summary>Inverse of Severinghaus() by bisection; returns mmHg.</summary>
        public static double InverseSeveringhaus(double sat)
        {
            double lo = 0.1, hi = 700;
            for (int i = 0; i < 50; i++)
            {
                double mid = (lo + hi) / 2;
                if (Severinghaus(mid) < sat) lo = mid;
                else hi = mid;
            }
            return (lo + hi) / 2;
        }

        static double G(Dictionary<string, double> d, string k) => d.TryGetValue(k, out double v) ? v : 0;

        public static PhysOutput Physiology(Baseline baseline, EngineState st, Dictionary<string, double> caseLabs,
            Dictionary<string, double> d, double fio2, double weightKg)
        {
            var noise = st.Noise;
            double ratio = st.BaseDbp / st.BaseSbp;
            double baseMap = MapOf(st.BaseSbp, st.BaseDbp);

            // Circulation
            double sbp = st.BaseSbp + G(d, "sbp") + G(noise, "sbp");
            double dbp = st.BaseDbp + G(d, "dbp") + (G(d, "sbp") + G(noise, "sbp")) * ratio;
            sbp = Math.Max(25, sbp);
            dbp = Clamp(dbp, 15, sbp - 8);
            double map = MapOf(sbp, dbp);
            double mapDeficit = Math.Max(0, baseMap - map);
            double baro = Math.Min(BaroMaxHr, BaroGain * mapDeficit);
            double hr = Clamp(st.BaseHr + G(d, "hr") + baro + G(noise, "hr"), 20, 230);

            // Ventilation: assisted ventilation sets a floor on RR and replaces lost ventilation.
            double rr = Math.Max(Math.Max(4, G(d, "_minRr")), st.BaseRr + G(d, "rr") + G(noise, "rr"));
            double ventLoss = Clamp(G(d, "ventLoss") - G(d, "_ventSupport"), 0, 0.9);
            double paco2Base = baseline.Paco2 ?? DefaultPaco2;
            double ventGain = Math.Pow(st.BaseRr / rr, RrVentExponent);
            double paco2 = Clamp((paco2Base * ventGain) / (1 - ventLoss) + G(d, "lab:paco2"), 2.5, 15);

            // Oxygenation
            double pAO2 = fio2 * (PAtmKpa - PH2oKpa) - paco2 / Rq;
            double vq = Math.Max(0, (baseline.Vq ?? DefaultVq) + G(d, "vq"));
            double pc = Math.Max(1, pAO2 - vq);
            double shunt = Clamp((baseline.Shunt ?? DefaultShunt) + G(d, "shunt"), 0, 0.6);
            double svo2 = Clamp((baseline.Svo2 ?? DefaultSvo2) - Svo2PerMapDeficit * mapDeficit, 0.3, 0.85);
            double sao2 = (1 - shunt) * Severinghaus(pc * KpaToMmHg) + shunt * svo2;
            double spo2 = Clamp(100 * sao2 + G(noise, "spo2"), 50, 100);
            double pao2 = sao2 < 0.97
                ? InverseSeveringhaus(sao2) / KpaToMmHg
                : Math.Max(InverseSeveringhaus(0.97) / KpaToMmHg, pc * (1 - 2 * shunt));

            double etco2 = Math.Max(0, paco2 * KpaToMmHg - (3 + 0.15 * mapDeficit + 12 * ventLoss) + G(d, "etco2") + G(noise, "etco2"));

            // Metabolic
            double temp = baseline.Temp + G(d, "temp");
            double glucose = Math.Max(0.5, baseline.Glucose + G(d, "glucose"));
            double lactate0 = caseLabs.TryGetValue("lactate", out double l0) ? l0 : 1;
            double lactate = Math.Max(0.3, lactate0 + G(d, "lab:lactate") + LactatePerMapDeficit * Math.Max(0, 65 - map));
            double hco3 = (caseLabs.TryGetValue("hco3", out double h0) ? h0 : 24) - 0.9 * (lactate - lactate0) + G(d, "lab:hco3");
            double ph = 6.1 + Math.Log10(Math.Max(1, hco3) / (0.23 * paco2));

            // Consciousness
            double gcsDrop = Math.Max(0, GcsMapFloor - map) * GcsPerMapPoint
                + Math.Max(0, GcsSpo2Floor - spo2) / 3
                + (glucose < HypoGlucose ? (HypoGlucose - glucose) * 3 : 0)
                - G(d, "gcs");
            double gcs = Clamp(JsMath.Round(15 - gcsDrop), 3, 15);

            double urine = Clamp((map - 50) * UrinePerMapPoint, 0, 150) * (weightKg / 70);

            var labs = new Dictionary<string, double>(caseLabs);
            foreach (var kv in d)
            {
                if (!kv.Key.StartsWith("lab:", StringComparison.Ordinal)) continue;
                string key = kv.Key.Substring(4);
                labs[key] = (labs.TryGetValue(key, out double x) ? x : 0) + kv.Value;
            }
            labs["pao2"] = pao2; labs["paco2"] = paco2; labs["ph"] = ph; labs["hco3"] = hco3; labs["lactate"] = lactate;
            labs["glucose"] = glucose; labs["urine"] = urine; labs["fio2"] = fio2; labs["sao2"] = sao2;

            var signs = new Dictionary<string, double>();
            foreach (var kv in d)
                if (kv.Key.StartsWith("sign:", StringComparison.Ordinal)) signs[kv.Key.Substring(5)] = Clamp(kv.Value, 0, 1);
            signs["cyanosis"] = Clamp((92 - spo2) / 20, 0, 1);
            signs["sweating"] = Math.Max(G(signs, "sweating"), Clamp((mapDeficit - 15) / 30, 0, 1));
            signs["effort"] = Math.Max(G(signs, "effort"), Clamp((rr - 20) / 20 + ventLoss, 0, 1));
            signs["eyesClosed"] = gcs < 12 ? 1 : 0;

            return new PhysOutput
            {
                Hr = hr, Sbp = sbp, Dbp = dbp, Map = map, Spo2 = spo2, Rr = rr, Etco2 = etco2,
                Temp = temp, Gcs = gcs, Glucose = glucose, Labs = labs, Signs = signs,
            };
        }
    }
}
