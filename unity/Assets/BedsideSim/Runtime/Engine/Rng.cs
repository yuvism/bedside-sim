// Seeded random numbers (mirrors src/engine/rng.ts): mulberry32 with one
// 32-bit integer of state, reproducing JavaScript's Math.imul, >>> and |0
// exactly so both engines draw the same sequence.
using System;

namespace BedsideSim.Engine
{
    public class Rng
    {
        public int State;

        public Rng(int state) { State = state; }

        static int Ushr(int x, int n) => (int)((uint)x >> n);

        /// <summary>Spread a user-facing seed into a well-mixed starting state.</summary>
        public static int SeedToState(int seed)
        {
            unchecked
            {
                int z = seed + (int)0x9e3779b9;
                z = (z ^ Ushr(z, 16)) * (int)0x85ebca6b;
                z = (z ^ Ushr(z, 13)) * (int)0xc2b2ae35;
                return z ^ Ushr(z, 16);
            }
        }

        /// <summary>Uniform in [0, 1).</summary>
        public double Next()
        {
            unchecked
            {
                State = State + 0x6d2b79f5;
                int t = State;
                t = (t ^ Ushr(t, 15)) * (t | 1);
                t ^= t + (t ^ Ushr(t, 7)) * (t | 61);
                return (uint)(t ^ Ushr(t, 14)) / 4294967296.0;
            }
        }

        public double Uniform(double min, double max) => min + (max - min) * Next();

        /// <summary>value ± spread, uniformly.</summary>
        public double Jitter(double value, double spread) => spread > 0 ? value + Uniform(-spread, spread) : value;

        /// <summary>Standard normal (Box–Muller; two draws, no cached spare).</summary>
        public double Normal()
        {
            double u1 = Math.Max(Next(), 1e-12);
            double u2 = Next();
            return Math.Sqrt(-2 * Math.Log(u1)) * Math.Cos(2 * Math.PI * u2);
        }

        public bool Chance(double p) => Next() < p;

        /// <summary>One exact Ornstein–Uhlenbeck step: smooth noise with SD sigma and correlation time tauSec.</summary>
        public static double OuStep(double x, double tauSec, double sigma, double dtSec, double z)
        {
            double a = Math.Exp(-dtSec / tauSec);
            return x * a + sigma * Math.Sqrt(1 - a * a) * z;
        }
    }
}
