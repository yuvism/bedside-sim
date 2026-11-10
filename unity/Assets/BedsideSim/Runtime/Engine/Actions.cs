// Applies a clinician's action to the model and returns the resulting events
// (mirrors src/engine/actions.ts).
using System.Collections.Generic;
using System.Linq;

namespace BedsideSim.Engine
{
    public static class Actions
    {
        const string NoAccess = "No IV access yet. Insert a cannula first.";

        // Teaching parameters for a drug-allergy reaction (listed in docs/clinical-review.md).
        public const double AllergicTauMin = 10, AllergicAmplitude = 1;
        public static readonly FixedEffect[] AllergicEffects =
        {
            new FixedEffect { Target = "sbp", Value = -40 },
            new FixedEffect { Target = "hr", Value = 30 },
            new FixedEffect { Target = "rr", Value = 6 },
            new FixedEffect { Target = "vq", Value = 3 },
            new FixedEffect { Target = "sign:hives", Value = 0.9 },
            new FixedEffect { Target = "sign:flush", Value = 0.6 },
        };

        static string F(double n) => JsMath.FmtDose(n);
        static List<SimEvent> One(SimEvent e) => new List<SimEvent> { e };
        static Dictionary<string, object> Data(params (string k, object v)[] kv) => kv.ToDictionary(x => x.k, x => x.v);
        static Dictionary<string, object> Values(Model m) => Narrative.TemplateValues(m.Out.Vitals, m.Out.Labs, m.O2Label());

        static bool NeedsAccess(string route) => route == "IV" || route == "IO";
        static bool HasAccess(Model m, string route) => route == "IO" ? m.S.Access.Io : m.S.Access.Iv || m.S.Access.Io;

        static bool RuleFires(AdverseRule rule, string route, double dose, double since, bool arrest)
        {
            if (rule.Routes != null && !rule.Routes.Contains(route)) return false;
            if (rule.WhenNotArrest && arrest) return false;
            if (rule.RepeatWithinSec.HasValue && !(since < rule.RepeatWithinSec.Value)) return false;
            if (rule.DoseAbove.HasValue && !(dose > rule.DoseAbove.Value)) return false;
            return true;
        }

        static DrugState StateFor(Model m, string drugId)
        {
            var state = m.S.Drugs.Find(d => d.DrugId == drugId);
            if (state == null)
            {
                state = Pharmacology.NewDrugState(drugId);
                m.S.Drugs.Add(state);
            }
            return state;
        }

        static List<SimEvent> GiveDrug(Model m, EngineAction a)
        {
            var s = m.S;
            if (!m.Defs.Drugs.TryGetValue(a.DrugId ?? "", out var def))
                return One(m.Event("warn", $"unknown:drug:{a.DrugId}", $"Unknown drug: {a.DrugId}."));
            var route = Pharmacology.FindRoute(def, a.Route);
            if (route == null)
                return One(m.Event("warn", $"blocked:route:{def.Id}:{a.Route}", $"{def.Name} can’t be given {a.Route}."));
            if (NeedsAccess(a.Route) && !HasAccess(m, a.Route))
                return One(m.Event("warn", $"blocked:access:drug:{def.Id}", NoAccess));
            if (!(a.Dose > 0)) return One(m.Event("warn", $"blocked:dose:{def.Id}", "Choose a dose first."));

            var state = StateFor(m, def.Id);
            double since = Pharmacology.SinceLastDose(state, a.Route, s.T);
            var fired = def.Adverse.Where(r => RuleFires(r, a.Route, a.Dose, since, s.Arrest)).ToList();
            var contra = def.Contraindications.Where(ci => m.Check(ci.When)).ToList();
            string allergy = def.AllergyClasses.FirstOrDefault(x => m.C.Patient.Allergies.Contains(x));
            Pharmacology.AddDose(state, route, a.Dose, s.T);

            int n = state.Doses.Count;
            var output = One(m.Event("action", $"drug:{def.Id}:{a.Route}",
                $"{def.Name} {F(a.Dose)} {def.Unit} {a.Route} given (dose {n}).",
                Data(("drug", def.Id), ("route", a.Route), ("dose", a.Dose), ("unit", def.Unit), ("n", n))));
            if (route.MaxDose.HasValue && a.Dose > route.MaxDose.Value * 1.0001)
                output.Add(m.Event("warn", $"dose-high:{def.Id}", $"That’s above the usual {a.Route} dose ({F(route.StandardDose)} {def.Unit})."));
            if (route.MinDose.HasValue && a.Dose < route.MinDose.Value * 0.9999)
                output.Add(m.Event("warn", $"dose-low:{def.Id}", $"That’s below the usual {a.Route} dose ({F(route.StandardDose)} {def.Unit})."));
            foreach (var rule in fired)
            {
                output.Add(m.Event(rule.Level, $"adverse:{rule.Id}", rule.Message, Data(("harm", rule.Harm))));
                if (rule.Transient != null)
                {
                    var t = rule.Transient;
                    s.Transients.Add(new TransientState { SourceId = rule.Id, TauMin = t.TauMin, Amplitude = t.Amplitude, Ectopy = t.Ectopy, Effects = t.Effects });
                }
                if (rule.Say != null) output.Add(m.Event("patient", $"say:{rule.Id}", rule.Say));
            }
            foreach (var ci in contra)
                output.Add(m.Event(ci.Harm ? "danger" : "warn", $"contraindication:{ci.Id}", ci.Message, Data(("harm", ci.Harm))));
            if (allergy != null)
            {
                output.Add(m.Event("danger", $"allergy:{def.Id}",
                    $"Allergic reaction to {def.Name.ToLowerInvariant()} (documented {allergy} allergy): flushing, wheeze and falling blood pressure.",
                    Data(("harm", true))));
                s.Transients.Add(new TransientState
                {
                    SourceId = $"allergy:{def.Id}", TauMin = AllergicTauMin, Amplitude = AllergicAmplitude, Effects = AllergicEffects.ToList(),
                });
            }
            if (def.Feedback != null) output.Add(m.Event("system", $"note:drug:{def.Id}", def.Feedback));
            return output;
        }

        static List<SimEvent> SetInfusion(Model m, EngineAction a)
        {
            if (!m.Defs.Drugs.TryGetValue(a.DrugId ?? "", out var def) || def.Infusion == null)
                return One(m.Event("warn", $"blocked:infusion:{a.DrugId}", "That drug is not given as an infusion."));
            var inf = def.Infusion;
            if (!HasAccess(m, "IV")) return One(m.Event("warn", $"blocked:access:infusion:{def.Id}", NoAccess));
            var state = StateFor(m, def.Id);
            double rate = System.Math.Max(0, a.Rate);
            double was = state.InfusionRate;
            state.InfusionRate = rate;
            if (rate == 0)
            {
                if (was == 0) return One(m.Event("system", $"noop:infusion:{def.Id}", "No infusion running."));
                return One(m.Event("action", $"infusion:{def.Id}:stop", $"{def.Name} infusion stopped."));
            }
            var output = One(m.Event("action", $"infusion:{def.Id}",
                $"{def.Name} infusion {(was > 0 ? "changed to" : "started at")} {F(rate)} {inf.Unit}.",
                Data(("drug", def.Id), ("rate", rate), ("unit", inf.Unit))));
            if (rate > inf.MaxRate * 1.0001 || rate < inf.MinRate * 0.9999)
                output.Add(m.Event("warn", $"rate-range:{def.Id}", $"That's outside the usual range ({F(inf.MinRate)}–{F(inf.MaxRate)} {inf.Unit})."));
            return output;
        }

        static List<SimEvent> GiveFluid(Model m, EngineAction a)
        {
            if (!m.Defs.Fluids.TryGetValue(a.FluidId ?? "", out var def))
                return One(m.Event("warn", $"unknown:fluid:{a.FluidId}", $"Unknown fluid: {a.FluidId}."));
            if (!HasAccess(m, "IV")) return One(m.Event("warn", $"blocked:access:fluid:{def.Id}", NoAccess));
            var f = m.S.Fluids.Find(x => x.FluidId == def.Id);
            if (f != null && f.PendingMl > 0) return One(m.Event("system", $"running:fluid:{def.Id}", "A bolus is already running."));
            if (f == null)
            {
                f = new FluidState { FluidId = def.Id };
                m.S.Fluids.Add(f);
            }
            f.PendingMl += a.VolumeMl;
            return One(m.Event("action", $"fluid:{def.Id}", $"{F(a.VolumeMl)} ml {def.Name.ToLowerInvariant()} bolus started.",
                Data(("fluid", def.Id), ("volumeMl", a.VolumeMl))));
        }

        static List<SimEvent> SetDevice(Model m, EngineAction a)
        {
            var s = m.S;
            if (!m.Defs.Devices.TryGetValue(a.DeviceId ?? "", out var def))
                return One(m.Event("warn", $"unknown:device:{a.DeviceId}", "Unknown device."));
            bool on = s.Devices.Contains(def.Id);
            if (a.On == on)
                return One(m.Event("system", $"noop:device:{def.Id}", on ? $"{def.Label} is already on." : $"{def.Label} isn’t on."));
            if (a.On)
            {
                if (def.Category == "oxygen")
                    s.Devices = s.Devices.Where(id => !(m.Defs.Devices.TryGetValue(id, out var d) && d.Category == "oxygen")).ToList();
                s.Devices.Add(def.Id);
            }
            else s.Devices = s.Devices.Where(id => id != def.Id).ToList();
            return One(m.Event("action", $"device:{def.Id}:{(a.On ? "on" : "off")}", a.On ? def.OnText : def.OffText));
        }

        static List<SimEvent> DoProcedure(Model m, EngineAction a)
        {
            if (!m.Defs.Procedures.TryGetValue(a.ProcedureId ?? "", out var def))
                return One(m.Event("warn", $"unknown:procedure:{a.ProcedureId}", "Unknown procedure."));
            bool done = def.Grants != null ? m.S.Access.Get(def.Grants) : m.S.ProceduresDone.ContainsKey(def.Id);
            if (done) return One(m.Event("system", $"noop:procedure:{def.Id}", def.AlreadyText ?? $"{def.Label}: already done."));
            if (def.Grants != null) m.S.Access.Set(def.Grants);
            m.S.ProceduresDone[def.Id] = m.S.T;
            return One(m.Event("action", $"procedure:{def.Id}", def.DoneText));
        }

        /// <summary>Severity band of the case's banding process: how well the patient can talk.</summary>
        public static int TalkBand(Model m) => Narrative.BandFor(m.C.BandCutoffs, m.SeverityOf(m.C.BandProcess));

        static List<SimEvent> Talk(Model m, EngineAction a)
        {
            string free = a.Text?.Trim();
            DialogueEntry q = null;
            if (a.QuestionId != null)
            {
                q = m.C.Dialogue.Find(d => d.Id == a.QuestionId);
                if (q == null) return One(m.Event("warn", $"unknown:talk:{a.QuestionId}", "Unknown question."));
            }
            if (q == null && string.IsNullOrEmpty(free)) return One(m.Event("warn", "unknown:talk:free", "Nothing to ask."));
            string id = q != null ? q.Id : "free";
            var asked = m.Event("action", $"talk:{id}", $"You: {(string.IsNullOrEmpty(free) ? q.Q : free)}",
                string.IsNullOrEmpty(free) ? null : Data(("free", true)));
            if (m.S.Arrest)
                return new List<SimEvent> { asked, m.Event("patient", $"answer:{id}", "No response.", Data(("nonVerbal", true))) };
            int band = TalkBand(m);
            string scripted = q != null
                ? Narrative.FillTemplate(q.A.Count == 0 ? "" : q.A[System.Math.Min(band, q.A.Count - 1)], Values(m))
                : null;
            string reply = a.Reply?.Trim();
            string text = !string.IsNullOrEmpty(reply) ? reply
                : !string.IsNullOrEmpty(scripted) ? scripted
                : Narrative.UnknownAnswer(m.C.Dialogue, band);
            return new List<SimEvent> { asked, m.Event("patient", $"answer:{id}", text, Data(("nonVerbal", Narrative.IsNonVerbal(text)))) };
        }

        static List<SimEvent> Examine(Model m, EngineAction a)
        {
            var e = m.C.Exam.Find(x => x.Id == a.ExamId);
            if (e == null) return One(m.Event("warn", $"unknown:exam:{a.ExamId}", "Unknown examination."));
            string text = Narrative.FillTemplate(Narrative.PickVariant(e.Findings, m), Values(m));
            return One(m.Event("finding", $"exam:{e.Id}", $"{e.Label}: {text}"));
        }

        static List<SimEvent> Order(Model m, EngineAction a)
        {
            var s = m.S;
            if (!m.Defs.Investigations.TryGetValue(a.InvestigationId ?? "", out var def))
                return One(m.Event("warn", $"unknown:order:{a.InvestigationId}", "Unknown test."));
            if (s.Orders.Any(o => o.InvestigationId == def.Id && !o.Reported))
                return One(m.Event("system", $"pending:{def.Id}", $"{def.Label}: already sent, waiting for it."));
            var ci = m.C.Investigations.Find(x => x.Id == def.Id);
            string raw = ci != null ? Narrative.PickVariant(ci.Results, m) : "No significant abnormality.";
            string text = Narrative.FillTemplate(string.IsNullOrEmpty(raw) ? "No significant abnormality." : raw, Values(m));
            double dueT = s.T + JsMath.Round(def.TurnaroundMin * 60);
            string verb = def.Category == "bedside" ? "done" : "sent";
            var output = One(m.Event("action", $"order:{def.Id}", $"{def.Label} {verb}."));
            if (ci?.OrderNote != null) output.Add(m.Event("system", $"note:order:{def.Id}", ci.OrderNote));
            bool immediate = dueT <= s.T;
            s.Orders.Add(new OrderState { InvestigationId = def.Id, OrderedT = s.T, DueT = dueT, Text = text, Reported = immediate });
            if (immediate) output.Add(m.Event("result", $"result:{def.Id}", $"{def.Label}: {text}"));
            return output;
        }

        static List<SimEvent> Diagnose(Model m, EngineAction a)
        {
            var opt = m.C.DiagnosisOptions.Find(o => o.Id == a.DiagnosisId);
            m.S.Diagnosis = a.DiagnosisId;
            return One(m.Event("action", $"dx:{a.DiagnosisId}", $"Working diagnosis: {opt?.Label ?? a.DiagnosisId}."));
        }

        static List<SimEvent> CallHelp(Model m)
        {
            if (m.S.HelpCalled) return One(m.Event("system", "noop:help", "Help is already on the way."));
            m.S.HelpCalled = true;
            return One(m.Event("action", "help", "Called for help — senior and crash team on the way."));
        }

        public static List<SimEvent> Apply(Model m, EngineAction a)
        {
            switch (a.Kind)
            {
                case "drug": return GiveDrug(m, a);
                case "infusion": return SetInfusion(m, a);
                case "cpr": return Als.SetCpr(m, a.On);
                case "shock": return Als.Shock(m, a.Joules);
                case "pulse_check": return Als.PulseCheck(m);
                case "fluid": return GiveFluid(m, a);
                case "device": return SetDevice(m, a);
                case "procedure": return DoProcedure(m, a);
                case "talk": return Talk(m, a);
                case "exam": return Examine(m, a);
                case "order": return Order(m, a);
                case "diagnosis": return Diagnose(m, a);
                case "call_help": return CallHelp(m);
                default: return One(m.Event("warn", $"unknown:action:{a.Kind}", "Unknown action."));
            }
        }
    }
}
