// The portable engine contract (mirrors PhysiologyEngine in
// src/engine/engine.ts). SimpleEngine implements it; a Pulse-backed engine
// can implement the same interface (see unity/README.md).
using System.Collections.Generic;

namespace BedsideSim.Engine
{
    public interface IPhysiologyEngine
    {
        void Load(CaseDef caseDef, int seed);
        /// <summary>Advance by dtSec using fixed 1 s internal ticks; returns what happened.</summary>
        List<SimEvent> Step(double dtSec);
        /// <summary>Order, drug, procedure, device, talk, exam…</summary>
        List<SimEvent> Apply(EngineAction action);
        /// <summary>hr, sbp, dbp, map, spo2, rr, etco2, temp, gcs, glucose, rhythm.</summary>
        Vitals Vitals();
        /// <summary>Current lab truth (for result generation).</summary>
        Dictionary<string, double> Labs();
        /// <summary>Serialisable, for save/replay.</summary>
        EngineState Snapshot();
        void Restore(EngineState state);
    }

    /// <summary>Extra read-outs the bedside UI needs; not part of the portable contract.</summary>
    public interface IBedsideEngine : IPhysiologyEngine
    {
        double Time { get; }
        CaseDef Case { get; }
        bool Check(Condition c);
        Dictionary<string, double> Signs();
        Dictionary<string, double> Severities();
    }
}
