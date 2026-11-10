/**
 * How the case schema's top-level fields are grouped into editor sections.
 * A unit test checks that every schema field is in exactly one section.
 */
export interface Section {
  id: string;
  label: string;
  keys: string[];
  intro?: string;
}

export const SECTIONS: Section[] = [
  {
    id: 'basics',
    label: 'Basics',
    keys: [
      'schemaVersion',
      'id',
      'version',
      'title',
      'summary',
      'specialty',
      'difficulty',
      'estMinutes',
      'tags',
    ],
    intro: 'The case id must be unique. Bump the version when you change a published case.',
  },
  { id: 'patient', label: 'Patient', keys: ['patient'] },
  {
    id: 'brief',
    label: 'Brief',
    keys: ['brief', 'openingLine'],
    intro: 'What the learner reads before starting. {age} is replaced with the patient’s age.',
  },
  {
    id: 'baseline',
    label: 'Baseline and labs',
    keys: ['baseline', 'labs'],
    intro: 'Physiology at severity 0, before any disease process acts.',
  },
  {
    id: 'physiology',
    label: 'Disease processes',
    keys: ['processes', 'bands', 'rhythmRules'],
    intro:
      'Each process has a severity from 0 to 100 that rises at its rate and drives the effects. Treatments lower the rate while their condition holds.',
  },
  { id: 'talk', label: 'Talk', keys: ['dialogue'] },
  { id: 'exam', label: 'Examine', keys: ['exam'] },
  {
    id: 'investigations',
    label: 'Investigations',
    keys: ['investigations'],
    intro: 'Each id must be a test in the shared investigations list.',
  },
  { id: 'lines', label: 'Patient lines', keys: ['patientLines'] },
  { id: 'outcome', label: 'Outcome and diagnosis', keys: ['outcomes', 'diagnosis'] },
  {
    id: 'scoring',
    label: 'Scoring',
    keys: ['scoring'],
    intro:
      'Credit rules add their weight when passed; penalty rules subtract it. A failed critical rule caps the score.',
  },
  { id: 'teaching', label: 'Teaching and hints', keys: ['teaching', 'references', 'hints'] },
  {
    id: 'variation',
    label: 'Variation',
    keys: ['variation'],
    intro: 'Seeded changes so each run is a little different.',
  },
];

export const RAW_SECTION = 'raw';

export function sectionOfKey(key: string): string {
  return SECTIONS.find((s) => s.keys.includes(key))?.id ?? RAW_SECTION;
}
