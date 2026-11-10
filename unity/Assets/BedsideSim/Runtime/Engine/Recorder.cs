// Records the event log and a vitals trace and exports them as CSV
// (mirrors src/engine/recorder.ts). Column names match the video-validation
// reference format (t_sec, hr, sbp, dbp, spo2, rr, etco2, event) plus extras.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace BedsideSim.Engine
{
    public class TraceRow
    {
        public double T;
        public double? Hr, Sbp, Dbp, Map, Spo2;
        public double Rr, Etco2, Temp, Gcs;
        public string Rhythm;

        static double? R1(double? v) => v.HasValue ? JsMath.Round(v.Value * 10) / 10 : (double?)null;

        /// <summary>One row, rounded to 1 decimal place like the TypeScript recorder.</summary>
        public static TraceRow From(double t, Vitals v) => new TraceRow
        {
            T = t,
            Hr = R1(v.Hr), Sbp = R1(v.Sbp), Dbp = R1(v.Dbp), Map = R1(v.Map), Spo2 = R1(v.Spo2),
            Rr = R1(v.Rr) ?? 0, Etco2 = R1(v.Etco2) ?? 0, Temp = R1(v.Temp) ?? 0,
            Gcs = v.Gcs, Rhythm = v.Rhythm,
        };
    }

    public class Recorder
    {
        public readonly List<SimEvent> Events = new List<SimEvent>();
        public readonly List<TraceRow> Trace = new List<TraceRow>();
        public readonly double SampleEverySec;
        double nextSample;

        public Recorder(double sampleEverySec = 15) { SampleEverySec = sampleEverySec; }

        public void Add(IEnumerable<SimEvent> events) => Events.AddRange(events);

        /// <summary>Records a row when t reaches the next sample time (or always, when forced).</summary>
        public void Sample(double t, Vitals v, bool force = false)
        {
            if (!force && t < nextSample) return;
            var row = TraceRow.From(t, v);
            if (Trace.Count > 0 && Trace[Trace.Count - 1].T == t) Trace[Trace.Count - 1] = row;
            else Trace.Add(row);
            nextSample = (Math.Floor(t / SampleEverySec) + 1) * SampleEverySec;
        }

        static string Cell(object v)
        {
            if (v == null) return "";
            string s = v is double d ? JsMath.NumberToString(d) : Convert.ToString(v, CultureInfo.InvariantCulture);
            return s.IndexOfAny(new[] { '"', ',', '\n', '\r' }) >= 0 ? "\"" + s.Replace("\"", "\"\"") + "\"" : s;
        }

        /// <summary>One row per vitals sample; `event` lists codes since the previous sample.</summary>
        public string TraceCsv()
        {
            var sb = new StringBuilder("t_sec,hr,sbp,dbp,map,spo2,rr,etco2,temp,gcs,rhythm,event\n");
            int ei = 0;
            for (int i = 0; i < Trace.Count; i++)
            {
                var row = Trace[i];
                bool isLast = i == Trace.Count - 1;
                var codes = new List<string>();
                while (ei < Events.Count && (isLast || Events[ei].T <= row.T)) codes.Add(Events[ei++].Code);
                var cells = new object[]
                {
                    row.T, row.Hr, row.Sbp, row.Dbp, row.Map, row.Spo2, row.Rr, row.Etco2, row.Temp, row.Gcs, row.Rhythm,
                    string.Join("|", codes),
                };
                sb.Append(string.Join(",", cells.Select(Cell))).Append('\n');
            }
            return sb.ToString();
        }

        public string EventsCsv()
        {
            var sb = new StringBuilder("t_sec,type,code,text\n");
            foreach (var e in Events) sb.Append(string.Join(",", new object[] { e.T, e.Type, e.Code, e.Text }.Select(Cell))).Append('\n');
            return sb.ToString();
        }
    }
}
