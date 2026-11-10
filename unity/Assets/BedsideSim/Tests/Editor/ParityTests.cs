// Edit Mode tests (Window > General > Test Runner). The parity test replays
// the fixtures exported from the TypeScript engine (npm run unity:sync) and
// requires every event and sampled vital to match.
using System.IO;
using System.Linq;
using BedsideSim.Engine;
using NUnit.Framework;
using UnityEngine;

namespace BedsideSim.Tests
{
    public class ParityTests
    {
        static string Data => Path.Combine(Application.streamingAssetsPath, "BedsideSim");

        [Test]
        public void MatchesTheTypeScriptEngine()
        {
            var lib = ContentLoader.LoadLibrary(Data);
            var fixtures = Directory.GetFiles(Path.Combine(Data, "parity"), "*.json");
            Assert.IsNotEmpty(fixtures, "No parity fixtures found. Run npm run unity:sync in the web project.");
            foreach (var file in fixtures)
            {
                var c = ContentLoader.LoadCase(Data, Path.GetFileNameWithoutExtension(file));
                var report = Parity.Check(lib, c, File.ReadAllText(file));
                Debug.Log(report.ToString());
                Assert.IsTrue(report.Passed, report.ToString());
            }
        }

        [Test]
        public void EveryCaseLoadsAndRuns()
        {
            var lib = ContentLoader.LoadLibrary(Data);
            foreach (var id in ContentLoader.CaseIds(Data))
            {
                var c = ContentLoader.LoadCase(Data, id);
                var r = Replay.RunScript(lib, c, 1, Enumerable.Empty<ScriptStep>(), new RunOptions { MaxSec = 120 });
                Assert.AreEqual(120.0, r.EndT, 1e-9, id);
            }
        }

        [Test]
        public void SameSeedGivesTheSameRun()
        {
            var lib = ContentLoader.LoadLibrary(Data);
            var c = ContentLoader.LoadCase(Data, "anaphylaxis-01");
            var a = Replay.RunScript(lib, c, 7, Enumerable.Empty<ScriptStep>(), new RunOptions { MaxSec = 300, SampleEverySec = 1 });
            var b = Replay.RunScript(lib, c, 7, Enumerable.Empty<ScriptStep>(), new RunOptions { MaxSec = 300, SampleEverySec = 1 });
            Assert.AreEqual(a.Recorder.TraceCsv(), b.Recorder.TraceCsv());
        }
    }
}
