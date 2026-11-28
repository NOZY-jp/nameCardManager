/** 名刺 CRUD・検索のサーバー側処理（Drizzle + postgres.js）。 */
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  contactMethods,
  nameCardImages,
  nameCardRelationships,
  nameCards,
  nameCardTags,
  relationships,
  tags,
} from "@/db/schema";
import { getDb } from "@/lib/db/client";

export type ContactInput = {
  type: string;
  value: string;
  is_primary: boolean;
};

export type NameCardInput = {
  first_name: string;
  last_name: string;
  first_name_kana: string | null;
  last_name_kana: string | null;
  company_name: string | null;
  department: string | null;
  position: string | null;
  image_paths: string[];
  met_notes: string | null;
  memo: string | null;
  contact_methods: ContactInput[];
  relationship_ids: number[];
  tag_ids: number[];
};

export type NameCardPatch = Partial<Omit<NameCardInput, "image_paths">>;

const SORT_FIELDS = {
  created_at: nameCards.createdAt,
  updated_at: nameCards.updatedAt,
  last_name: nameCards.lastName,
  first_name: nameCards.firstName,
  last_name_kana: nameCards.lastNameKana,
  first_name_kana: nameCards.firstNameKana,
} as const;

export type SortField = keyof typeof SORT_FIELDS;

export class ServiceError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
  }
}

function sortColumn(sortBy: string) {
  if (!(sortBy in SORT_FIELDS)) {
    return null;
  }
  return SORT_FIELDS[sortBy as SortField];
}

/** ユーザーの Relationship 全件から full_path を作る（N+1 回避）。 */
async function relationshipPaths(userId: number): Promise<Map<number, string>> {
  const db = getDb();
  const rows = await db
    .select({
      id: relationships.id,
      parentId: relationships.parentId,
      name: relationships.name,
    })
    .from(relationships)
    .where(eq(relationships.userId, userId));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const paths = new Map<number, string>();
  const build = (id: number, seen: Set<number>): string => {
    const cached = paths.get(id);
    if (cached) return cached;
    const row = byId.get(id);
    if (!row || seen.has(id)) return "";
    seen.add(id);
    const parent = row.parentId ? build(row.parentId, seen) : "";
    const path = parent ? `${parent}/${row.name}` : row.name;
    paths.set(id, path);
    return path;
  };
  for (const row of rows) build(row.id, new Set());
  return paths;
}

type BaseRow = typeof nameCards.$inferSelect;

async function buildResponses(
  userId: number,
  rows: BaseRow[],
  mode: "list" | "search",
) {
  const db = getDb();
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];

  const [images, contacts, tagRows, relRows, paths] = await Promise.all([
    db
      .select()
      .from(nameCardImages)
      .where(inArray(nameCardImages.nameCardId, ids))
      .orderBy(asc(nameCardImages.position)),
    db
      .select()
      .from(contactMethods)
      .where(inArray(contactMethods.nameCardId, ids)),
    db
      .select({
        nameCardId: nameCardTags.nameCardId,
        id: tags.id,
        name: tags.name,
      })
      .from(nameCardTags)
      .innerJoin(tags, eq(tags.id, nameCardTags.tagId))
      .where(inArray(nameCardTags.nameCardId, ids)),
    db
      .select({
        nameCardId: nameCardRelationships.nameCardId,
        id: relationships.id,
        name: relationships.name,
        parentId: relationships.parentId,
      })
      .from(nameCardRelationships)
      .innerJoin(
        relationships,
        eq(relationships.id, nameCardRelationships.relationshipId),
      )
      .where(inArray(nameCardRelationships.nameCardId, ids)),
    relationshipPaths(userId),
  ]);

  const byCard = <T extends { nameCardId: number }>(items: T[]) => {
    const map = new Map<number, T[]>();
    for (const item of items) {
      const list = map.get(item.nameCardId) ?? [];
      list.push(item);
      map.set(item.nameCardId, list);
    }
    return map;
  };
  const imagesByCard = byCard(images);
  const contactsByCard = byCard(contacts);
  const tagsByCard = byCard(tagRows);
  const relsByCard = byCard(relRows);

  return rows.map((row) => {
    const cardImages = (imagesByCard.get(row.id) ?? []).map((image) => ({
      id: image.id,
      image_path: image.imagePath,
      position: image.position,
      created_at: image.createdAt.toISOString(),
    }));
    const base = {
      id: row.id,
      user_id: row.userId,
      first_name: row.firstName,
      last_name: row.lastName,
      first_name_kana: row.firstNameKana,
      last_name_kana: row.lastNameKana,
      company_name: row.companyName,
      department: row.department,
      position: row.position,
      met_notes: row.metNotes,
      memo: row.memo,
      contact_methods: (contactsByCard.get(row.id) ?? []).map((contact) => ({
        id: contact.id,
        type: contact.type,
        value: contact.value,
        is_primary: contact.isPrimary,
      })),
      relationships: (relsByCard.get(row.id) ?? []).map((rel) => ({
        id: rel.id,
        name: rel.name,
        parent_id: rel.parentId,
        full_path: paths.get(rel.id) ?? rel.name,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
      })),
      tags: (tagsByCard.get(row.id) ?? []).map((tag) => ({
        id: tag.id,
        name: tag.name,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
      })),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
    if (mode === "search") {
      return {
        ...base,
        image_path: cardImages[0]?.image_path ?? null,
      };
    }
    return { ...base, images: cardImages };
  });
}

async function assertOwned(userId: number, ncId: number): Promise<BaseRow> {
  const db = getDb();
  const rows = await db
    .select()
    .from(nameCards)
    .where(and(eq(nameCards.id, ncId), eq(nameCards.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ServiceError(404, "Namecard not found");
  return row;
}

async function validateRelationships(userId: number, ids: number[]) {
  if (ids.length === 0) return;
  const db = getDb();
  const rows = await db
    .select({ id: relationships.id, userId: relationships.userId })
    .from(relationships)
    .where(inArray(relationships.id, ids));
  const found = new Map(rows.map((row) => [row.id, row.userId]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ServiceError(
      400,
      `Relationship not found: ${missing.join(", ")}`,
    );
  }
  const foreign = ids.filter((id) => found.get(id) !== userId);
  if (foreign.length > 0) {
    throw new ServiceError(400, `Relationship not found: ${foreign[0]}`);
  }
}

async function validateTags(userId: number, ids: number[]) {
  if (ids.length === 0) return;
  const db = getDb();
  const rows = await db
    .select({ id: tags.id, userId: tags.userId })
    .from(tags)
    .where(inArray(tags.id, ids));
  const found = new Map(rows.map((row) => [row.id, row.userId]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ServiceError(400, `Tag not found: ${missing.join(", ")}`);
  }
  const foreign = ids.filter((id) => found.get(id) !== userId);
  if (foreign.length > 0) {
    throw new ServiceError(400, `Tag not found: ${foreign[0]}`);
  }
}

export async function listNameCards(
  userId: number,
  params: {
    page: number;
    perPage: number;
    sortBy: string;
    order: string;
    tagId?: number;
    relationshipId?: number;
  },
) {
  const column = sortColumn(params.sortBy);
  if (!column) {
    throw new ServiceError(
      422,
      `Invalid sort_by field: ${params.sortBy}. Allowed: ${Object.keys(SORT_FIELDS).sort().join(", ")}`,
    );
  }
  const db = getDb();
  const conditions = [eq(nameCards.userId, userId)];
  if (params.tagId !== undefined) {
    conditions.push(
      inArray(
        nameCards.id,
        db
          .select({ id: nameCardTags.nameCardId })
          .from(nameCardTags)
          .where(eq(nameCardTags.tagId, params.tagId)),
      ),
    );
  }
  if (params.relationshipId !== undefined) {
    conditions.push(
      inArray(
        nameCards.id,
        db
          .select({ id: nameCardRelationships.nameCardId })
          .from(nameCardRelationships)
          .where(
            eq(nameCardRelationships.relationshipId, params.relationshipId),
          ),
      ),
    );
  }
  const where = and(...conditions);
  const totalRows = await db
    .select({ value: count() })
    .from(nameCards)
    .where(where);
  const total = Number(totalRows[0]?.value ?? 0);
  const rows = await db
    .select()
    .from(nameCards)
    .where(where)
    .orderBy(params.order === "asc" ? asc(column) : desc(column))
    .limit(params.perPage)
    .offset((params.page - 1) * params.perPage);

  const items = await buildResponses(userId, rows, "list");
  return {
    items,
    total,
    page: params.page,
    per_page: params.perPage,
    total_pages: params.perPage > 0 ? Math.ceil(total / params.perPage) : 0,
  };
}

export async function getNameCard(userId: number, ncId: number) {
  const row = await assertOwned(userId, ncId);
  const [item] = await buildResponses(userId, [row], "list");
  return item;
}

export async function createNameCard(userId: number, input: NameCardInput) {
  await validateRelationships(userId, input.relationship_ids);
  await validateTags(userId, input.tag_ids);
  const db = getDb();
  const createdId = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(nameCards)
      .values({
        userId,
        firstName: input.first_name,
        lastName: input.last_name,
        firstNameKana: input.first_name_kana,
        lastNameKana: input.last_name_kana,
        companyName: input.company_name,
        department: input.department,
        position: input.position,
        metNotes: input.met_notes,
        memo: input.memo,
      })
      .returning({ id: nameCards.id });
    const id = inserted[0]?.id;
    if (!id) throw new Error("failed to create namecard");
    if (input.image_paths.length > 0) {
      await tx.insert(nameCardImages).values(
        input.image_paths.map((path, index) => ({
          nameCardId: id,
          imagePath: path,
          position: index,
        })),
      );
    }
    if (input.contact_methods.length > 0) {
      await tx.insert(contactMethods).values(
        input.contact_methods.map((contact) => ({
          nameCardId: id,
          type: contact.type,
          value: contact.value,
          isPrimary: contact.is_primary,
        })),
      );
    }
    if (input.relationship_ids.length > 0) {
      await tx.insert(nameCardRelationships).values(
        input.relationship_ids.map((relationshipId) => ({
          nameCardId: id,
          relationshipId,
        })),
      );
    }
    if (input.tag_ids.length > 0) {
      await tx
        .insert(nameCardTags)
        .values(input.tag_ids.map((tagId) => ({ nameCardId: id, tagId })));
    }
    return id;
  });
  return getNameCard(userId, createdId);
}

export async function updateNameCard(
  userId: number,
  ncId: number,
  patch: NameCardPatch,
) {
  await assertOwned(userId, ncId);
  if (patch.relationship_ids) {
    await validateRelationships(userId, patch.relationship_ids);
  }
  if (patch.tag_ids) {
    await validateTags(userId, patch.tag_ids);
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    const values: Partial<typeof nameCards.$inferInsert> = {
      updatedAt: new Date(),
    };
    const map = [
      ["first_name", "firstName"],
      ["last_name", "lastName"],
      ["first_name_kana", "firstNameKana"],
      ["last_name_kana", "lastNameKana"],
      ["company_name", "companyName"],
      ["department", "department"],
      ["position", "position"],
      ["met_notes", "metNotes"],
      ["memo", "memo"],
    ] as const;
    for (const [key, column] of map) {
      if (Object.hasOwn(patch, key)) {
        values[column] = patch[key] as never;
      }
    }
    await tx.update(nameCards).set(values).where(eq(nameCards.id, ncId));

    if (patch.relationship_ids) {
      await tx
        .delete(nameCardRelationships)
        .where(eq(nameCardRelationships.nameCardId, ncId));
      if (patch.relationship_ids.length > 0) {
        await tx.insert(nameCardRelationships).values(
          patch.relationship_ids.map((relationshipId) => ({
            nameCardId: ncId,
            relationshipId,
          })),
        );
      }
    }
    if (patch.tag_ids) {
      await tx.delete(nameCardTags).where(eq(nameCardTags.nameCardId, ncId));
      if (patch.tag_ids.length > 0) {
        await tx
          .insert(nameCardTags)
          .values(patch.tag_ids.map((tagId) => ({ nameCardId: ncId, tagId })));
      }
    }
    if (patch.contact_methods) {
      await tx
        .delete(contactMethods)
        .where(eq(contactMethods.nameCardId, ncId));
      if (patch.contact_methods.length > 0) {
        await tx.insert(contactMethods).values(
          patch.contact_methods.map((contact) => ({
            nameCardId: ncId,
            type: contact.type,
            value: contact.value,
            isPrimary: contact.is_primary,
          })),
        );
      }
    }
  });
  return getNameCard(userId, ncId);
}

export async function deleteNameCard(userId: number, ncId: number) {
  await assertOwned(userId, ncId);
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(contactMethods).where(eq(contactMethods.nameCardId, ncId));
    await tx.delete(nameCardImages).where(eq(nameCardImages.nameCardId, ncId));
    await tx
      .delete(nameCardRelationships)
      .where(eq(nameCardRelationships.nameCardId, ncId));
    await tx.delete(nameCardTags).where(eq(nameCardTags.nameCardId, ncId));
    await tx.delete(nameCards).where(eq(nameCards.id, ncId));
  });
}

function normalizeKana(text: string): { hiragana: string; katakana: string } {
  let hiragana = "";
  let katakana = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x30a1 && cp <= 0x30f6) {
      hiragana += String.fromCodePoint(cp - 0x60);
      katakana += ch;
    } else if (cp >= 0x3041 && cp <= 0x3096) {
      hiragana += ch;
      katakana += String.fromCodePoint(cp + 0x60);
    } else {
      hiragana += ch;
      katakana += ch;
    }
  }
  return { hiragana, katakana };
}

export type SearchParams = {
  q?: string;
  tagIds: number[];
  relationshipIds: number[];
  createdAtStart?: Date;
  createdAtEnd?: Date;
  updatedAtStart?: Date;
  updatedAtEnd?: Date;
  page: number;
  perPage: number;
  sortBy: string;
  order: string;
};

export async function searchNameCards(userId: number, params: SearchParams) {
  const sortNames: Record<string, string> = {
    created_at: "created_at",
    updated_at: "updated_at",
    last_name: "last_name",
    first_name: "first_name",
    last_name_kana: "last_name_kana",
    first_name_kana: "first_name_kana",
  };
  const sortName = sortNames[params.sortBy] ?? "updated_at";
  const order = params.order === "asc" ? sql.raw("asc") : sql.raw("desc");
  const db = getDb();
  const keyword = params.q?.trim() ?? "";

  const textFilter =
    keyword.length > 0
      ? (() => {
          const { hiragana, katakana } = normalizeKana(keyword);
          // OR を 1 本にまとめると GIN 索引が使われないため、列ごとの LIKE を UNION する。
          const branches = [
            sql`SELECT id FROM name_cards WHERE user_id = ${userId} AND lower(first_name) LIKE '%' || lower(${keyword}) || '%'`,
            sql`SELECT id FROM name_cards WHERE user_id = ${userId} AND lower(last_name) LIKE '%' || lower(${keyword}) || '%'`,
            sql`SELECT id FROM name_cards WHERE user_id = ${userId} AND lower(first_name_kana) LIKE '%' || lower(${hiragana}) || '%'`,
            sql`SELECT id FROM name_cards WHERE user_id = ${userId} AND lower(first_name_kana) LIKE '%' || lower(${katakana}) || '%'`,
            sql`SELECT id FROM name_cards WHERE user_id = ${userId} AND lower(last_name_kana) LIKE '%' || lower(${hiragana}) || '%'`,
            sql`SELECT id FROM name_cards WHERE user_id = ${userId} AND lower(last_name_kana) LIKE '%' || lower(${katakana}) || '%'`,
            sql`SELECT id FROM name_cards WHERE user_id = ${userId} AND lower(memo) LIKE '%' || lower(${keyword}) || '%'`,
            sql`SELECT id FROM name_cards WHERE user_id = ${userId} AND lower(met_notes) LIKE '%' || lower(${keyword}) || '%'`,
            sql`SELECT nc_id FROM rel_tree WHERE lower(name) LIKE '%' || lower(${keyword}) || '%'`,
            sql`SELECT name_card_id FROM contact_methods WHERE value ILIKE ${`%${keyword}%`}`,
          ];
          return sql`AND nc.id IN (${sql.join(branches, sql` UNION `)})`;
        })()
      : sql``;

  const tagFilter =
    params.tagIds.length > 0
      ? sql`AND nc.id IN (SELECT name_card_id FROM name_card_tags WHERE tag_id IN (${sql.join(
          params.tagIds.map((id) => sql`${id}`),
          sql`, `,
        )}))`
      : sql``;
  const relFilter =
    params.relationshipIds.length > 0
      ? sql`AND nc.id IN (SELECT name_card_id FROM name_card_relationships WHERE relationship_id IN (${sql.join(
          params.relationshipIds.map((id) => sql`${id}`),
          sql`, `,
        )}))`
      : sql``;
  const createdStart = params.createdAtStart
    ? sql`AND nc.created_at >= ${params.createdAtStart}`
    : sql``;
  const createdEnd = params.createdAtEnd
    ? sql`AND nc.created_at <= ${params.createdAtEnd}`
    : sql``;
  const updatedStart = params.updatedAtStart
    ? sql`AND nc.updated_at >= ${params.updatedAtStart}`
    : sql``;
  const updatedEnd = params.updatedAtEnd
    ? sql`AND nc.updated_at <= ${params.updatedAtEnd}`
    : sql``;

  const whereClause = sql`
    WHERE nc.user_id = ${userId}
    ${textFilter}
    ${tagFilter}
    ${relFilter}
    ${createdStart}
    ${createdEnd}
    ${updatedStart}
    ${updatedEnd}`;

  // 総件数は別クエリで数える（window count は結果 0 件のページで 0 になるため）。
  const [rows, countRows] = await Promise.all([
    db.execute(sql`
      WITH RECURSIVE rel_tree AS (
        SELECT ncr.name_card_id AS nc_id, r.id, r.parent_id, r.name
        FROM name_card_relationships ncr
        JOIN relationships r ON r.id = ncr.relationship_id
        UNION ALL
        SELECT rt.nc_id, r.id, r.parent_id, r.name
        FROM rel_tree rt JOIN relationships r ON r.id = rt.parent_id
      )
      SELECT nc.*
      FROM name_cards nc
      ${whereClause}
      ORDER BY ${sql.raw(`nc.${sortName}`)} ${order}
      LIMIT ${params.perPage} OFFSET ${(params.page - 1) * params.perPage}
    `),
    db.execute(sql`
      WITH RECURSIVE rel_tree AS (
        SELECT ncr.name_card_id AS nc_id, r.id, r.parent_id, r.name
        FROM name_card_relationships ncr
        JOIN relationships r ON r.id = ncr.relationship_id
        UNION ALL
        SELECT rt.nc_id, r.id, r.parent_id, r.name
        FROM rel_tree rt JOIN relationships r ON r.id = rt.parent_id
      )
      SELECT count(*)::int AS total
      FROM name_cards nc
      ${whereClause}
    `),
  ]);

  const total = Number(
    (countRows as unknown as Array<Record<string, unknown>>)[0]?.total ?? 0,
  );

  const rawRows = rows as unknown as Array<Record<string, unknown>>;
  const ids = rawRows.map((row) => Number(row.id));
  const base: BaseRow[] = [];
  if (ids.length > 0) {
    const found = await db
      .select()
      .from(nameCards)
      .where(inArray(nameCards.id, ids));
    const byId = new Map(found.map((row) => [row.id, row]));
    for (const id of ids) {
      const row = byId.get(id);
      if (row) base.push(row);
    }
  }
  const items = await buildResponses(userId, base, "search");
  return {
    items,
    total,
    page: params.page,
    per_page: params.perPage,
    total_pages: params.perPage > 0 ? Math.ceil(total / params.perPage) : 0,
  };
}
