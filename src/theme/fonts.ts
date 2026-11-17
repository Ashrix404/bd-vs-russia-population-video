import { loadFont as loadInstrumentSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";

const { fontFamily: instrumentSerifFamily } = loadInstrumentSerif("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

loadInstrumentSerif("italic", {
  weights: ["400"],
  subsets: ["latin"],
});

const { fontFamily: spaceGroteskFamily } = loadSpaceGrotesk("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

const { fontFamily: interFamily } = loadInter("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const { fontFamily: jetBrainsMonoFamily } = loadJetBrainsMono("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

export const FONTS = {
  serif: instrumentSerifFamily,
  display: spaceGroteskFamily,
  sans: interFamily,
  mono: jetBrainsMonoFamily,
} as const;

export {
  instrumentSerifFamily,
  spaceGroteskFamily,
  interFamily,
  jetBrainsMonoFamily,
};

export type FontTokens = typeof FONTS;
