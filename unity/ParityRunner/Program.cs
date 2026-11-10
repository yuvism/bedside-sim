// Parity runner: checks the C# engine against fixtures exported from the
// TypeScript engine, and smoke-runs every case. Exit code 1 on any failure.
//   dotnet run --project unity/ParityRunner [path/to/StreamingAssets/BedsideSim]
using System;
using System.IO;
using System.Linq;
using BedsideSim.Engine;

static class Program
{
    static string FindData(string[] args)
    {
        if (args.Length > 0) return args[0];
        var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        for (; dir != null; dir = dir.Parent)
        {
            foreach (var rel in new[] { "unity/Assets/StreamingAssets/BedsideSim", "Assets/StreamingAssets/BedsideSim", "../Assets/StreamingAssets/BedsideSim" })
            {
                string p = Path.GetFullPath(Path.Combine(dir.FullName, rel));
                if (File.Exists(Path.Combine(p, "formulary.json"))) return p;
            }
        }
        throw new DirectoryNotFoundException("Couldn't find StreamingAssets/BedsideSim; pass its path.");
    }

    static int Main(string[] args)
    {
        string data = FindData(args);
        Console.WriteLine($"Content: {data}");
        var lib = ContentLoader.LoadLibrary(data);
        bool ok = true;

        // Every case parses and runs for 5 minutes untreated.
        foreach (var id in ContentLoader.CaseIds(data))
        {
            var c = ContentLoader.LoadCase(data, id);
            var r = Replay.RunScript(lib, c, 1, Enumerable.Empty<ScriptStep>(), new RunOptions { MaxSec = 300 });
            var v = r.Trace.Last();
            Console.WriteLine($"  {id,-16} 5 min untreated: HR {v.Hr?.ToString() ?? "--"}, SBP {v.Sbp?.ToString() ?? "--"}, {v.Rhythm}, {r.Events.Count} events");
        }

        foreach (var file in Directory.GetFiles(Path.Combine(data, "parity"), "*.json").OrderBy(f => f))
        {
            string caseId = Path.GetFileNameWithoutExtension(file);
            var report = Parity.Check(lib, ContentLoader.LoadCase(data, caseId), File.ReadAllText(file));
            Console.WriteLine(report);
            ok &= report.Passed;
        }
        return ok ? 0 : 1;
    }
}
