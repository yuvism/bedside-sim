// Core engine types (mirrors src/engine/types.ts). Units: HR /min, BP mmHg,
// SpO2 %, RR /min, EtCO2 mmHg, temp °C, glucose mmol/L, gases kPa, time s.
using System.Collections.Generic;
using System.Linq;

namespace BedsideSim.Engine
{
    public static class Rhythms
    {
        public const string Sinus = "sinus", SinusTachy = "sinus_tachy", SinusBrady = "sinus_brady";
        public const string Vf = "vf", Pvt = "pvt", Pea = "pea", Asystole = "asystole";

        public static readonly string[] All =
            { "sinus", "sinus_tachy", "sinus_brady", "af", "svt", "vt", "pvt", "vf", "pea", "asystole", "stemi" };

        /// <summary>Rhythms with no cardiac output: these are cardiac arrest.</summary>
        public static readonly string[] NonPerfusing = { "pvt", "vf", "pea", "asystole" };
    }

    public class Vitals
    {
        /// <summary>Null when there is no organised rhythm (VF).</summary>
        public double? Hr;
        /// <summary>Null when there is no cardiac output.</summary>
        public double? Sbp, Dbp, Map, Spo2;
        public double Rr, Etco2, Temp, Gcs, Glucose;
        public string Rhythm;
        public bool Ectopy;

        public Vitals Clone() => (Vitals)MemberwiseClone();

        /// <summary>A vital by its case-file key (hr, sbp, dbp, map, spo2, rr, etco2, temp, gcs, glucose).</summary>
        public double? Get(string key)
        {
            switch (key)
            {
                case "hr": return Hr;
                case "sbp": return Sbp;
                case "dbp": return Dbp;
                case "map": return Map;
                case "spo2": return Spo2;
                case "rr": return Rr;
                case "etco2": return Etco2;
                case "temp": return Temp;
                case "gcs": return Gcs;
                case "glucose": return Glucose;
                default: return null;
            }
        }
    }

    public class SimEvent
    {
        /// <summary>Sim time in whole seconds.</summary>
        public double T;
        /// <summary>action, patient, finding, result, system, warn, danger, outcome, nurse.</summary>
        public string Type;
        /// <summary>Machine-readable, used by scoring: drug:adrenaline:IM, exam:A, arrest, rosc…</summary>
        public string Code;
        public string Text;
        public Dictionary<string, object> Data;

        public override string ToString() => $"{T} {Type} {Code}: {Text}";
    }

    /// <summary>One clinician action. Kind is one of the kinds in src/engine/types.ts.</summary>
    public class EngineAction
    {
        public string Kind;
        public string DrugId, Route, FluidId, DeviceId, ProcedureId, QuestionId, Text, Reply, ExamId, InvestigationId, DiagnosisId;
        public double Dose, Rate, Joules, VolumeMl;
        public bool On;

        public static EngineAction Drug(string id, string route, double dose) => new EngineAction { Kind = "drug", DrugId = id, Route = route, Dose = dose };
        public static EngineAction Infusion(string id, double rate) => new EngineAction { Kind = "infusion", DrugId = id, Rate = rate };
        public static EngineAction Cpr(bool on) => new EngineAction { Kind = "cpr", On = on };
        public static EngineAction Shock(double joules) => new EngineAction { Kind = "shock", Joules = joules };
        public static EngineAction PulseCheck() => new EngineAction { Kind = "pulse_check" };
        public static EngineAction Fluid(string id, double ml) => new EngineAction { Kind = "fluid", FluidId = id, VolumeMl = ml };
        public static EngineAction Device(string id, bool on = true) => new EngineAction { Kind = "device", DeviceId = id, On = on };
        public static EngineAction Procedure(string id) => new EngineAction { Kind = "procedure", ProcedureId = id };
        public static EngineAction Talk(string questionId) => new EngineAction { Kind = "talk", QuestionId = questionId };
        public static EngineAction Exam(string id) => new EngineAction { Kind = "exam", ExamId = id };
        public static EngineAction Order(string id) => new EngineAction { Kind = "order", InvestigationId = id };
        public static EngineAction Diagnosis(string id) => new EngineAction { Kind = "diagnosis", DiagnosisId = id };
        public static EngineAction CallHelp() => new EngineAction { Kind = "call_help" };

        /// <summary>From the JSON shape used by the TypeScript engine (e.g. in parity fixtures).</summary>
        public static EngineAction Parse(object node)
        {
            var o = J.Obj(node, "action");
            return new EngineAction
            {
                Kind = J.Str(o, "kind"),
                DrugId = J.StrOr(o, "drugId"),
                Route = J.StrOr(o, "route"),
                Dose = J.NumOpt(o, "dose") ?? 0,
                Rate = J.NumOpt(o, "rate") ?? 0,
                On = J.BoolOr(o, "on"),
                Joules = J.NumOpt(o, "joules") ?? 0,
                FluidId = J.StrOr(o, "fluidId"),
                VolumeMl = J.NumOpt(o, "volumeMl") ?? 0,
                DeviceId = J.StrOr(o, "deviceId"),
                ProcedureId = J.StrOr(o, "procedureId"),
                QuestionId = J.StrOr(o, "questionId"),
                Text = J.StrOr(o, "text"),
                Reply = J.StrOr(o, "reply"),
                ExamId = J.StrOr(o, "examId"),
                InvestigationId = J.StrOr(o, "investigationId"),
                DiagnosisId = J.StrOr(o, "diagnosisId"),
            };
        }
    }

    // ------------------------------------------------------------------
    // Serialisable engine state
    // ------------------------------------------------------------------

    public class ProcessState
    {
        public string Id;
        public double Severity, RateMul, Sensitivity;
        public ProcessState Clone() => (ProcessState)MemberwiseClone();
    }

    public class DoseRecord
    {
        public double T, Dose;
        public string Route;
    }

    public class Depot
    {
        public string Route;
        public double Amount;
    }

    public class DrugState
    {
        public string DrugId;
        public List<Depot> Depots = new List<Depot>();
        public double Central;
        public List<DoseRecord> Doses = new List<DoseRecord>();
        public double InfusionRate;

        public DrugState Clone() => new DrugState
        {
            DrugId = DrugId,
            Central = Central,
            InfusionRate = InfusionRate,
            Depots = Depots.Select(d => new Depot { Route = d.Route, Amount = d.Amount }).ToList(),
            Doses = Doses.Select(d => new DoseRecord { T = d.T, Route = d.Route, Dose = d.Dose }).ToList(),
        };
    }

    public class FluidState
    {
        public string FluidId;
        public double PendingMl, CirculatingMl, TotalMl;
        public FluidState Clone() => (FluidState)MemberwiseClone();
    }

    public class TransientState
    {
        public string SourceId;
        public double TauMin, Amplitude;
        public bool Ectopy;
        public List<FixedEffect> Effects = new List<FixedEffect>();
        public TransientState Clone() => new TransientState { SourceId = SourceId, TauMin = TauMin, Amplitude = Amplitude, Ectopy = Ectopy, Effects = Effects };
    }

    public class OrderState
    {
        public string InvestigationId, Text;
        public double OrderedT, DueT;
        public bool Reported;
        public OrderState Clone() => (OrderState)MemberwiseClone();
    }

    public class ArrestState
    {
        public double T0, CprSec, Shocks, CprSinceCheck;
        public ArrestState Clone() => (ArrestState)MemberwiseClone();
    }

    public class Access
    {
        public bool Iv, Io, Art;
        public bool Get(string kind) => kind == "iv" ? Iv : kind == "io" ? Io : kind == "art" && Art;
        public void Set(string kind)
        {
            if (kind == "iv") Iv = true;
            else if (kind == "io") Io = true;
            else if (kind == "art") Art = true;
        }
        public Access Clone() => (Access)MemberwiseClone();
    }

    public class EngineState
    {
        public string CaseId;
        public int Seed;
        public double T, Acc;
        public int Rng;
        public double BaseHr, BaseSbp, BaseDbp, BaseRr;
        public List<ProcessState> Processes = new List<ProcessState>();
        public List<DrugState> Drugs = new List<DrugState>();
        public List<FluidState> Fluids = new List<FluidState>();
        public List<TransientState> Transients = new List<TransientState>();
        public List<string> Devices = new List<string>();
        public Access Access = new Access();
        /// <summary>Smooth monitor noise by vital, in a fixed order (see SimpleEngine.Noise).</summary>
        public Dictionary<string, double> Noise = new Dictionary<string, double>();
        public string Rhythm = Rhythms.Sinus;
        public bool Arrest;
        public double? ArrestT;
        public ArrestState Als;
        public bool Cpr;
        public int Arrests;
        /// <summary>Procedure id → time it was done.</summary>
        public Dictionary<string, double> ProceduresDone = new Dictionary<string, double>();
        public List<string> LinesFired = new List<string>();
        public double StableForSec;
        /// <summary>null, "stabilised" or "died".</summary>
        public string Outcome;
        public List<OrderState> Orders = new List<OrderState>();
        public bool HelpCalled;
        public string Diagnosis;

        public EngineState Clone()
        {
            var c = (EngineState)MemberwiseClone();
            c.Processes = Processes.Select(x => x.Clone()).ToList();
            c.Drugs = Drugs.Select(x => x.Clone()).ToList();
            c.Fluids = Fluids.Select(x => x.Clone()).ToList();
            c.Transients = Transients.Select(x => x.Clone()).ToList();
            c.Devices = new List<string>(Devices);
            c.Access = Access.Clone();
            c.Noise = new Dictionary<string, double>(Noise);
            c.Als = Als?.Clone();
            c.ProceduresDone = new Dictionary<string, double>(ProceduresDone);
            c.LinesFired = new List<string>(LinesFired);
            c.Orders = Orders.Select(x => x.Clone()).ToList();
            return c;
        }
    }
}
