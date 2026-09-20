import { defineRelations } from "drizzle-orm";
import { content } from "./content.js";
import { job } from "./job.js";
import { mkvdrama } from "./mkvdrama.js";
import { ouo } from "./ouo.js";
import { providerContent } from "./provider_content.js";
import { stream } from "./stream.js";
import { subtitle } from "./subtitle.js";

export const relations = defineRelations(
  { content, providerContent, mkvdrama, job, ouo, stream, subtitle },
  (r) => ({
    content: {
      providerContent: r.many.providerContent({
        from: r.content.id,
        to: r.providerContent.id,
      }),
    },
    providerContent: {
      content: r.one.content(),
      mkvdrama: r.many.mkvdrama({
        from: r.providerContent.id,
        to: r.mkvdrama.providerContentId,
      }),
    },
    mkvdrama: {
      ouo: r.one.ouo({
        from: r.mkvdrama.ouoId,
        to: r.ouo.id,
      }),
      providerContent: r.one.providerContent(),
    },
    ouo: {
      mkvdrama: r.one.mkvdrama(),
    },
    stream: {
      providerContent: r.one.providerContent({
        from: r.stream.providerContentId,
        to: r.providerContent.id,
      }),
    },
    subtitle: {
      providerContent: r.one.providerContent({
        from: r.subtitle.providerContentId,
        to: r.providerContent.id,
      }),
    },
  }),
);
