import catalog from "../../../../../content/bejeweled/praise.v1.json";
import type { Frame } from "../../../../server/src/bejeweled-engine";
import type { LearningSpeechMoment } from "../../shared/experience/learning-speech";
export type GemPraise = LearningSpeechMoment & { id: string; kind: string };
export const GEM_PRAISES: GemPraise[] = catalog.phrases.map(phrase => ({
  ...phrase, bilingualAudioSrc: "/audio/bejeweled/praise/" + phrase.id + ".mp3",
}));
export function createGemPraisePicker(random = Math.random) {
  let previous = "";
  return (frame: Frame): GemPraise => {
    const specials: string[] = [...(frame.blasts ?? []).map(blast => blast.kind),
      ...frame.created.map(index => frame.board[index]?.special).filter((value): value is NonNullable<typeof value> => Boolean(value))];
    const kind = ["nova", "cube", "star", "flame"].find(value => specials.includes(value))
      ?? (frame.cascade > 1 ? "cascade" : "match");
    const group = GEM_PRAISES.filter(praise => praise.kind === kind);
    const fresh = group.filter(praise => praise.id !== previous);
    const choices = fresh.length ? fresh : group;
    const chosen = choices[Math.floor(random() * choices.length)]!;
    previous = chosen.id; return chosen;
  };
}
