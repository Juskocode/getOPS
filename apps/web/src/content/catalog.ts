import { flashcardCatalogSchema } from "@getops/contracts";
import rawCatalog from "../../../../content/flashcards.json";

export const flashcardCatalog = flashcardCatalogSchema.parse(rawCatalog);
export const flashcards = flashcardCatalog.cards;
export const flashcardsById = new Map(flashcards.map((card) => [card.id, card]));
