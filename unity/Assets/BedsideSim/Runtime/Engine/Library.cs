// Shared library data (mirrors the library part of src/engine/types.ts):
// formulary.json, devices.json and investigations.json.
using System.Collections.Generic;

namespace BedsideSim.Engine
{
    public class DrugEffect
    {
        public string Target;
        public double Emax;
        public double Ec50;

        public static DrugEffect Parse(object n)
        {
            var o = J.Obj(n, "drug effect");
            return new DrugEffect { Target = J.Str(o, "target"), Emax = J.Num(o, "emax"), Ec50 = J.Num(o, "ec50") };
        }
    }

    public class FixedEffect
    {
        public string Target;
        public double Value;

        public static FixedEffect Parse(object n)
        {
            var o = J.Obj(n, "effect");
            return new FixedEffect { Target = J.Str(o, "target"), Value = J.Num(o, "value") };
        }
    }

    public class TransientDef
    {
        public double TauMin;
        public double Amplitude;
        public List<FixedEffect> Effects = new List<FixedEffect>();
        public bool Ectopy;

        public static TransientDef Parse(object n)
        {
            var o = J.Obj(n, "transient");
            return new TransientDef
            {
                TauMin = J.Num(o, "tauMin"),
                Amplitude = J.Num(o, "amplitude"),
                Effects = J.List(o, "effects", FixedEffect.Parse),
                Ectopy = J.BoolOr(o, "ectopy"),
            };
        }
    }

    public class AdverseRule
    {
        public string Id;
        public List<string> Routes;
        public bool WhenNotArrest;
        public double? RepeatWithinSec;
        public double? DoseAbove;
        public string Level;
        public string Message;
        public string Say;
        public TransientDef Transient;
        public bool Harm;

        public static AdverseRule Parse(object n)
        {
            var o = J.Obj(n, "adverse rule");
            return new AdverseRule
            {
                Id = J.Str(o, "id"),
                Routes = J.StringsOpt(o, "routes"),
                WhenNotArrest = J.BoolOr(o, "whenNotArrest"),
                RepeatWithinSec = J.NumOpt(o, "repeatWithinSec"),
                DoseAbove = J.NumOpt(o, "doseAbove"),
                Level = J.Str(o, "level"),
                Message = J.Str(o, "message"),
                Say = J.StrOr(o, "say"),
                Transient = J.Has(o, "transient") ? TransientDef.Parse(o["transient"]) : null,
                Harm = J.BoolOr(o, "harm"),
            };
        }
    }

    public class DrugRoute
    {
        public string Route;
        public string Label;
        public double StandardDose;
        public double? MinDose;
        public double? MaxDose;
        public double Bioavailability;
        public double AbsorptionHalfLifeMin;

        public static DrugRoute Parse(object n)
        {
            var o = J.Obj(n, "route");
            return new DrugRoute
            {
                Route = J.Str(o, "route"),
                Label = J.Str(o, "label"),
                StandardDose = J.Num(o, "standardDose"),
                MinDose = J.NumOpt(o, "minDose"),
                MaxDose = J.NumOpt(o, "maxDose"),
                Bioavailability = J.Num(o, "bioavailability"),
                AbsorptionHalfLifeMin = J.Num(o, "absorptionHalfLifeMin"),
            };
        }
    }

    public class InfusionDef
    {
        public string Unit;
        public double StandardRate, MinRate, MaxRate, AmountPerMinPerRate;
        public bool PerKg;

        public static InfusionDef Parse(object n)
        {
            var o = J.Obj(n, "infusion");
            return new InfusionDef
            {
                Unit = J.Str(o, "unit"),
                StandardRate = J.Num(o, "standardRate"),
                MinRate = J.Num(o, "minRate"),
                MaxRate = J.Num(o, "maxRate"),
                PerKg = J.BoolOr(o, "perKg"),
                AmountPerMinPerRate = J.Num(o, "amountPerMinPerRate"),
            };
        }
    }

    public class Contraindication
    {
        public string Id;
        public Condition When;
        public string Message;
        public bool Harm;

        public static Contraindication Parse(object n)
        {
            var o = J.Obj(n, "contraindication");
            return new Contraindication
            {
                Id = J.Str(o, "id"),
                When = Condition.Parse(J.Get(o, "when")),
                Message = J.Str(o, "message"),
                Harm = J.BoolOr(o, "harm"),
            };
        }
    }

    public class DrugDef
    {
        public string Id, Name, DrugClass, Unit, Feedback;
        public double HalfLifeMin;
        public List<DrugRoute> Routes = new List<DrugRoute>();
        public InfusionDef Infusion;
        public List<DrugEffect> Effects = new List<DrugEffect>();
        public List<AdverseRule> Adverse = new List<AdverseRule>();
        public List<string> AllergyClasses = new List<string>();
        public List<Contraindication> Contraindications = new List<Contraindication>();

        public static DrugDef Parse(object n)
        {
            var o = J.Obj(n, "drug");
            return new DrugDef
            {
                Id = J.Str(o, "id"),
                Name = J.Str(o, "name"),
                DrugClass = J.StrOr(o, "drugClass", ""),
                Unit = J.Str(o, "unit"),
                HalfLifeMin = J.Num(o, "halfLifeMin"),
                Routes = J.List(o, "routes", DrugRoute.Parse),
                Infusion = J.Has(o, "infusion") ? InfusionDef.Parse(o["infusion"]) : null,
                Effects = J.List(o, "effects", DrugEffect.Parse),
                Adverse = J.List(o, "adverse", AdverseRule.Parse),
                AllergyClasses = J.Strings(o, "allergyClasses"),
                Contraindications = J.List(o, "contraindications", Contraindication.Parse),
                Feedback = J.StrOr(o, "feedback"),
            };
        }
    }

    public class FluidEffect
    {
        public string Target;
        public double PerLitre;
        public double? MaxLitres;

        public static FluidEffect Parse(object n)
        {
            var o = J.Obj(n, "fluid effect");
            return new FluidEffect { Target = J.Str(o, "target"), PerLitre = J.Num(o, "perLitre"), MaxLitres = J.NumOpt(o, "maxLitres") };
        }
    }

    public class FluidDef
    {
        public string Id, Name;
        public double StandardVolumeMl, MaxRateMlPerMin, RedistributionTauMin;
        public List<FluidEffect> Effects = new List<FluidEffect>();

        public static FluidDef Parse(object n)
        {
            var o = J.Obj(n, "fluid");
            return new FluidDef
            {
                Id = J.Str(o, "id"),
                Name = J.Str(o, "name"),
                StandardVolumeMl = J.Num(o, "standardVolumeMl"),
                MaxRateMlPerMin = J.Num(o, "maxRateMlPerMin"),
                RedistributionTauMin = J.Num(o, "redistributionTauMin"),
                Effects = J.List(o, "effects", FluidEffect.Parse),
            };
        }
    }

    public class DeviceDef
    {
        public string Id, Label, Sub, Category, Short, OnText, OffText;
        public double? Fio2;
        /// <summary>Assisted ventilation: lost ventilation replaced, and a minimum RR (both 0 when none).</summary>
        public bool HasVentilation;
        public double VentSupport, VentMinRr;
        public List<FixedEffect> Effects = new List<FixedEffect>();

        public static DeviceDef Parse(object n)
        {
            var o = J.Obj(n, "device");
            var d = new DeviceDef
            {
                Id = J.Str(o, "id"),
                Label = J.Str(o, "label"),
                Sub = J.StrOr(o, "sub"),
                Category = J.Str(o, "category"),
                Short = J.StrOr(o, "short"),
                Fio2 = J.NumOpt(o, "fio2"),
                Effects = J.List(o, "effects", FixedEffect.Parse),
                OnText = J.Str(o, "onText"),
                OffText = J.Str(o, "offText"),
            };
            if (J.Has(o, "ventilation"))
            {
                var v = J.Obj(o["ventilation"], "ventilation");
                d.HasVentilation = true;
                d.VentSupport = J.Num(v, "support");
                d.VentMinRr = J.Num(v, "minRr");
            }
            return d;
        }
    }

    public class ProcedureDef
    {
        public string Id, Label, Sub, Category, Grants, DoneText, AlreadyText;

        public static ProcedureDef Parse(object n)
        {
            var o = J.Obj(n, "procedure");
            return new ProcedureDef
            {
                Id = J.Str(o, "id"),
                Label = J.Str(o, "label"),
                Sub = J.StrOr(o, "sub"),
                Category = J.Str(o, "category"),
                Grants = J.StrOr(o, "grants"),
                DoneText = J.Str(o, "doneText"),
                AlreadyText = J.StrOr(o, "alreadyText"),
            };
        }
    }

    public class InvestigationDef
    {
        public string Id, Label, Sub, Category;
        public double TurnaroundMin;

        public static InvestigationDef Parse(object n)
        {
            var o = J.Obj(n, "investigation");
            return new InvestigationDef
            {
                Id = J.Str(o, "id"),
                Label = J.Str(o, "label"),
                Sub = J.StrOr(o, "sub"),
                Category = J.Str(o, "category"),
                TurnaroundMin = J.Num(o, "turnaroundMin"),
            };
        }
    }

    public class EngineLibrary
    {
        public List<DrugDef> Drugs = new List<DrugDef>();
        public List<FluidDef> Fluids = new List<FluidDef>();
        public List<DeviceDef> Devices = new List<DeviceDef>();
        public List<ProcedureDef> Procedures = new List<ProcedureDef>();
        public List<InvestigationDef> Investigations = new List<InvestigationDef>();

        /// <summary>Builds the library from the text of formulary.json, devices.json and investigations.json.</summary>
        public static EngineLibrary Parse(string formularyJson, string devicesJson, string investigationsJson)
        {
            var f = J.Obj(Json.Parse(formularyJson), "formulary");
            var d = J.Obj(Json.Parse(devicesJson), "devices");
            var i = J.Obj(Json.Parse(investigationsJson), "investigations");
            return new EngineLibrary
            {
                Drugs = J.List(f, "drugs", DrugDef.Parse),
                Fluids = J.List(f, "fluids", FluidDef.Parse),
                Devices = J.List(d, "devices", DeviceDef.Parse),
                Procedures = J.List(d, "procedures", ProcedureDef.Parse),
                Investigations = J.List(i, "investigations", InvestigationDef.Parse),
            };
        }
    }
}
