// A case file (mirrors src/engine/caseTypes.ts). Scoring, teaching, hints and
// variation are kept as raw JSON (RawJson) for the UI layer; the engine
// itself doesn't need them.
using System.Collections.Generic;

namespace BedsideSim.Engine
{
    public class PatientInfo
    {
        public string Name, Sex, Occupation, Persona;
        public double Age, WeightKg;
        public List<string> Allergies = new List<string>();
    }

    public class Baseline
    {
        public double Hr, Sbp, Dbp, Rr, Temp, Glucose;
        public double? Paco2, Shunt, Vq, Svo2, HrJitter, SbpJitter;
    }

    public class ProcessEffect
    {
        public string Target, Group;
        public double PerPoint;
        public double? Above, Exponent;
    }

    public class ProcessTreatment
    {
        public string Id;
        public Condition When;
        public double RatePerMin;
    }

    public class ProcessDef
    {
        public string Id, Type, Label, ArrestRhythm;
        public double Initial, RatePerMin;
        public double? InitialJitter, RateJitterPct, DecayTauMin, RecoveryPerMin, SensitivityJitterPct, ArrestAt;
        public List<ProcessEffect> Effects = new List<ProcessEffect>();
        public List<ProcessTreatment> Treatments = new List<ProcessTreatment>();
    }

    public class TextVariant
    {
        public Condition When;
        public string Text;

        public static TextVariant Parse(object n)
        {
            var o = J.Obj(n, "text variant");
            return new TextVariant { When = J.Has(o, "when") ? Condition.Parse(o["when"]) : null, Text = J.Str(o, "text") };
        }
    }

    public class DialogueEntry
    {
        public string Id, Category, Q;
        public List<string> A = new List<string>();
        public List<string> Keywords = new List<string>();
    }

    public class ExamEntry
    {
        public string Id, Label, Kind, Region;
        public List<TextVariant> Findings = new List<TextVariant>();
    }

    public class CaseInvestigation
    {
        public string Id, OrderNote;
        public List<TextVariant> Results = new List<TextVariant>();
    }

    public class PatientLine
    {
        public string Id, Text;
        public Condition When;
    }

    public class RhythmRule
    {
        public string Id, To;
        public List<string> From;
        public Condition When;
        public double? ProbPerMin;
    }

    public class DiagnosisOption
    {
        public string Id, Label;
    }

    public class CaseDef
    {
        public string Id, Title, Summary, Specialty, Difficulty, OpeningLine;
        public double Version, EstMinutes;
        public PatientInfo Patient = new PatientInfo();
        public List<string> Brief = new List<string>();
        public Baseline Baseline = new Baseline();
        public Dictionary<string, double> Labs = new Dictionary<string, double>();
        public List<ProcessDef> Processes = new List<ProcessDef>();
        public string BandProcess;
        public List<double> BandCutoffs = new List<double>();
        public List<DialogueEntry> Dialogue = new List<DialogueEntry>();
        public List<ExamEntry> Exam = new List<ExamEntry>();
        public List<CaseInvestigation> Investigations = new List<CaseInvestigation>();
        public List<PatientLine> PatientLines = new List<PatientLine>();
        public List<RhythmRule> RhythmRules = new List<RhythmRule>();
        public Condition StabilisedWhen;
        public double StabilisedForSec;
        public string StabilisedText;
        public double? MaxArrestSec;
        public List<string> CorrectDiagnoses = new List<string>();
        public List<DiagnosisOption> DiagnosisOptions = new List<DiagnosisOption>();
        /// <summary>The whole parsed file, for anything the engine doesn't model (scoring, teaching…).</summary>
        public Dictionary<string, object> RawJson;

        public static CaseDef Parse(string json) => FromNode(Json.Parse(json));

        public static CaseDef FromNode(object node)
        {
            var o = J.Obj(node, "case");
            var p = J.Obj(J.Get(o, "patient"), "patient");
            var b = J.Obj(J.Get(o, "baseline"), "baseline");
            var bands = J.Obj(J.Get(o, "bands"), "bands");
            var outcomes = J.Obj(J.Get(o, "outcomes"), "outcomes");
            var st = J.Obj(J.Get(outcomes, "stabilised"), "stabilised");
            var dx = J.Obj(J.Get(o, "diagnosis"), "diagnosis");
            return new CaseDef
            {
                RawJson = o,
                Id = J.Str(o, "id"),
                Version = J.Num(o, "version"),
                Title = J.Str(o, "title"),
                Summary = J.StrOr(o, "summary", ""),
                Specialty = J.StrOr(o, "specialty", ""),
                Difficulty = J.StrOr(o, "difficulty", ""),
                EstMinutes = J.NumOpt(o, "estMinutes") ?? 0,
                OpeningLine = J.StrOr(o, "openingLine", ""),
                Brief = J.Strings(o, "brief"),
                Patient = new PatientInfo
                {
                    Name = J.Str(p, "name"),
                    Age = J.Num(p, "age"),
                    Sex = J.Str(p, "sex"),
                    WeightKg = J.Num(p, "weightKg"),
                    Occupation = J.StrOr(p, "occupation"),
                    Persona = J.StrOr(p, "persona", ""),
                    Allergies = J.Strings(p, "allergies"),
                },
                Baseline = new Baseline
                {
                    Hr = J.Num(b, "hr"),
                    Sbp = J.Num(b, "sbp"),
                    Dbp = J.Num(b, "dbp"),
                    Rr = J.Num(b, "rr"),
                    Temp = J.Num(b, "temp"),
                    Glucose = J.Num(b, "glucose"),
                    Paco2 = J.NumOpt(b, "paco2"),
                    Shunt = J.NumOpt(b, "shunt"),
                    Vq = J.NumOpt(b, "vq"),
                    Svo2 = J.NumOpt(b, "svo2"),
                    HrJitter = J.NumOpt(b, "hrJitter"),
                    SbpJitter = J.NumOpt(b, "sbpJitter"),
                },
                Labs = J.NumberMap(o, "labs"),
                Processes = J.List(o, "processes", ParseProcess),
                BandProcess = J.Str(bands, "process"),
                BandCutoffs = J.List(bands, "cutoffs", x => (double)x),
                Dialogue = J.List(o, "dialogue", n =>
                {
                    var d = J.Obj(n, "dialogue");
                    return new DialogueEntry
                    {
                        Id = J.Str(d, "id"),
                        Category = J.StrOr(d, "category", ""),
                        Q = J.Str(d, "q"),
                        A = J.Strings(d, "a"),
                        Keywords = J.Strings(d, "keywords"),
                    };
                }),
                Exam = J.List(o, "exam", n =>
                {
                    var e = J.Obj(n, "exam");
                    return new ExamEntry
                    {
                        Id = J.Str(e, "id"),
                        Label = J.Str(e, "label"),
                        Kind = J.StrOr(e, "kind", "abcde"),
                        Region = J.StrOr(e, "region"),
                        Findings = J.List(e, "findings", TextVariant.Parse),
                    };
                }),
                Investigations = J.List(o, "investigations", n =>
                {
                    var i = J.Obj(n, "investigation");
                    return new CaseInvestigation
                    {
                        Id = J.Str(i, "id"),
                        OrderNote = J.StrOr(i, "orderNote"),
                        Results = J.List(i, "results", TextVariant.Parse),
                    };
                }),
                PatientLines = J.List(o, "patientLines", n =>
                {
                    var l = J.Obj(n, "patient line");
                    return new PatientLine { Id = J.Str(l, "id"), Text = J.Str(l, "text"), When = Condition.Parse(J.Get(l, "when")) };
                }),
                RhythmRules = J.List(o, "rhythmRules", n =>
                {
                    var r = J.Obj(n, "rhythm rule");
                    return new RhythmRule
                    {
                        Id = J.Str(r, "id"),
                        To = J.Str(r, "to"),
                        From = J.StringsOpt(r, "from"),
                        When = Condition.Parse(J.Get(r, "when")),
                        ProbPerMin = J.NumOpt(r, "probPerMin"),
                    };
                }),
                StabilisedWhen = Condition.Parse(J.Get(st, "when")),
                StabilisedForSec = J.Num(st, "forSec"),
                StabilisedText = J.Str(st, "text"),
                MaxArrestSec = J.NumOpt(outcomes, "maxArrestSec"),
                CorrectDiagnoses = J.Strings(dx, "correct"),
                DiagnosisOptions = J.List(dx, "options", n =>
                {
                    var d = J.Obj(n, "diagnosis option");
                    return new DiagnosisOption { Id = J.Str(d, "id"), Label = J.Str(d, "label") };
                }),
            };
        }

        static ProcessDef ParseProcess(object n)
        {
            var o = J.Obj(n, "process");
            return new ProcessDef
            {
                Id = J.Str(o, "id"),
                Type = J.Str(o, "type"),
                Label = J.StrOr(o, "label", ""),
                Initial = J.Num(o, "initial"),
                InitialJitter = J.NumOpt(o, "initialJitter"),
                RatePerMin = J.Num(o, "ratePerMin"),
                RateJitterPct = J.NumOpt(o, "rateJitterPct"),
                DecayTauMin = J.NumOpt(o, "decayTauMin"),
                RecoveryPerMin = J.NumOpt(o, "recoveryPerMin"),
                SensitivityJitterPct = J.NumOpt(o, "sensitivityJitterPct"),
                ArrestAt = J.NumOpt(o, "arrestAt"),
                ArrestRhythm = J.StrOr(o, "arrestRhythm"),
                Effects = J.List(o, "effects", e =>
                {
                    var x = J.Obj(e, "effect");
                    return new ProcessEffect
                    {
                        Target = J.Str(x, "target"),
                        PerPoint = J.Num(x, "perPoint"),
                        Above = J.NumOpt(x, "above"),
                        Exponent = J.NumOpt(x, "exponent"),
                        Group = J.StrOr(x, "group"),
                    };
                }),
                Treatments = J.List(o, "treatments", t =>
                {
                    var x = J.Obj(t, "treatment");
                    return new ProcessTreatment
                    {
                        Id = J.Str(x, "id"),
                        When = Condition.Parse(J.Get(x, "when")),
                        RatePerMin = J.Num(x, "ratePerMin"),
                    };
                }),
            };
        }
    }
}
