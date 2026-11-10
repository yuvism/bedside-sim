// Loads the shared library and cases from a folder laid out like
// StreamingAssets/BedsideSim (formulary.json, devices.json,
// investigations.json, cases/*.json). Uses System.IO, which works in the
// Editor and desktop players; on Android/WebGL read StreamingAssets with
// UnityWebRequest and pass the text to EngineLibrary.Parse / CaseDef.Parse.
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace BedsideSim.Engine
{
    public static class ContentLoader
    {
        public static EngineLibrary LoadLibrary(string folder) => EngineLibrary.Parse(
            File.ReadAllText(Path.Combine(folder, "formulary.json")),
            File.ReadAllText(Path.Combine(folder, "devices.json")),
            File.ReadAllText(Path.Combine(folder, "investigations.json")));

        public static CaseDef LoadCase(string folder, string caseId) =>
            CaseDef.Parse(File.ReadAllText(Path.Combine(folder, "cases", caseId + ".json")));

        public static List<string> CaseIds(string folder) =>
            Directory.GetFiles(Path.Combine(folder, "cases"), "*.json")
                .Select(Path.GetFileNameWithoutExtension)
                .OrderBy(x => x, System.StringComparer.Ordinal)
                .ToList();
    }
}
