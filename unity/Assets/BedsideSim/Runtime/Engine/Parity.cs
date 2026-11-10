// Parity check: replays the scenarios in a fixture exported from the
// TypeScript engine (npm run unity:sync) and compares every event and every
// sampled vital. Used by the Unity test and the .NET console runner.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace BedsideSim.Engine
{
    public class ParityReport
    {
        public bool Passed => Failures.Count == 0;
        public List<string> Failures = new List<string>();
        public List<string> Lines = new List<string>();
        public double MaxAbsDiff;
        public int ValuesCompared, EventsCompared;

        public override string ToString()
        {
            var sb = new StringBuilder();
            foreach (var l in Lines) sb.AppendLine(l);
            foreach (var f in Failures.Take(25)) sb.AppendLine("  FAIL " + f);
            if (Failures.Count > 25) sb.AppendLine($"  … and {Failures.Count - 25} more failures");
            sb.Append(Passed ? "PARITY OK" : "PARITY FAILED");
            return sb.ToString();
        }
    }

    public static class Parity
    {
        static readonly string[] Cols = { "hr", "sbp", "dbp", "map", "spo2", "rr", "etco2", "temp", "gcs" };

        public static ParityReport Check(EngineLibrary lib, CaseDef caseDef, string fixtureJson)
        {
            var report = new ParityReport();
            var fx = J.Obj(Json.Parse(fixtureJson), "fixture");
            if (J.Str(fx, "caseId") != caseDef.Id) throw new ArgumentException($"Fixture is for {J.Str(fx, "caseId")}, not {caseDef.Id}.");
            int seed = (int)J.Num(fx, "seed");
            double tol = J.Num(fx, "tolerance");

            foreach (var scNode in J.Arr(fx, "scenarios"))
            {
                var sc = J.Obj(scNode, "scenario");
                string name = J.Str(sc, "name");
                var script = J.List(sc, "script", ScriptStep.Parse);
                double every = J.Num(sc, "sampleEverySec");
                var rows = new List<(double t, Vitals v)>();
                void Sample(SimpleEngine e)
                {
                    if (e.Time % every == 0) rows.Add((e.Time, e.Vitals()));
                }
                var first = new SimpleEngine(lib);
                first.Load(caseDef, seed);
                Sample(first);
                var run = Replay.RunScript(lib, caseDef, seed, script, new RunOptions
                {
                    MaxSec = J.Num(sc, "maxSec"),
                    StopOnOutcome = J.BoolOr(sc, "stopOnOutcome", true),
                    OnTick = Sample,
                });

                string expOutcome = J.StrOr(sc, "outcome");
                if (run.Outcome != expOutcome) report.Failures.Add($"{name}: outcome {run.Outcome ?? "none"}, expected {expOutcome ?? "none"}");
                if (run.EndT != J.Num(sc, "endT")) report.Failures.Add($"{name}: ended at {run.EndT} s, expected {J.Num(sc, "endT")} s");

                var expEvents = J.Arr(sc, "events").Select(e => J.Obj(e, "event")).ToList();
                if (run.Events.Count != expEvents.Count)
                    report.Failures.Add($"{name}: {run.Events.Count} events, expected {expEvents.Count}");
                for (int i = 0; i < Math.Min(run.Events.Count, expEvents.Count); i++)
                {
                    var a = run.Events[i];
                    var x = expEvents[i];
                    report.EventsCompared++;
                    string want = $"{J.Num(x, "t")} {J.Str(x, "type")} {J.Str(x, "code")} | {J.Str(x, "text")}";
                    string got = $"{a.T} {a.Type} {a.Code} | {a.Text}";
                    if (want != got) report.Failures.Add($"{name}: event {i}\n      got  {got}\n      want {want}");
                }

                var expRows = J.Arr(sc, "trace").Select(r => (List<object>)r).ToList();
                if (rows.Count != expRows.Count) report.Failures.Add($"{name}: {rows.Count} trace rows, expected {expRows.Count}");
                double worst = 0;
                for (int i = 0; i < Math.Min(rows.Count, expRows.Count); i++)
                {
                    var (t, v) = rows[i];
                    var x = expRows[i];
                    if ((double)x[0] != t) { report.Failures.Add($"{name}: row {i} at t={t}, expected t={x[0]}"); continue; }
                    for (int c = 0; c < Cols.Length; c++)
                    {
                        double? want = x[c + 1] == null ? (double?)null : (double)x[c + 1];
                        double? got = v.Get(Cols[c]);
                        report.ValuesCompared++;
                        if (want.HasValue != got.HasValue)
                        {
                            report.Failures.Add($"{name}: t={t} {Cols[c]} = {Fmt(got)}, expected {Fmt(want)}");
                            continue;
                        }
                        if (!want.HasValue) continue;
                        double diff = Math.Abs(got.Value - want.Value);
                        worst = Math.Max(worst, diff);
                        if (diff > tol) report.Failures.Add($"{name}: t={t} {Cols[c]} = {Fmt(got)}, expected {Fmt(want)} (diff {diff:E2})");
                    }
                    string wantRhythm = (string)x[Cols.Length + 1];
                    if (v.Rhythm != wantRhythm) report.Failures.Add($"{name}: t={t} rhythm {v.Rhythm}, expected {wantRhythm}");
                }
                report.MaxAbsDiff = Math.Max(report.MaxAbsDiff, worst);
                report.Lines.Add($"{caseDef.Id} / {name}: outcome {run.Outcome ?? "none"} at {run.EndT} s, {run.Events.Count} events, {rows.Count} rows, max |diff| {worst:E2}");
            }
            report.Lines.Add($"Compared {report.EventsCompared} events and {report.ValuesCompared} values (tolerance {tol.ToString(CultureInfo.InvariantCulture)}).");
            return report;
        }

        static string Fmt(double? v) => v.HasValue ? v.Value.ToString("R", CultureInfo.InvariantCulture) : "null";
    }
}
