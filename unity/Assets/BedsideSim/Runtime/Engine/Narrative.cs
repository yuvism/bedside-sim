// Resolves case text against the current state (mirrors
// src/engine/narrative.ts): severity bands, conditional findings and
// {placeholder} templates. Also the "I don't know" answer from dialogue.ts.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace BedsideSim.Engine
{
    public static class Narrative
    {
        static readonly Regex Placeholder = new Regex(@"\{([a-zA-Z0-9_]+)(?::(\d))?\}");

        /// <summary>Band index = number of cut-offs at or below the severity.</summary>
        public static int BandFor(List<double> cutoffs, double severity) => cutoffs.Count(c => severity >= c);

        public static string PickVariant(List<TextVariant> variants, IConditionContext ctx)
        {
            foreach (var v in variants) if (v.When == null || Conditions.Eval(v.When, ctx)) return v.Text;
            return "";
        }

        /// <summary>Labs, then vitals, then o2: later keys win, as in the TypeScript spread.</summary>
        public static Dictionary<string, object> TemplateValues(Vitals v, Dictionary<string, double> labs, string o2Label)
        {
            var d = new Dictionary<string, object>();
            foreach (var kv in labs) d[kv.Key] = kv.Value;
            d["hr"] = v.Hr; d["sbp"] = v.Sbp; d["dbp"] = v.Dbp; d["map"] = v.Map; d["spo2"] = v.Spo2;
            d["rr"] = v.Rr; d["etco2"] = v.Etco2; d["temp"] = v.Temp; d["gcs"] = v.Gcs; d["glucose"] = v.Glucose;
            d["rhythm"] = v.Rhythm;
            d["o2"] = o2Label;
            return d;
        }

        /// <summary>{key} becomes a rounded number, {key:2} two decimals; unknown keys stay as written.</summary>
        public static string FillTemplate(string text, Dictionary<string, object> values) =>
            Placeholder.Replace(text, m =>
            {
                string key = m.Groups[1].Value;
                if (!values.TryGetValue(key, out object v)) return m.Value;
                if (v == null) return "--";
                if (v is string s) return s;
                double n = v is double dd ? dd : Convert.ToDouble(v);
                return m.Groups[2].Success ? JsMath.ToFixed(n, int.Parse(m.Groups[2].Value)) : JsMath.RoundToString(n);
            });

        /// <summary>Text in (round brackets) is body language rather than speech.</summary>
        public static bool IsNonVerbal(string text) => text.StartsWith("(", StringComparison.Ordinal);

        /// <summary>What the patient says to an unscripted question, in the way they talk in this band.</summary>
        public static string UnknownAnswer(List<DialogueEntry> dialogue, int band)
        {
            var answers = dialogue.Select(d => d.A.Count == 0 ? "" : d.A[Math.Min(band, d.A.Count - 1)]).ToList();
            int silent = answers.Count(IsNonVerbal);
            if (answers.Count > 0 && silent * 2 > answers.Count) return "(No meaningful answer.)";
            if (band <= 0) return "Sorry, I don't know.";
            if (band == 1) return "I… don't know.";
            return "Don’t… know…";
        }
    }
}
