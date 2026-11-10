// Runs a Bedside sim case in a scene: loads the library and case from
// StreamingAssets/BedsideSim, advances the engine with Time.deltaTime, and
// raises an event for everything that happens. Put it on any GameObject.
using System;
using System.Collections.Generic;
using System.IO;
using BedsideSim.Engine;
using UnityEngine;

namespace BedsideSim.Unity
{
    public class SimulationRunner : MonoBehaviour
    {
        [Tooltip("Case file name in StreamingAssets/BedsideSim/cases, without .json")]
        public string caseId = "anaphylaxis-01";

        [Tooltip("Same seed + same actions at the same times = the same run as the web app")]
        public int seed = 1;

        [Tooltip("Sim seconds per real second")]
        [Range(0f, 8f)]
        public float speed = 1f;

        public bool playOnStart = true;
        public bool logEvents = true;

        public SimpleEngine Engine { get; private set; }
        public bool Playing { get; set; }
        public readonly List<SimEvent> Log = new List<SimEvent>();
        public event Action<SimEvent> EventRaised;

        public static string DataFolder => Path.Combine(Application.streamingAssetsPath, "BedsideSim");

        void Start()
        {
            Load(caseId, seed);
            Playing = playOnStart;
        }

        /// <summary>(Re)loads a case. Uses System.IO; see unity/README.md for Android and WebGL.</summary>
        public void Load(string id, int newSeed)
        {
            var lib = ContentLoader.LoadLibrary(DataFolder);
            var c = ContentLoader.LoadCase(DataFolder, id);
            Engine = new SimpleEngine(lib);
            Engine.Load(c, newSeed);
            caseId = id;
            seed = newSeed;
            Log.Clear();
            if (logEvents) Debug.Log($"Bedside sim: loaded {c.Title} ({c.Id}), seed {newSeed}. {c.OpeningLine}");
        }

        void Update()
        {
            if (Engine == null || !Playing || Engine.State.Outcome != null) return;
            Raise(Engine.Step(Time.deltaTime * speed));
        }

        /// <summary>Give an order, drug, procedure… e.g. Apply(EngineAction.Drug("adrenaline", "IM", 0.5)).</summary>
        public void Apply(EngineAction action)
        {
            if (Engine != null) Raise(Engine.Apply(action));
        }

        void Raise(List<SimEvent> events)
        {
            foreach (var e in events)
            {
                Log.Add(e);
                if (logEvents) Debug.Log($"[{e.T:0}s] {e.Type}: {e.Text}");
                EventRaised?.Invoke(e);
            }
        }
    }
}
