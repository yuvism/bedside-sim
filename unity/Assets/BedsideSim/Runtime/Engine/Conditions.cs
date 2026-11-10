// The serialisable Condition language used in case files (mirrors
// src/engine/conditions.ts). A condition is one of the shapes below; exactly
// one of the identifying fields is set.
using System;
using System.Collections.Generic;

namespace BedsideSim.Engine
{
    public class Condition
    {
        public string Severity, Vital, Lab, Effect, DrugGiven, Route, Infusing, Procedure, Device, Access;
        public double? Gte, Lt, ForSec, WithinSec;
        /// <summary>{ time: { gte, lt } }.</summary>
        public bool IsTime;
        public bool? Arrest, Cpr, Ectopy;
        public List<string> Rhythm;
        public List<Condition> All, Any;
        public Condition Not;

        public static Condition Parse(object node)
        {
            var o = J.Obj(node, "condition");
            var c = new Condition();
            if (J.Has(o, "all")) { c.All = J.List(o, "all", Parse); return c; }
            if (J.Has(o, "any")) { c.Any = J.List(o, "any", Parse); return c; }
            if (J.Has(o, "not")) { c.Not = Parse(o["not"]); return c; }
            c.Gte = J.NumOpt(o, "gte");
            c.Lt = J.NumOpt(o, "lt");
            if (J.Has(o, "time"))
            {
                var t = J.Obj(o["time"], "time");
                c.IsTime = true;
                c.Gte = J.NumOpt(t, "gte");
                c.Lt = J.NumOpt(t, "lt");
            }
            c.Severity = J.StrOr(o, "severity");
            c.Vital = J.StrOr(o, "vital");
            c.Lab = J.StrOr(o, "lab");
            c.Effect = J.StrOr(o, "effect");
            c.DrugGiven = J.StrOr(o, "drugGiven");
            c.Route = J.StrOr(o, "route");
            c.ForSec = J.NumOpt(o, "forSec");
            c.WithinSec = J.NumOpt(o, "withinSec");
            c.Infusing = J.StrOr(o, "infusing");
            c.Procedure = J.StrOr(o, "procedure");
            c.Device = J.StrOr(o, "device");
            c.Access = J.StrOr(o, "access");
            c.Arrest = J.BoolOpt(o, "arrest");
            c.Cpr = J.BoolOpt(o, "cpr");
            c.Ectopy = J.BoolOpt(o, "ectopy");
            c.Rhythm = J.StringsOpt(o, "rhythm");
            return c;
        }
    }

    /// <summary>What a condition can see (mirrors ConditionContext in conditions.ts).</summary>
    public interface IConditionContext
    {
        double T { get; }
        double Severity(string processId);
        Vitals Vitals { get; }
        Dictionary<string, double> Labs { get; }
        double? FirstDoseT(string drugId, string route);
        bool Infusing(string drugId);
        double? ProcedureT(string procedureId);
        double Effect(string target);
        bool DeviceOn(string deviceId);
        Access Access { get; }
        bool Arrest { get; }
        bool Cpr { get; }
    }

    public static class Conditions
    {
        public static bool InRange(double? v, double? gte, double? lt)
        {
            if (!v.HasValue || double.IsNaN(v.Value)) return false;
            if (gte.HasValue && v.Value < gte.Value) return false;
            if (lt.HasValue && v.Value >= lt.Value) return false;
            return true;
        }

        static bool SinceOk(double? at, double now, double? forSec, double? withinSec)
        {
            if (!at.HasValue) return false;
            if (forSec.HasValue && now - at.Value < forSec.Value) return false;
            if (withinSec.HasValue && now - at.Value >= withinSec.Value) return false;
            return true;
        }

        public static bool Eval(Condition c, IConditionContext ctx)
        {
            if (c.All != null) { foreach (var x in c.All) if (!Eval(x, ctx)) return false; return true; }
            if (c.Any != null) { foreach (var x in c.Any) if (Eval(x, ctx)) return true; return false; }
            if (c.Not != null) return !Eval(c.Not, ctx);
            if (c.Severity != null) return InRange(ctx.Severity(c.Severity), c.Gte, c.Lt);
            if (c.Vital != null) return InRange(ctx.Vitals.Get(c.Vital), c.Gte, c.Lt);
            if (c.Lab != null) return InRange(ctx.Labs.TryGetValue(c.Lab, out double lab) ? lab : (double?)null, c.Gte, c.Lt);
            if (c.Effect != null) return InRange(ctx.Effect(c.Effect), c.Gte, c.Lt);
            if (c.IsTime) return InRange(ctx.T, c.Gte, c.Lt);
            if (c.DrugGiven != null) return SinceOk(ctx.FirstDoseT(c.DrugGiven, c.Route), ctx.T, c.ForSec, null);
            if (c.Infusing != null) return ctx.Infusing(c.Infusing);
            if (c.Procedure != null) return SinceOk(ctx.ProcedureT(c.Procedure), ctx.T, c.ForSec, c.WithinSec);
            if (c.Device != null) return ctx.DeviceOn(c.Device);
            if (c.Access != null) return c.Access == "any" ? ctx.Access.Iv || ctx.Access.Io : ctx.Access.Get(c.Access);
            if (c.Arrest.HasValue) return ctx.Arrest == c.Arrest.Value;
            if (c.Cpr.HasValue) return ctx.Cpr == c.Cpr.Value;
            if (c.Ectopy.HasValue) return ctx.Vitals.Ectopy == c.Ectopy.Value;
            if (c.Rhythm != null) return c.Rhythm.Contains(ctx.Vitals.Rhythm);
            return false;
        }
    }
}
