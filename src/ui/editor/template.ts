import template from '../../content/templates/new-case.json';

/** A fresh copy of the starter case: valid and playable as it stands. */
export const templateCase = (): unknown => structuredClone(template);
