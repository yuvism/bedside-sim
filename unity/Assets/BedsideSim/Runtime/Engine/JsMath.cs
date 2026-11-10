// Small helpers that reproduce JavaScript number behaviour exactly where the
// TypeScript engine relies on it, so both engines produce the same run.
using System;
using System.Globalization;

namespace BedsideSim.Engine
{
    public static class JsMath
    {
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        /// <summary>JavaScript Math.round: halves round towards +infinity (C# Math.Round rounds to even).</summary>
        public static double Round(double x) => Math.Floor(x + 0.5);

        public static double Clamp(double v, double lo, double hi) => Math.Max(lo, Math.Min(hi, v));

        /// <summary>Number.prototype.toFixed for the small values used in case text.</summary>
        public static string ToFixed(double v, int digits) => v.ToString("F" + digits, Inv);

        /// <summary>String(Math.round(v)), never "-0".</summary>
        public static string RoundToString(double v) => ((long)Round(v)).ToString(Inv);

        /// <summary>String(n): shortest round-trip form, integers without a decimal point.</summary>
        public static string NumberToString(double n)
        {
            if (n == Math.Floor(n) && Math.Abs(n) < 1e15) return ((long)n).ToString(Inv);
            return n.ToString("R", Inv);
        }

        /// <summary>String(Number(n.toPrecision(6))), as fmtDose in actions.ts.</summary>
        public static string FmtDose(double n) =>
            NumberToString(double.Parse(n.ToString("G6", Inv), Inv));
    }
}
