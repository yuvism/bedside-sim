// Minimal JSON reader with no dependencies (works in Unity and plain .NET).
// Objects become Dictionary<string, object>, arrays List<object>, numbers
// double, plus string, bool and null. Key order is preserved.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace BedsideSim.Engine
{
    public static class Json
    {
        public static object Parse(string text)
        {
            var p = new Parser(text);
            p.SkipWs();
            var v = p.Value();
            p.SkipWs();
            if (!p.AtEnd) throw p.Error("Unexpected text after the JSON value");
            return v;
        }

        sealed class Parser
        {
            readonly string s;
            int i;

            public Parser(string text)
            {
                s = text ?? "";
                if (s.Length > 0 && s[0] == '﻿') i = 1;
            }

            public bool AtEnd => i >= s.Length;

            public FormatException Error(string msg) => new FormatException($"{msg} at character {i}.");

            public void SkipWs()
            {
                while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++;
            }

            public object Value()
            {
                if (AtEnd) throw Error("Unexpected end of JSON");
                char c = s[i];
                switch (c)
                {
                    case '{': return Obj();
                    case '[': return Arr();
                    case '"': return Str();
                    case 't': Expect("true"); return true;
                    case 'f': Expect("false"); return false;
                    case 'n': Expect("null"); return null;
                    default:
                        if (c == '-' || (c >= '0' && c <= '9')) return Num();
                        throw Error($"Unexpected character '{c}'");
                }
            }

            void Expect(string word)
            {
                if (string.CompareOrdinal(s, i, word, 0, word.Length) != 0) throw Error($"Expected {word}");
                i += word.Length;
            }

            Dictionary<string, object> Obj()
            {
                var d = new Dictionary<string, object>();
                i++;
                SkipWs();
                if (!AtEnd && s[i] == '}') { i++; return d; }
                while (true)
                {
                    SkipWs();
                    if (AtEnd || s[i] != '"') throw Error("Expected a property name");
                    string key = Str();
                    SkipWs();
                    if (AtEnd || s[i] != ':') throw Error("Expected ':'");
                    i++;
                    SkipWs();
                    d[key] = Value();
                    SkipWs();
                    if (AtEnd) throw Error("Unterminated object");
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == '}') { i++; return d; }
                    throw Error("Expected ',' or '}'");
                }
            }

            List<object> Arr()
            {
                var a = new List<object>();
                i++;
                SkipWs();
                if (!AtEnd && s[i] == ']') { i++; return a; }
                while (true)
                {
                    SkipWs();
                    a.Add(Value());
                    SkipWs();
                    if (AtEnd) throw Error("Unterminated array");
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == ']') { i++; return a; }
                    throw Error("Expected ',' or ']'");
                }
            }

            string Str()
            {
                var sb = new StringBuilder();
                i++;
                while (true)
                {
                    if (AtEnd) throw Error("Unterminated string");
                    char c = s[i++];
                    if (c == '"') return sb.ToString();
                    if (c != '\\') { sb.Append(c); continue; }
                    if (AtEnd) throw Error("Unterminated escape");
                    char e = s[i++];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (i + 4 > s.Length) throw Error("Bad \\u escape");
                            sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                            i += 4;
                            break;
                        default: throw Error($"Bad escape \\{e}");
                    }
                }
            }

            double Num()
            {
                int start = i;
                if (s[i] == '-') i++;
                while (i < s.Length && "0123456789+-.eE".IndexOf(s[i]) >= 0) i++;
                string t = s.Substring(start, i - start);
                if (!double.TryParse(t, NumberStyles.Float, CultureInfo.InvariantCulture, out double v))
                    throw Error($"Bad number '{t}'");
                return v;
            }
        }
    }

    /// <summary>Typed access to parsed JSON nodes, with clear errors for missing fields.</summary>
    public static class J
    {
        public static Dictionary<string, object> Obj(object node, string what = "value")
        {
            if (node is Dictionary<string, object> d) return d;
            throw new FormatException($"Expected an object for {what}.");
        }

        public static bool Has(Dictionary<string, object> o, string key) => o.ContainsKey(key) && o[key] != null;

        public static object Get(Dictionary<string, object> o, string key)
        {
            if (!o.TryGetValue(key, out object v) || v == null) throw new FormatException($"Missing \"{key}\".");
            return v;
        }

        public static string Str(Dictionary<string, object> o, string key) => (string)Get(o, key);

        public static string StrOr(Dictionary<string, object> o, string key, string fallback = null) =>
            Has(o, key) ? (string)o[key] : fallback;

        public static double Num(Dictionary<string, object> o, string key) => (double)Get(o, key);

        public static double? NumOpt(Dictionary<string, object> o, string key) =>
            Has(o, key) ? (double?)(double)o[key] : null;

        public static bool BoolOr(Dictionary<string, object> o, string key, bool fallback = false) =>
            Has(o, key) ? (bool)o[key] : fallback;

        public static bool? BoolOpt(Dictionary<string, object> o, string key) =>
            Has(o, key) ? (bool?)(bool)o[key] : null;

        public static List<object> Arr(Dictionary<string, object> o, string key) =>
            Has(o, key) ? (List<object>)o[key] : new List<object>();

        public static List<T> List<T>(Dictionary<string, object> o, string key, Func<object, T> map)
        {
            var list = new List<T>();
            foreach (var x in Arr(o, key)) list.Add(map(x));
            return list;
        }

        public static List<string> Strings(Dictionary<string, object> o, string key) => List(o, key, x => (string)x);

        public static List<string> StringsOpt(Dictionary<string, object> o, string key) =>
            Has(o, key) ? Strings(o, key) : null;

        public static Dictionary<string, double> NumberMap(Dictionary<string, object> o, string key)
        {
            var d = new Dictionary<string, double>();
            if (!Has(o, key)) return d;
            foreach (var kv in Obj(o[key], key)) d[kv.Key] = (double)kv.Value;
            return d;
        }
    }
}
