/**
 * The typefaces of the app, all bundled (nothing is loaded from the internet) and all under the
 * SIL Open Font License. The interface uses the system font, with Inter where there is none. The
 * writing surface uses the face of the style the writer chose in the settings (`fonts.ts`).
 */
// Inter: the interface's fallback where the system has no font of its own.
import '@fontsource-variable/inter'
import '@fontsource-variable/inter/wght-italic.css'
// Libertinus Serif and Sans, the writing faces (the faces of the PDF's default serif).
import '@fontsource/libertinus-serif/latin-400.css'
import '@fontsource/libertinus-serif/latin-400-italic.css'
import '@fontsource/libertinus-serif/latin-600.css'
import '@fontsource/libertinus-serif/latin-600-italic.css'
import '@fontsource/libertinus-serif/latin-700.css'
import '@fontsource/libertinus-serif/latin-700-italic.css'
import '@fontsource/libertinus-sans/latin-400.css'
import '@fontsource/libertinus-sans/latin-400-italic.css'
import '@fontsource/libertinus-sans/latin-700.css'
// IBM Plex Mono: Latin and Latin Extended, regular, semibold and bold.
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-400-italic.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-600-italic.css'
import '@fontsource/ibm-plex-mono/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-700-italic.css'
import '@fontsource/ibm-plex-mono/latin-ext-400.css'
import '@fontsource/ibm-plex-mono/latin-ext-400-italic.css'
import '@fontsource/ibm-plex-mono/latin-ext-700.css'
