import { defineRelations } from "drizzle-orm";
import { supporter } from "./supporter.js";
export const relations = defineRelations({ supporter }, (r) => ({}));
