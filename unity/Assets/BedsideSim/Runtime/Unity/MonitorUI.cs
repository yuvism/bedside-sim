// uGUI numerics for the bedside monitor: HR, SpO2, NIBP, RR, EtCO2, temp,
// rhythm and clock, in the standard trace colours, with a simple alarm
// flash. Assign Text fields in the Inspector (any can be left empty).
using BedsideSim.Engine;
using UnityEngine;
using UnityEngine.UI;

namespace BedsideSim.Unity
{
    public class MonitorUI : MonoBehaviour
    {
        public SimulationRunner runner;

        [Header("Numerics (uGUI Text)")]
        public Text heartRate;
        public Text spo2;
        public Text nibp;
        public Text respiratoryRate;
        public Text etco2;
        public Text temperature;
        public Text rhythm;
        public Text clock;

        [Tooltip("Sim seconds between automatic cuff readings")]
        public float nibpCycleSec = 180f;

        [Tooltip("Real seconds between refreshes")]
        public float refreshSec = 0.25f;

        // Standard monitor colours (as the web app): ECG green, SpO2 cyan, BP red, RR/EtCO2 yellow.
        static readonly Color HrColour = new Color32(0x3c, 0xe0, 0x7a, 0xff);
        static readonly Color Spo2Colour = new Color32(0x3f, 0xd0, 0xf0, 0xff);
        static readonly Color BpColour = new Color32(0xff, 0x6b, 0x63, 0xff);
        static readonly Color RrColour = new Color32(0xf2, 0xd0, 0x4a, 0xff);
        static readonly Color PlainColour = new Color32(0xd9, 0xe2, 0xe0, 0xff);
        static readonly Color AlarmColour = new Color32(0xff, 0x3b, 0x30, 0xff);

        double nextCuff;
        string cuffText = "--/--";
        bool cuffLow;
        float timer;

        void Start()
        {
            Tint(heartRate, HrColour);
            Tint(spo2, Spo2Colour);
            Tint(nibp, BpColour);
            Tint(respiratoryRate, RrColour);
            Tint(etco2, RrColour);
            Tint(temperature, PlainColour);
            Tint(rhythm, HrColour);
            Tint(clock, PlainColour);
        }

        static void Tint(Text t, Color c)
        {
            if (t != null) t.color = c;
        }

        static string Num(double? v) => v.HasValue ? JsMath.RoundToString(v.Value) : "--";

        /// <summary>Cuff reading now, as the "Take NIBP now" button in the web app.</summary>
        public void MeasureNibp()
        {
            var e = runner != null ? runner.Engine : null;
            if (e == null) return;
            var v = e.Vitals();
            nextCuff = e.Time + nibpCycleSec;
            if (!v.Sbp.HasValue || !v.Dbp.HasValue || !v.Map.HasValue)
            {
                cuffText = "--/--";
                cuffLow = true;
                return;
            }
            cuffText = $"{Num(v.Sbp)}/{Num(v.Dbp)} ({Num(v.Map)})";
            cuffLow = v.Sbp.Value < 90;
        }

        void Update()
        {
            var e = runner != null ? runner.Engine : null;
            if (e == null) return;
            timer += Time.unscaledDeltaTime;
            if (timer < refreshSec) return;
            timer = 0;

            if (e.Time >= nextCuff) MeasureNibp();
            var v = e.Vitals();
            bool flash = Mathf.Repeat(Time.unscaledTime, 1f) < 0.5f;

            Set(heartRate, Num(v.Hr), HrColour, flash && (!v.Hr.HasValue || v.Hr > 130 || v.Hr < 40));
            Set(spo2, Num(v.Spo2), Spo2Colour, flash && (!v.Spo2.HasValue || v.Spo2 < 90));
            Set(nibp, cuffText, BpColour, flash && cuffLow);
            Set(respiratoryRate, JsMath.RoundToString(v.Rr), RrColour, flash && (v.Rr > 30 || v.Rr < 8));
            Set(etco2, JsMath.RoundToString(v.Etco2), RrColour, false);
            Set(temperature, JsMath.ToFixed(v.Temp, 1), PlainColour, false);
            Set(rhythm, RhythmRules.Labels.TryGetValue(v.Rhythm, out var label) ? label : v.Rhythm, HrColour,
                flash && !RhythmRules.IsPerfusing(v.Rhythm));
            if (clock != null)
            {
                int t = (int)e.Time;
                clock.text = $"{t / 60:00}:{t % 60:00}";
            }
        }

        static void Set(Text t, string value, Color normal, bool alarm)
        {
            if (t == null) return;
            t.text = value;
            t.color = alarm ? AlarmColour : normal;
        }
    }
}
