import type { Item } from "@prisma/client";
import { hay, isNeutral, families } from "@/lib/garment";
import { pieceKind, sleeveLength } from "@/lib/kinds";
import { shoeKind, streetKind } from "@/lib/shoes";

export type Gap = {
  key: string;
  /** What is missing, in plain words. */
  label: string;
  /** Why it matters for this closet and this weather. */
  why: string;
  /** Higher comes first. */
  priority: number;
};

/** Cut and branding that read as gym kit. Fabric alone does not: a nylon chore jacket is not sportswear. */
const sporty = (item: Item) => /athletic|performance|track|training|soccer|team|warm-up/.test(hay(item));

const DARK_NEUTRALS = ["navy", "black", "charcoal", "grey", "gray"];

/**
 * What the closet cannot do yet. Every gap is a thing the pairing rules keep reaching
 * for and not finding: a shell for the rain, a plain long sleeve for a 60° day, a dark
 * plain trouser. The list is ranked; the shop suggester writes to it. No denim: the
 * wearer does not like it.
 */
export function closetGaps(items: Item[]): Gap[] {
  const live = items.filter((item) => item.imagePath);
  const tops = live.filter((item) => item.category === "top");
  const bottoms = live.filter((item) => item.category === "bottom");
  const outers = live.filter((item) => item.category === "outer");
  const shoes = live.filter((item) => item.category === "shoes");
  const gaps: Gap[] = [];

  const rainShells = outers.filter((item) => item.rainOk && ["jacket", "coat"].includes(pieceKind(item)));
  if (!rainShells.length) {
    gaps.push({
      key: "rain shell",
      label: "A jacket that can take rain",
      why: "Winter here is 50s and wet. Nothing in the closet keeps a layer dry, so on a rainy day the pick has to leave every jacket at home.",
      priority: 10,
    });
  } else if (rainShells.every(sporty)) {
    gaps.push({
      key: "rain shell",
      label: "A rain-capable jacket that is not gym kit: a waxed cotton chore jacket in navy or olive",
      why: `The only jacket that takes rain is ${rainShells[0].name}, which reads as sportswear and fights a polo, a henley, or the oxford. Every wet day and every foggy morning would carry it.`,
      priority: 9,
    });
  }

  const plainLongSleeves = tops.filter(
    (item) =>
      sleeveLength(item) === "long" &&
      ["tee", "henley", "shirt"].includes(pieceKind(item)) &&
      !/dri-fit|dri fit|performance|soccer|jersey/.test(hay(item)),
  );
  if (plainLongSleeves.length < 4) {
    gaps.push({
      key: "long-sleeve base",
      label: "A plain long-sleeve tee or henley in a neutral",
      why: `A 58° to 68° day wants a long sleeve alone, no layer. The closet has ${plainLongSleeves.length} that are not athletic, so those days repeat fast.`,
      priority: 8,
    });
  }

  const lightShell = outers.some((item) => ["jacket"].includes(pieceKind(item)) && item.warmth <= 3 && !sporty(item));
  if (!lightShell) {
    gaps.push({
      key: "light shell",
      label: "A light unlined jacket or overshirt",
      why: "Foggy 54° mornings that turn into 70° afternoons want one layer you can take off. A chore coat or overshirt over a tee does that; a hoodie does not come off as cleanly.",
      priority: 8,
    });
  }

  const darkPant = bottoms.some(
    (item) =>
      ["chino", "dress pant", "work pant", "cargo pant", "jean"].includes(pieceKind(item)) &&
      families(item).some((c) => DARK_NEUTRALS.includes(c)),
  );
  if (!darkPant) {
    gaps.push({
      key: "dark pant",
      label: "A navy or charcoal chino",
      why: "A dark plain trouser sits under every light top and every polo. The closet's plain pants are khaki, sand, and mustard, so a light tee has no dark leg to sit on.",
      priority: 7,
    });
  }

  const everydaySneakers = shoes.filter((item) => streetKind(item) === "sneaker");
  const wetShoe = shoes.some((item) => item.rainOk && shoeKind(item) !== "sandal");
  if (everydaySneakers.length < 2) {
    gaps.push({
      key: "second sneaker",
      label: "A second everyday sneaker in canvas or a synthetic, white or black",
      why: everydaySneakers.length
        ? "One clean sneaker goes out with almost every look. A second pair rests it and gives dark trousers a dark shoe."
        : "There is no everyday sneaker in the closet. Two pairs, one light and one dark, cover every trouser.",
      priority: 7,
    });
  } else if (!wetShoe) {
    gaps.push({
      key: "rain shoe",
      label: "A shoe that can get wet",
      why: "Every pair in the closet is knit, mesh, or open. A rainy day has nothing to put on the feet.",
      priority: 7,
    });
  }

  const crewSweater = live.some(
    (item) => pieceKind(item) === "sweater" && sleeveLength(item) === "long" && item.warmth <= 3 && isNeutral(families(item)),
  );
  if (!crewSweater) {
    gaps.push({
      key: "crewneck sweater",
      label: "A plain crewneck sweater in navy or grey",
      why: "The mid layer between a tee and a jacket. It goes over an oxford with the collar out, over a tee under a jacket, or alone on a 55° day.",
      priority: 6,
    });
  }

  const coat = outers.some((item) => pieceKind(item) === "coat" || (item.warmth >= 4 && item.rainOk));
  if (!coat) {
    gaps.push({
      key: "winter coat",
      label: "A real coat for January",
      why: "The warmest thing in the closet is a fleece hoodie. A 45° rainy morning wants a coat over a sweater.",
      priority: 5,
    });
  }

  const shorts = bottoms.filter((item) => ["short", "athletic short"].includes(pieceKind(item)));
  const plainShorts = shorts.filter((item) => pieceKind(item) === "short" && !/stripe|linen/.test(hay(item)));
  if (shorts.length && plainShorts.length < 1) {
    gaps.push({
      key: "plain shorts",
      label: "A plain chino short in navy or olive",
      why: "The hot-day shorts are athletic, striped, or linen. One plain dark short takes a tee or a polo without reading as gym or beach.",
      priority: 4,
    });
  }

  const polos = tops.filter((item) => pieceKind(item) === "polo").length;
  const tees = tops.filter((item) => pieceKind(item) === "tee").length;
  if (polos >= tees + 3) {
    gaps.push({
      key: "plain tees",
      label: "Two heavyweight plain tees, white and black",
      why: `The closet has ${polos} polos and ${tees} plain tees. Tees are what actually gets worn on a campus day, and a heavy plain one holds its shape under a jacket.`,
      priority: 4,
    });
  }

  return gaps.sort((a, b) => b.priority - a.priority);
}
