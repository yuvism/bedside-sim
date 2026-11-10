// Headless runners (mirrors src/engine/replay.ts). RunScript plays a timed
// list of actions; RunPolicy asks a function what to do each second.
using System;
using System.Collections.Generic;
using System.Linq;

namespace BedsideSim.Engine
{
    public class ScriptStep
    {
        /// <summary>Sim second at which to apply the action (before that second's tick).</summary>
        public double T;
        public EngineAction Action;

        public static ScriptStep Parse(object node)
        {
            var o = J.Obj(node, "script step");
            return new ScriptStep { T = J.Num(o, "t"), Action = EngineAction.Parse(J.Get(o, "action")) };
        }
    }

    public class RunOptions
    {
        public double MaxSec = 1800;
        /// <summary>Stop as soon as the case reaches an outcome (stabilised or died).</summary>
        public bool StopOnOutcome = true;
        /// <summary>Stop at the first cardiac arrest.</summary>
        public bool StopOnArrest;
        public double SampleEverySec = 15;
        /// <summary>Called after every tick, e.g. to collect values for analysis.</summary>
        public Action<SimpleEngine> OnTick;
    }

    public class RunResult
    {
        public string Outcome;
        public double? ArrestT;
        public double EndT;
        public List<SimEvent> Events;
        public List<TraceRow> Trace;
        public EngineState Final;
        public Recorder Recorder;
    }

    public static class Replay
    {
        /// <summary>Decides what to do at each sim second, given the engine and the log so far.</summary>
        public delegate IEnumerable<EngineAction> Policy(SimpleEngine engine, IReadOnlyList<SimEvent> events);

        public static RunResult RunPolicy(EngineLibrary lib, CaseDef caseDef, int seed, Policy policy, RunOptions opts)
        {
            var engine = new SimpleEngine(lib);
            engine.Load(caseDef, seed);
            var rec = new Recorder(opts.SampleEverySec);
            double? arrestT = null;
            rec.Sample(0, engine.Vitals());
            while (engine.Time < opts.MaxSec)
            {
                foreach (var action in policy(engine, rec.Events) ?? Enumerable.Empty<EngineAction>())
                    rec.Add(engine.Apply(action));
                var evs = engine.Step(1);
                rec.Add(evs);
                if (arrestT == null) arrestT = evs.Find(e => e.Code == "arrest")?.T;
                rec.Sample(engine.Time, engine.Vitals());
                opts.OnTick?.Invoke(engine);
                if (opts.StopOnOutcome && engine.State.Outcome != null) break;
                if (opts.StopOnArrest && arrestT != null) break;
            }
            rec.Sample(engine.Time, engine.Vitals(), true);
            return new RunResult
            {
                Outcome = engine.State.Outcome,
                ArrestT = arrestT,
                EndT = engine.Time,
                Events = rec.Events,
                Trace = rec.Trace,
                Final = engine.Snapshot(),
                Recorder = rec,
            };
        }

        public static RunResult RunScript(EngineLibrary lib, CaseDef caseDef, int seed, IEnumerable<ScriptStep> script, RunOptions opts)
        {
            var steps = script.OrderBy(s => s.T).ToList(); // stable, like Array.prototype.sort
            int i = 0;
            return RunPolicy(lib, caseDef, seed, (engine, _) =>
            {
                var output = new List<EngineAction>();
                while (i < steps.Count && steps[i].T <= engine.Time) output.Add(steps[i++].Action);
                return output;
            }, opts);
        }
    }
}
