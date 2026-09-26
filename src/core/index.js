/**
 * shadow-hull core: environment-neutral (Node or browser). Fonts come in as
 * ArrayBuffers; nothing here touches the filesystem.
 */
export { getManifold, Scope } from './manifold.js';
export { loadFont, textContours } from './glyph.js';
export {
  VIEWS, VIEW_NAMES, d4, d4Mat3, localToWorld, worldToLocal, howToView, transformChoices,
} from './views.js';
export { silhouette, buildTriplet, measure, viewingGuide } from './triplet.js';
export { search, compareCandidates } from './search.js';
export { toBinarySTL } from './stl.js';
