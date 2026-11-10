// Minimal stand-ins for the UnityEngine, uGUI and NUnit members the Unity
// scripts use, with Unity's signatures, so they can be compiled in CI.
// Never shipped: Unity provides the real assemblies.
using System;
using System.Collections;

namespace UnityEngine
{
    public class Object { }
    public class Component : Object { }
    public class Behaviour : Component { }
    public class MonoBehaviour : Behaviour { }

    public static class Debug
    {
        public static void Log(object message) { }
    }

    public static class Application
    {
        public static string streamingAssetsPath => "";
    }

    public static class Time
    {
        public static float deltaTime => 0f;
        public static float unscaledDeltaTime => 0f;
        public static float unscaledTime => 0f;
    }

    public static class Mathf
    {
        public static float Repeat(float t, float length) => t % length;
    }

    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a) { this.r = r; this.g = g; this.b = b; this.a = a; }
    }

    public struct Color32
    {
        public byte r, g, b, a;
        public Color32(byte r, byte g, byte b, byte a) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static implicit operator Color(Color32 c) => new Color(c.r / 255f, c.g / 255f, c.b / 255f, c.a / 255f);
    }

    [AttributeUsage(AttributeTargets.Field)]
    public class TooltipAttribute : Attribute { public TooltipAttribute(string tooltip) { } }

    [AttributeUsage(AttributeTargets.Field)]
    public class RangeAttribute : Attribute { public RangeAttribute(float min, float max) { } }

    [AttributeUsage(AttributeTargets.Field, AllowMultiple = true)]
    public class HeaderAttribute : Attribute { public HeaderAttribute(string header) { } }
}

namespace UnityEngine.UI
{
    public class Text : MonoBehaviour
    {
        public virtual string text { get; set; }
        public virtual Color color { get; set; }
    }
}

namespace NUnit.Framework
{
    [AttributeUsage(AttributeTargets.Method)]
    public class TestAttribute : Attribute { }

    public static class Assert
    {
        public static void IsTrue(bool condition, string message, params object[] args) { }
        public static void IsNotEmpty(IEnumerable collection, string message, params object[] args) { }
        public static void AreEqual(double expected, double actual, double delta, string message, params object[] args) { }
        public static void AreEqual(object expected, object actual) { }
    }
}
